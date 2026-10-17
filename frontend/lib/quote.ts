import { formatUnits, parseUnits } from "viem";
import { type TokenInfo } from "./tokens";
import { type TokenPrice } from "./prices";

export interface SwapQuoteParams {
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  amountIn: string;
  slippage: number; // in percent, e.g. 0.5
  prices?: Record<string, TokenPrice | null>;
  dexFeeBps?: number; // 0 for MockDEXRouter
  rateMultiplierBps?: number; // default 10000 (1:1)
  amountsOutOnChain?: bigint; // from getAmountsOut if available
  useMockPricing?: boolean; // default true for MockDEXRouter on testnet
}

export interface SwapQuoteResult {
  isValid: boolean;
  error: string | null;
  amountIn: string;
  expectedOutput: string;
  expectedOutputRaw: bigint;
  minReceived: string;
  minReceivedRaw: bigint;
  exchangeRate: string; // "1.00000"
  exchangeRateRaw: number;
  priceImpactPercent: string;
  valueInUsd: string | null;
  valueOutUsd: string | null;
  effectiveSlippage: number;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  isMockQuote: boolean;
  referenceMarketRate: string | null;
  referencePriceSource: string;
}

/**
 * Formats a numeric string with optimal precision:
 * - If value < 0.0001: shows up to 8 significant decimals (never rounds small numbers to 0.00000)
 * - If value < 1: shows up to 6 decimals
 * - If value < 1000: shows 4 decimals
 * - Otherwise: shows 2 decimals
 */
