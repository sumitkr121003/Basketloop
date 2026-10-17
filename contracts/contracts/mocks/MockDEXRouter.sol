// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IUniswapV2Router02.sol";

contract MockDEXRouter is IUniswapV2Router02 {
    using SafeERC20 for IERC20;

    // Exchange rate: 10000 = 1.0x (1:1), 20000 = 2.0x, 5000 = 0.5x
    // This multiplier is applied AFTER decimal normalisation, so 10000 means
    // "1 USD of tokenIn = 1 USD of tokenOut" regardless of each token's decimals.
    uint256 public rateMultiplierBps = 10000;
    bool public shouldFailSwaps = false;

    error SlippageExceeded(uint256 expected, uint256 minimum);
    error ForcedSwapFailure();

    function setRateMultiplier(uint256 _rateMultiplierBps) external {
        rateMultiplierBps = _rateMultiplierBps;
    }

    function setShouldFailSwaps(bool _fail) external {
        shouldFailSwaps = _fail;
    }

    // ---------------------------------------------------------------------------
    // Internal helper: normalise amountIn from tokenIn decimals to tokenOut
    // decimals and apply rateMultiplierBps.
    //
    // Previous bug: amountOut = (amountIn * rate) / 10000
    //   For 60 USDC (6 dec) → WETH (18 dec):
    //     amountIn_raw = 60_000_000
    //     amountOut_raw = 60_000_000   →  0.00000000006 WETH  ✗
    //
    // Fixed:
    //   If decimalsOut > decimalsIn:  amountOut = amountIn * 10^(out-in) * rate / 10000
    //   If decimalsOut < decimalsIn:  amountOut = amountIn / 10^(in-out) * rate / 10000
    //   If equal:                     amountOut = amountIn * rate / 10000
    //
    //   For 60 USDC → WETH: 60_000_000 * 10^12 * 10000 / 10000 = 60e18 raw = 60 WETH  ✓
    // ---------------------------------------------------------------------------
    function _computeAmountOut(
        uint256 amountIn,
        address tokenIn,
        address tokenOut
    ) internal view returns (uint256) {
        uint8 decimalsIn  = ERC20(tokenIn).decimals();
        uint8 decimalsOut = ERC20(tokenOut).decimals();

        uint256 normalised;
        if (decimalsOut >= decimalsIn) {
            // Scale up: multiply first to preserve precision
            uint256 scalar = 10 ** (decimalsOut - decimalsIn);
            normalised = amountIn * scalar;
        } else {
            // Scale down
            uint256 scalar = 10 ** (decimalsIn - decimalsOut);
            normalised = amountIn / scalar;
        }

        return (normalised * rateMultiplierBps) / 10000;
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        override
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 1; i < path.length; i++) {
            amounts[i] = _computeAmountOut(amounts[i - 1], path[i - 1], path[i]);
        }
        return amounts;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 /* deadline */
    ) external override returns (uint256[] memory amounts) {
        if (shouldFailSwaps) {
            revert ForcedSwapFailure();
        }

        address tokenIn  = path[0];
        address tokenOut = path[path.length - 1];

        // Pull input tokens from sender
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Calculate output with decimal normalisation
        uint256 amountOut = _computeAmountOut(amountIn, tokenIn, tokenOut);

        if (amountOut < amountOutMin) {
            revert SlippageExceeded(amountOut, amountOutMin);
        }

        // Send output token directly to recipient 'to'
        IERC20(tokenOut).safeTransfer(to, amountOut);

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOut;
        return amounts;
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 /* deadline */
    ) external payable override returns (uint256[] memory amounts) {
        if (shouldFailSwaps) {
            revert ForcedSwapFailure();
        }

        address tokenOut = path[path.length - 1];
        // ETH is always 18 decimals; use _computeAmountOut via WETH or just
        // apply rate directly (ETH→18-dec token: scalar = 1 always).
        uint8 decimalsOut = ERC20(tokenOut).decimals();
        uint256 amountOut;
        if (decimalsOut >= 18) {
            amountOut = (msg.value * rateMultiplierBps) / 10000;
        } else {
            uint256 scalar = 10 ** (18 - decimalsOut);
            amountOut = (msg.value * rateMultiplierBps) / (10000 * scalar);
        }

        if (amountOut < amountOutMin) {
            revert SlippageExceeded(amountOut, amountOutMin);
        }

        IERC20(tokenOut).safeTransfer(to, amountOut);

        amounts = new uint256[](path.length);
        amounts[0] = msg.value;
        amounts[path.length - 1] = amountOut;
        return amounts;
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 /* deadline */
    ) external override returns (uint256[] memory amounts) {
        if (shouldFailSwaps) {
            revert ForcedSwapFailure();
        }

        address tokenIn = path[0];
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // tokenOut is ETH (18 decimals); normalise from tokenIn's decimals
        uint8 decimalsIn = ERC20(tokenIn).decimals();
        uint256 amountOut;
        if (decimalsIn <= 18) {
            uint256 scalar = 10 ** (18 - decimalsIn);
            amountOut = (amountIn * scalar * rateMultiplierBps) / 10000;
        } else {
            uint256 scalar = 10 ** (decimalsIn - 18);
            amountOut = (amountIn * rateMultiplierBps) / (10000 * scalar);
        }

        if (amountOut < amountOutMin) {
            revert SlippageExceeded(amountOut, amountOutMin);
        }

        (bool success, ) = to.call{value: amountOut}("");
        require(success, "ETH transfer failed");

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOut;
        return amounts;
    }

    receive() external payable {}
}
