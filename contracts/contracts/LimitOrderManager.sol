// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IUniswapV2Router02.sol";

/**
 * @title LimitOrderManager
 * @notice Trust-minimized, non-custodial on-chain limit order execution protocol.
 * @dev Escrows input tokens during open state, executes via DEX router when on-chain price condition is met,
 *      and enforces strict minimum output delivery directly to order makers.
 */
contract LimitOrderManager is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    enum OrderStatus {
        Open,      // 0: Deposited in escrow, waiting for execution
        Filled,    // 1: Successfully executed on-chain, output delivered to maker
        Cancelled, // 2: Cancelled by maker, input refunded
        Expired    // 3: Expired, input refunded to maker
    }

    struct LimitOrder {
        uint256 id;
        address maker;
        address tokenIn;      // address(0) for native ETH
        address tokenOut;     // address(0) for native ETH
        uint256 amountIn;
        uint256 minAmountOut; // Minimum output tokens maker must receive
        uint64 createdAt;
        uint64 expiresAt;     // Unix timestamp; 0 = Good 'Til Cancelled (GTC)
        OrderStatus status;
    }

    // --- State Variables ---
    uint256 public nextOrderId = 1;
    address public dexRouter;
    address public wrappedNativeToken; // WETH address used for native ETH swap paths

    mapping(uint256 => LimitOrder) public orders;
    mapping(address => uint256[]) internal _userOrders;
    uint256[] internal _allOrderIds;

    // --- Events ---
    event OrderCreated(
        uint256 indexed orderId,
        address indexed maker,
        address indexed tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint64 expiresAt
    );

    event OrderExecuted(
        uint256 indexed orderId,
        address indexed executor,
        address indexed maker,
        uint256 amountIn,
        uint256 amountOut
    );

    event OrderCancelled(uint256 indexed orderId, address indexed maker);
    event OrderExpired(uint256 indexed orderId, address indexed maker);
    event DexRouterUpdated(address indexed oldRouter, address indexed newRouter);
    event WrappedTokenUpdated(address indexed oldWrapped, address indexed newWrapped);

    // --- Errors ---
    error InvalidAddress();
    error InvalidAmount();
    error SameToken();
    error InvalidExpiry();
    error OrderNotFound(uint256 orderId);
    error NotOrderMaker(uint256 orderId, address caller);
    error OrderNotOpen(uint256 orderId);
    error OrderHasExpired(uint256 orderId, uint64 expiresAt);
    error OrderNotExpired(uint256 orderId, uint64 expiresAt);
    error PriceConditionNotMet(uint256 expectedOut, uint256 minAmountOut);
    error EthTransferFailed();

    constructor(
        address _dexRouter,
        address _wrappedNativeToken,
        address _initialOwner
    ) Ownable(_initialOwner) {
        if (_dexRouter == address(0) || _initialOwner == address(0)) {
            revert InvalidAddress();
        }
        dexRouter = _dexRouter;
        wrappedNativeToken = _wrappedNativeToken;
    }

    // --- Order Creation ---

    /**
     * @notice Places a new limit order, escrowing input tokens in the contract.
     * @param tokenIn Asset being sold (address(0) for native ETH).
     * @param tokenOut Asset being bought (address(0) for native ETH).
     * @param amountIn Amount of tokenIn to swap.
     * @param minAmountOut Minimum acceptable amount of tokenOut maker must receive.
     * @param expiresAt Unix timestamp when order expires (0 for Good 'Til Cancelled).
     */
    function createOrder(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint64 expiresAt
    ) external payable whenNotPaused nonReentrant returns (uint256 orderId) {
        if (tokenIn == tokenOut) revert SameToken();
        if (amountIn == 0 || minAmountOut == 0) revert InvalidAmount();
        if (expiresAt > 0 && expiresAt <= block.timestamp) revert InvalidExpiry();

        // 1. Escrow input asset
        if (tokenIn == address(0)) {
            if (msg.value != amountIn) revert InvalidAmount();
        } else {
            if (msg.value != 0) revert InvalidAmount();
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        }

        orderId = nextOrderId++;

        orders[orderId] = LimitOrder({
            id: orderId,
            maker: msg.sender,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            createdAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            status: OrderStatus.Open
        });

        _userOrders[msg.sender].push(orderId);
        _allOrderIds.push(orderId);

        emit OrderCreated(
            orderId,
            msg.sender,
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            expiresAt
        );
    }

    // --- Execution ---

    /**
     * @notice Executes an open limit order against the configured DEX router.
     * @dev Can be triggered by keepers, searchers, or any account when the on-chain price condition is satisfied.
     *      Output tokens are strictly delivered directly to order.maker.
     */
    function executeOrder(uint256 orderId)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 amountOut)
    {
        LimitOrder storage order = orders[orderId];
        if (order.id == 0) revert OrderNotFound(orderId);
        if (order.status != OrderStatus.Open) revert OrderNotOpen(orderId);
        if (order.expiresAt > 0 && block.timestamp > order.expiresAt) {
            revert OrderHasExpired(orderId, order.expiresAt);
        }

        // Construct path for Uniswap V2 router
        address inPath = order.tokenIn == address(0) ? wrappedNativeToken : order.tokenIn;
        address outPath = order.tokenOut == address(0) ? wrappedNativeToken : order.tokenOut;

        address[] memory path = new address[](2);
        path[0] = inPath;
        path[1] = outPath;

        // Query router output
        uint256[] memory amounts = IUniswapV2Router02(dexRouter).getAmountsOut(order.amountIn, path);
        uint256 expectedOut = amounts[1];

        // Enforce limit price condition
        if (expectedOut < order.minAmountOut) {
            revert PriceConditionNotMet(expectedOut, order.minAmountOut);
        }

        // State update before external interactions (Checks-Effects-Interactions)
        order.status = OrderStatus.Filled;

        uint256 deadline = block.timestamp + 300;

        // Execute swap with output delivered directly to maker
        if (order.tokenIn == address(0)) {
            // Native ETH -> ERC-20
            uint256[] memory executedAmounts = IUniswapV2Router02(dexRouter).swapExactETHForTokens{value: order.amountIn}(
                order.minAmountOut,
                path,
                order.maker,
                deadline
            );
            amountOut = executedAmounts[1];
        } else if (order.tokenOut == address(0)) {
            // ERC-20 -> Native ETH
            IERC20(order.tokenIn).forceApprove(dexRouter, order.amountIn);
            uint256[] memory executedAmounts = IUniswapV2Router02(dexRouter).swapExactTokensForETH(
                order.amountIn,
                order.minAmountOut,
                path,
                order.maker,
                deadline
            );
            amountOut = executedAmounts[1];
        } else {
            // ERC-20 -> ERC-20
            IERC20(order.tokenIn).forceApprove(dexRouter, order.amountIn);
            uint256[] memory executedAmounts = IUniswapV2Router02(dexRouter).swapExactTokensForTokens(
                order.amountIn,
                order.minAmountOut,
                path,
                order.maker,
                deadline
            );
            amountOut = executedAmounts[1];
        }

        emit OrderExecuted(orderId, msg.sender, order.maker, order.amountIn, amountOut);
    }

    // --- Cancellation & Refunds ---

    /**
     * @notice Cancels an open order and refunds 100% of escrowed tokens to maker.
     */
    function cancelOrder(uint256 orderId) external nonReentrant {
        LimitOrder storage order = orders[orderId];
        if (order.id == 0) revert OrderNotFound(orderId);
        if (order.maker != msg.sender) revert NotOrderMaker(orderId, msg.sender);
        if (order.status != OrderStatus.Open) revert OrderNotOpen(orderId);

        order.status = OrderStatus.Cancelled;

        _refundMaker(order.tokenIn, order.maker, order.amountIn);

        emit OrderCancelled(orderId, msg.sender);
    }

    /**
     * @notice Cancels an expired order and refunds escrowed tokens directly to maker.
     * @dev Anyone can call this to clear stale expired orders from memory.
     */
    function cancelExpiredOrder(uint256 orderId) external nonReentrant {
        LimitOrder storage order = orders[orderId];
        if (order.id == 0) revert OrderNotFound(orderId);
        if (order.status != OrderStatus.Open) revert OrderNotOpen(orderId);
        if (order.expiresAt == 0 || block.timestamp <= order.expiresAt) {
            revert OrderNotExpired(orderId, order.expiresAt);
        }

        order.status = OrderStatus.Expired;

        _refundMaker(order.tokenIn, order.maker, order.amountIn);

        emit OrderExpired(orderId, order.maker);
    }

    function _refundMaker(address token, address maker, uint256 amount) internal {
        if (token == address(0)) {
            (bool success, ) = maker.call{value: amount}("");
            if (!success) revert EthTransferFailed();
        } else {
            IERC20(token).safeTransfer(maker, amount);
        }
    }

    // --- View Helpers ---

    /**
     * @notice Inspects whether an order is currently executable by a keeper.
     */
    function canExecute(uint256 orderId)
        external
        view
        returns (bool executable, string memory reason)
    {
        LimitOrder storage order = orders[orderId];
        if (order.id == 0) return (false, "Order does not exist");
        if (order.status != OrderStatus.Open) return (false, "Order is not open");
        if (order.expiresAt > 0 && block.timestamp > order.expiresAt) {
            return (false, "Order has expired");
        }

        address inPath = order.tokenIn == address(0) ? wrappedNativeToken : order.tokenIn;
        address outPath = order.tokenOut == address(0) ? wrappedNativeToken : order.tokenOut;

        address[] memory path = new address[](2);
        path[0] = inPath;
        path[1] = outPath;

        try IUniswapV2Router02(dexRouter).getAmountsOut(order.amountIn, path) returns (uint256[] memory amounts) {
            if (amounts[1] >= order.minAmountOut) {
                return (true, "");
            } else {
                return (false, "Target price condition not met");
            }
        } catch {
            return (false, "DEX quote query failed");
        }
    }

    function getOrder(uint256 orderId) external view returns (LimitOrder memory) {
        return orders[orderId];
    }

    function getUserOrders(address user) external view returns (uint256[] memory) {
        return _userOrders[user];
    }

    function getAllOrderIds() external view returns (uint256[] memory) {
        return _allOrderIds;
    }

    // --- Admin Functions ---

    function setDexRouter(address _router) external onlyOwner {
        if (_router == address(0)) revert InvalidAddress();
        emit DexRouterUpdated(dexRouter, _router);
        dexRouter = _router;
    }

    function setWrappedToken(address _wrapped) external onlyOwner {
        emit WrappedTokenUpdated(wrappedNativeToken, _wrapped);
        wrappedNativeToken = _wrapped;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    receive() external payable {}
}