export function formatWithSmartPrecision(val: number): string {
  if (isNaN(val) || val <= 0) return "0.00";
  if (val < 0.000001) return val.toFixed(8);
  if (val < 0.0001) return val.toFixed(7);
  if (val < 0.01) return val.toFixed(6);
  if (val < 1) return val.toFixed(5);
  if (val < 100) return val.toFixed(4);
  if (val < 10000) return val.toFixed(2);
  return val.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * Decimal-normalised output calculation matching MockDEXRouter.sol:
 * _computeAmountOut(amountIn, tokenIn, tokenOut)
 *
 * If decimalsOut >= decimalsIn:
 *   scalar = 10^(decimalsOut - decimalsIn)
 *   normalised = amountIn * scalar
 * Else:
 *   scalar = 10^(decimalsIn - decimalsOut)
 *   normalised = amountIn / scalar
 *
 * return (normalised * rateMultiplierBps) / 10000
 */
export function computeMockAmountOut(
  amountInRaw: bigint,
  decimalsIn: number,
  decimalsOut: number,
  rateMultiplierBps: number = 10000
): bigint {
  if (amountInRaw <= 0n) return 0n;

  let normalised: bigint;
  if (decimalsOut >= decimalsIn) {
    const scalar = 10n ** BigInt(decimalsOut - decimalsIn);
    normalised = amountInRaw * scalar;
  } else {
    const scalar = 10n ** BigInt(decimalsIn - decimalsOut);
    normalised = amountInRaw / scalar;
  }

  return (normalised * BigInt(rateMultiplierBps)) / 10000n;
}

/**
 * Calculates the executable swap quote for MockDEXRouter on testnet.
 * Directly mirrors MockDEXRouter.sol (_computeAmountOut & getAmountsOut)
 * with exact decimal normalization and user-configured slippage.
 */
export function calculateSwapQuote({
  tokenIn,
  tokenOut,
  amountIn,
  slippage,
  prices,
  dexFeeBps = 0,
  rateMultiplierBps = 10000,
  amountsOutOnChain,
  useMockPricing = true,
}: SwapQuoteParams): SwapQuoteResult {
  const fallbackResult: SwapQuoteResult = {
    isValid: false,
    error: null,
    amountIn: amountIn || "0",
    expectedOutput: "0.00",
    expectedOutputRaw: 0n,
    minReceived: "0.00",
    minReceivedRaw: 0n,
    exchangeRate: "0.00000",
    exchangeRateRaw: 0,
    priceImpactPercent: "0.00%",
    valueInUsd: null,
    valueOutUsd: null,
    effectiveSlippage: slippage,
    tokenInSymbol: tokenIn.symbol,
    tokenOutSymbol: tokenOut.symbol,
    isMockQuote: useMockPricing,
    referenceMarketRate: null,
    referencePriceSource: "Binance / CoinGecko (Live Reference)",
  };

  const parsedAmountInNum = parseFloat(amountIn);
  if (isNaN(parsedAmountInNum) || parsedAmountInNum <= 0) {
    return { ...fallbackResult, error: "Enter an amount" };
  }

  // Same token check
  if (
    tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase() &&
    tokenIn.symbol.toUpperCase() === tokenOut.symbol.toUpperCase()
  ) {
    return { ...fallbackResult, error: "Select different tokens" };
  }

  // Validate slippage
  const safeSlippage = isNaN(slippage) || slippage < 0.05 || slippage > 50 ? 0.5 : slippage;
  const slippageMultiplierBps = BigInt(Math.floor((100 - safeSlippage) * 100));

  // --- MOCK DEX ROUTER QUOTE (Robinhood Testnet) ---
  if (useMockPricing) {
    let amountInRaw: bigint;
    try {
      amountInRaw = parseUnits(amountIn, tokenIn.decimals);
    } catch {
      return { ...fallbackResult, error: "Invalid amount formatting" };
    }

    if (amountInRaw <= 0n) {
      return { ...fallbackResult, error: "Enter an amount" };
    }

    // Use on-chain getAmountsOut if available; otherwise calculate using exact router formula
    let expectedOutputRaw: bigint;
    if (amountsOutOnChain !== undefined && amountsOutOnChain > 0n) {
      expectedOutputRaw = amountsOutOnChain;
    } else {
      expectedOutputRaw = computeMockAmountOut(
        amountInRaw,
        tokenIn.decimals,
        tokenOut.decimals,
        rateMultiplierBps
      );
    }

    // Apply slippage to get minimum received
    const minReceivedRaw = (expectedOutputRaw * slippageMultiplierBps) / 10000n;

    // Convert raw BigInt outputs back to human numbers for display
    const expectedOutFloat = parseFloat(formatUnits(expectedOutputRaw, tokenOut.decimals));
    const minReceivedFloat = parseFloat(formatUnits(minReceivedRaw, tokenOut.decimals));

    const ratePerUnit = rateMultiplierBps / 10000;

    // Retrieve reference market rate from live prices if available
    let referenceMarketRate: string | null = null;
    if (prices) {
      const pIn = prices[tokenIn.symbol.toUpperCase()]?.priceUsd;
      const pOut = prices[tokenOut.symbol.toUpperCase()]?.priceUsd;
      if (pIn && pOut && pIn > 0 && pOut > 0) {
        referenceMarketRate = formatWithSmartPrecision(pIn / pOut);
      }
    }

    return {
      isValid: true,
      error: null,
      amountIn,
      expectedOutput: formatWithSmartPrecision(expectedOutFloat),
      expectedOutputRaw,
      minReceived: formatWithSmartPrecision(minReceivedFloat),
      minReceivedRaw,
      exchangeRate: ratePerUnit.toFixed(5),
      exchangeRateRaw: ratePerUnit,
      priceImpactPercent: "0.00%",
      valueInUsd: null, // Do not show CoinGecko/Binance prices as the executable quote
      valueOutUsd: null,
      effectiveSlippage: safeSlippage,
      tokenInSymbol: tokenIn.symbol,
      tokenOutSymbol: tokenOut.symbol,
      isMockQuote: true,
      referenceMarketRate,
      referencePriceSource: "Binance / CoinGecko (Live Reference)",
    };
  }

  // --- REAL-TIME MARKET PRICE QUOTE (Fallback / Mainnet DEX Route) ---
  if (!prices) {
    return { ...fallbackResult, error: "Price data unavailable" };
  }

  const priceInObj = prices[tokenIn.symbol.toUpperCase()];
  const priceOutObj = prices[tokenOut.symbol.toUpperCase()];
  const priceIn = priceInObj?.priceUsd;
  const priceOut = priceOutObj?.priceUsd;

  if (!priceIn || !priceOut || priceIn <= 0 || priceOut <= 0) {
    return {
      ...fallbackResult,
      isValid: false,
      error: `Live market rate unavailable for ${!priceIn ? tokenIn.symbol : tokenOut.symbol}`,
    };
  }

  const feeMultiplier = (10000 - dexFeeBps) / 10000;
  const ratePerUnit = (priceIn / priceOut) * feeMultiplier;
  const expectedOutputNum = parsedAmountInNum * ratePerUnit;
  const minReceivedNum = expectedOutputNum * ((100 - safeSlippage) / 100);

  let expectedOutputRaw = 0n;
  let minReceivedRaw = 0n;
  try {
    const maxDec = Math.min(tokenOut.decimals, 18);
    expectedOutputRaw = parseUnits(expectedOutputNum.toFixed(maxDec), tokenOut.decimals);
    minReceivedRaw = parseUnits(minReceivedNum.toFixed(maxDec), tokenOut.decimals);
  } catch {
    expectedOutputRaw = 0n;
    minReceivedRaw = 0n;
  }

  return {
    isValid: true,
    error: null,
    amountIn,
    expectedOutput: formatWithSmartPrecision(expectedOutputNum),
    expectedOutputRaw,
    minReceived: formatWithSmartPrecision(minReceivedNum),
    minReceivedRaw,
    exchangeRate: formatWithSmartPrecision(ratePerUnit),
    exchangeRateRaw: ratePerUnit,
    priceImpactPercent: "<0.05%",
    valueInUsd: (parsedAmountInNum * priceIn).toFixed(2),
    valueOutUsd: (expectedOutputNum * priceOut).toFixed(2),
    effectiveSlippage: safeSlippage,
    tokenInSymbol: tokenIn.symbol,
    tokenOutSymbol: tokenOut.symbol,
    isMockQuote: false,
    referenceMarketRate: formatWithSmartPrecision(ratePerUnit),
    referencePriceSource: "Binance / CoinGecko (Live Reference)",
  };
}
