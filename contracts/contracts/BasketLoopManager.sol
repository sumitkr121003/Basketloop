// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IUniswapV2Router02.sol";

/**
 * @title BasketLoopManager
 * @notice Non-custodial recurring crypto basket investment (DCA) protocol for EVM / Orbit L2.
 * @dev Enforces deterministic time-locked pulls, zero idle balances, and atomic multi-asset execution.
 */
contract BasketLoopManager is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    enum ScheduleStatus {
        Active,     // 0: Due for execution when interval passes
        Paused,     // 1: Suspended by schedule owner
        Cancelled   // 2: Permanently terminated by schedule owner
    }

    struct BasketAsset {
        address token;          // ERC-20 asset address
        uint16 allocationBps;   // Basis points (100 bps = 1.00%, sum must = 10000)
    }

    struct Schedule {
        uint256 id;
        address owner;
        address tokenIn;
        uint256 amountInPerCycle;
        uint32 intervalSeconds;
        uint64 lastExecutedAt;
        uint16 slippageBps;
        ScheduleStatus status;
        string name;
    }

    // --- State Variables ---
    uint256 public nextScheduleId = 1;
    address public dexRouter;
    address public keeperAddress;

    mapping(uint256 => Schedule) public schedules;
    mapping(uint256 => BasketAsset[]) internal _scheduleAssets;
    mapping(address => uint256[]) internal _userSchedules;

    // --- Constants & Bounds ---
    uint16 public constant TOTAL_BPS = 10000;         // 100.00%
    uint16 public constant MIN_ALLOCATION_BPS = 100;    // 1.00%
    uint8 public constant MIN_ASSETS = 2;
    uint8 public constant MAX_ASSETS = 5;
    uint16 public constant MAX_SLIPPAGE_BPS = 500;     // 5.00%

    // --- Custom Errors ---
    error InvalidAddress();
    error InvalidAssetCount(uint256 count);
    error InvalidAllocationSum(uint256 totalBps);
    error AllocationTooSmall(uint256 bps);
    error DuplicateAsset(address token);
    error AssetCannotBeFundingToken();
    error InvalidAmount();
    error InvalidInterval(uint32 interval);
    error InvalidSlippage(uint16 slippageBps);
    error ScheduleNotFound(uint256 id);
    error NotScheduleOwner(uint256 id, address caller);
    error ScheduleNotActive(uint256 id);
    error ScheduleNotDue(uint256 id, uint256 nextDueTimestamp);
    error InsufficientAllowance(address token, uint256 required, uint256 actual);
    error InsufficientBalance(address token, uint256 required, uint256 actual);
    error UnauthorizedKeeper(address caller);
    error SwapFailed(address tokenOut);

    // --- Events ---
    event ScheduleCreated(
        uint256 indexed scheduleId,
        address indexed owner,
        address indexed tokenIn,
        uint256 amountInPerCycle,
        uint32 intervalSeconds,
        uint16 slippageBps,
        string name
    );

    event ScheduleExecuted(
        uint256 indexed scheduleId,
        address indexed owner,
        uint256 amountInProcessed,
        uint256 timestamp
    );

    event InstantBasketExecuted(
        address indexed user,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 timestamp
    );

    event SchedulePaused(uint256 indexed scheduleId, address indexed owner);
    event ScheduleResumed(uint256 indexed scheduleId, address indexed owner);
    event ScheduleCancelled(uint256 indexed scheduleId, address indexed owner);
    event KeeperUpdated(address indexed oldKeeper, address indexed newKeeper);
    event DexRouterUpdated(address indexed oldRouter, address indexed newRouter);

    constructor(
        address _dexRouter,
        address _keeperAddress,
        address _initialOwner
    ) Ownable(_initialOwner) {
        if (_dexRouter == address(0) || _initialOwner == address(0)) {
            revert InvalidAddress();
        }
        dexRouter = _dexRouter;
        keeperAddress = _keeperAddress;
    }

    // --- Modifiers ---
    modifier onlyKeeperOrOwner() {
        if (msg.sender != keeperAddress && msg.sender != owner()) {
            revert UnauthorizedKeeper(msg.sender);
        }
        _;
    }

    // --- Core External Functions ---

    /**
     * @notice Creates a new recurring investment schedule for a multi-token basket.
     */
    function createSchedule(
        string calldata name,
        address tokenIn,
        uint256 amountInPerCycle,
        uint32 intervalSeconds,
        uint16 slippageBps,
        BasketAsset[] calldata assets
    ) external whenNotPaused returns (uint256 scheduleId) {
        if (tokenIn == address(0)) revert InvalidAddress();
        if (amountInPerCycle == 0) revert InvalidAmount();
        if (intervalSeconds == 0) revert InvalidInterval(intervalSeconds);
        if (slippageBps > MAX_SLIPPAGE_BPS) revert InvalidSlippage(slippageBps);

        _validateAssets(tokenIn, assets);

        scheduleId = nextScheduleId++;

        Schedule storage s = schedules[scheduleId];
        s.id = scheduleId;
        s.owner = msg.sender;
        s.tokenIn = tokenIn;
        s.amountInPerCycle = amountInPerCycle;
        s.intervalSeconds = intervalSeconds;
        s.lastExecutedAt = uint64(block.timestamp); // First recurring run is due at lastExecutedAt + interval
        s.slippageBps = slippageBps;
        s.status = ScheduleStatus.Active;
        s.name = name;

        for (uint256 i = 0; i < assets.length; i++) {
            _scheduleAssets[scheduleId].push(assets[i]);
        }

        _userSchedules[msg.sender].push(scheduleId);

        emit ScheduleCreated(
            scheduleId,
            msg.sender,
            tokenIn,
            amountInPerCycle,
            intervalSeconds,
            slippageBps,
            name
        );
    }

    /**
     * @notice Executes a scheduled recurring basket purchase on maturity.
     * @dev Called by the authorized keeper bot or contract owner. Atomically swaps all assets.
     */
    function executeSchedule(uint256 scheduleId)
        external
        nonReentrant
        whenNotPaused
        onlyKeeperOrOwner
    {
        Schedule storage s = schedules[scheduleId];
        if (s.id == 0) revert ScheduleNotFound(scheduleId);
        if (s.status != ScheduleStatus.Active) revert ScheduleNotActive(scheduleId);

        uint256 nextDue = uint256(s.lastExecutedAt) + s.intervalSeconds;
        if (block.timestamp < nextDue) {
            revert ScheduleNotDue(scheduleId, nextDue);
        }

        BasketAsset[] storage assets = _scheduleAssets[scheduleId];

        // 1. Pull the recurring budget from user's self-custody wallet
        IERC20(s.tokenIn).safeTransferFrom(s.owner, address(this), s.amountInPerCycle);

        // 2. Execute swaps for each asset leg directly to user
        _executeBasketSwaps(s.tokenIn, s.amountInPerCycle, s.slippageBps, s.owner, assets);

        // 3. Update timestamp
        s.lastExecutedAt = uint64(block.timestamp);

        emit ScheduleExecuted(scheduleId, s.owner, s.amountInPerCycle, block.timestamp);
    }

    /**
     * @notice One-click instant purchase of an entire multi-asset basket on demand.
     */
    function executeInstantBasket(
        address tokenIn,
        uint256 amountIn,
        uint16 slippageBps,
        BasketAsset[] calldata assets
    ) external nonReentrant whenNotPaused {
        if (tokenIn == address(0)) revert InvalidAddress();
        if (amountIn == 0) revert InvalidAmount();
        if (slippageBps > MAX_SLIPPAGE_BPS) revert InvalidSlippage(slippageBps);

        _validateAssets(tokenIn, assets);

        // 1. Pull funding token from caller
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // 2. Execute swaps directly to caller
        _executeBasketSwapsCalldata(tokenIn, amountIn, slippageBps, msg.sender, assets);

        emit InstantBasketExecuted(msg.sender, tokenIn, amountIn, block.timestamp);
    }

    // --- Schedule Lifecycle Management ---

    function pauseSchedule(uint256 scheduleId) external {
        _validateOwner(scheduleId);
        Schedule storage s = schedules[scheduleId];
        if (s.status != ScheduleStatus.Active) revert ScheduleNotActive(scheduleId);
        s.status = ScheduleStatus.Paused;
        emit SchedulePaused(scheduleId, msg.sender);
    }

    function resumeSchedule(uint256 scheduleId) external {
        _validateOwner(scheduleId);
        Schedule storage s = schedules[scheduleId];
        require(s.status == ScheduleStatus.Paused, "Schedule not paused");
        s.status = ScheduleStatus.Active;
        emit ScheduleResumed(scheduleId, msg.sender);
    }

    function cancelSchedule(uint256 scheduleId) external {
        _validateOwner(scheduleId);
        Schedule storage s = schedules[scheduleId];
        require(s.status != ScheduleStatus.Cancelled, "Already cancelled");
        s.status = ScheduleStatus.Cancelled;
        emit ScheduleCancelled(scheduleId, msg.sender);
    }

    // --- View / Keeper Helpers ---

    /**
     * @notice Helper for keeper daemon and UI to check whether a schedule is currently executable.
     */
    function canExecute(uint256 scheduleId)
        external
        view
        returns (bool executable, string memory reason)
    {
        Schedule storage s = schedules[scheduleId];
        if (s.id == 0) return (false, "Schedule does not exist");
        if (s.status != ScheduleStatus.Active) return (false, "Schedule is not active");

        uint256 nextDue = uint256(s.lastExecutedAt) + s.intervalSeconds;
        if (block.timestamp < nextDue) return (false, "Schedule is not due yet");

        uint256 balance = IERC20(s.tokenIn).balanceOf(s.owner);
        if (balance < s.amountInPerCycle) return (false, "Insufficient user token balance");

        uint256 allowance = IERC20(s.tokenIn).allowance(s.owner, address(this));
        if (allowance < s.amountInPerCycle) return (false, "Insufficient contract allowance");

        return (true, "");
    }

    function getSchedule(uint256 scheduleId)
        external
        view
        returns (Schedule memory schedule, BasketAsset[] memory assets)
    {
        schedule = schedules[scheduleId];
        assets = _scheduleAssets[scheduleId];
    }

    function getUserSchedules(address user) external view returns (uint256[] memory) {
        return _userSchedules[user];
    }

    function getScheduleAssets(uint256 scheduleId)
        external
        view
        returns (BasketAsset[] memory)
    {
        return _scheduleAssets[scheduleId];
    }

    // --- Internal Logic ---

    function _validateOwner(uint256 scheduleId) internal view {
        Schedule storage s = schedules[scheduleId];
        if (s.id == 0) revert ScheduleNotFound(scheduleId);
        if (s.owner != msg.sender) revert NotScheduleOwner(scheduleId, msg.sender);
    }

    function _validateAssets(address tokenIn, BasketAsset[] calldata assets) internal pure {
        uint256 len = assets.length;
        if (len < MIN_ASSETS || len > MAX_ASSETS) {
            revert InvalidAssetCount(len);
        }

        uint256 totalBps = 0;
        for (uint256 i = 0; i < len; i++) {
            address token = assets[i].token;
            uint16 bps = assets[i].allocationBps;

            if (token == address(0)) revert InvalidAddress();
            if (token == tokenIn) revert AssetCannotBeFundingToken();
            if (bps < MIN_ALLOCATION_BPS) revert AllocationTooSmall(bps);

            // Check duplicate tokens
            for (uint256 j = 0; j < i; j++) {
                if (assets[j].token == token) {
                    revert DuplicateAsset(token);
                }
            }

            totalBps += bps;
        }

        if (totalBps != TOTAL_BPS) {
            revert InvalidAllocationSum(totalBps);
        }
    }

    function _executeBasketSwaps(
        address tokenIn,
        uint256 totalAmountIn,
        uint16 slippageBps,
        address recipient,
        BasketAsset[] storage assets
    ) internal {
        uint256 len = assets.length;
        for (uint256 i = 0; i < len; i++) {
            uint256 assetAmountIn = (totalAmountIn * assets[i].allocationBps) / TOTAL_BPS;
            _swapSingleAsset(tokenIn, assets[i].token, assetAmountIn, slippageBps, recipient);
        }
    }

    function _executeBasketSwapsCalldata(
        address tokenIn,
        uint256 totalAmountIn,
        uint16 slippageBps,
        address recipient,
        BasketAsset[] calldata assets
    ) internal {
        uint256 len = assets.length;
        for (uint256 i = 0; i < len; i++) {
            uint256 assetAmountIn = (totalAmountIn * assets[i].allocationBps) / TOTAL_BPS;
            _swapSingleAsset(tokenIn, assets[i].token, assetAmountIn, slippageBps, recipient);
        }
    }

    function _swapSingleAsset(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint16 slippageBps,
        address recipient
    ) internal {
        if (amountIn == 0) return;

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        // Query expected output from router
        uint256[] memory expectedAmounts = IUniswapV2Router02(dexRouter).getAmountsOut(amountIn, path);
        uint256 expectedOut = expectedAmounts[1];

        // Apply slippage reduction
        uint256 amountOutMin = (expectedOut * (TOTAL_BPS - slippageBps)) / TOTAL_BPS;

        // Approve router
        IERC20(tokenIn).forceApprove(dexRouter, amountIn);

        // Execute swap with output tokens sent directly to recipient
        IUniswapV2Router02(dexRouter).swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            recipient,
            block.timestamp + 300
        );
    }

    // --- Admin Functions ---

    function setKeeperAddress(address _keeper) external onlyOwner {
        emit KeeperUpdated(keeperAddress, _keeper);
        keeperAddress = _keeper;
    }

    function setDexRouter(address _router) external onlyOwner {
        if (_router == address(0)) revert InvalidAddress();
        emit DexRouterUpdated(dexRouter, _router);
        dexRouter = _router;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
