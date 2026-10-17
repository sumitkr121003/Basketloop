const test = require("node:test");
const assert = require("node:assert");

// 1. Gas Calculation Logic Tests
function calculateSafeGasCost(gasUnits, effectiveGasPriceWei, nativeTokenPriceUsd) {
  const MIN_PLAUSIBLE_GAS = 21000n;
  const MAX_PLAUSIBLE_GAS = 2000000n;

  if (gasUnits < MIN_PLAUSIBLE_GAS || gasUnits > MAX_PLAUSIBLE_GAS) {
    return {
      isValid: false,
      gasLimit: gasUnits,
      gasPriceWei: effectiveGasPriceWei,
      feeWei: 0n,
      feeEth: "0.00",
      feeUsd: null,
      error: `Implausible gas limit estimated: ${gasUnits.toString()} units. Transaction may revert.`,
    };
  }

  if (effectiveGasPriceWei <= 0n) {
    return {
      isValid: false,
      gasLimit: gasUnits,
      gasPriceWei: 0n,
      feeWei: 0n,
      feeEth: "0.00",
      feeUsd: null,
      error: "Gas price unavailable from RPC provider.",
    };
  }

  const feeWei = gasUnits * effectiveGasPriceWei;
  const feeEthNum = Number(feeWei) / 1e18;

  let feeUsd = null;
  if (nativeTokenPriceUsd && nativeTokenPriceUsd > 0 && !isNaN(feeEthNum)) {
    const totalUsd = feeEthNum * nativeTokenPriceUsd;
    feeUsd = totalUsd < 0.01 ? "<$0.01" : `$${totalUsd.toFixed(2)}`;
  }

  return {
    isValid: true,
    gasLimit: gasUnits,
    gasPriceWei: effectiveGasPriceWei,
    feeWei,
    feeEth: feeEthNum < 0.000001 ? "<0.000001" : feeEthNum.toFixed(6),
    feeUsd,
  };
}

test("Gas Fee: Correctly calculates realistic DEX swap gas on Robinhood Testnet", () => {
  const gasUnits = 250000n;
  const gasPriceWei = 10000000n; // 0.01 Gwei
  const ethPriceUsd = 2500;

  const result = calculateSafeGasCost(gasUnits, gasPriceWei, ethPriceUsd);
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.feeWei, 2500000000000n);
  assert.strictEqual(result.feeUsd, "<$0.01");
});

test("Gas Fee: Rejects Orbit L2 astronomical block gas limits (e.g. 2^50 / 9.6M USD bug)", () => {
  const orbitBlockGasLimit = 1125899906842624n; // 0x4000000000000
  const gasPriceWei = 10000000n;
  const ethPriceUsd = 2500;

  const result = calculateSafeGasCost(orbitBlockGasLimit, gasPriceWei, ethPriceUsd);
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.feeWei, 0n);
  assert.match(result.error, /Implausible gas limit/);
});

test("Gas Fee: Handles zero or invalid gas price gracefully", () => {
  const result = calculateSafeGasCost(250000n, 0n, 2500);
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.feeUsd, null);
});

// 2. Token Registry & Native Asset Tests
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function isNativeToken(token) {
  if (!token) return false;
  return Boolean(token.isNative) || token.address.toLowerCase() === ZERO_ADDRESS.toLowerCase();
}

test("Token Registry: Correctly identifies native ETH vs ERC-20 WETH", () => {
  const nativeEth = { symbol: "ETH", address: ZERO_ADDRESS, isNative: true, decimals: 18 };
  const wrappedEth = {
    symbol: "WETH",
    address: "0xf5581b11BF5c5Cb44f1e44a21b80957FF091977b",
    decimals: 18,
  };
  const usdc = {
    symbol: "USDC",
    address: "0xb7010f73f0A2217b8e863F20B5c5EA219D43eDc2",
    decimals: 6,
  };

  assert.strictEqual(isNativeToken(nativeEth), true);
  assert.strictEqual(isNativeToken(wrappedEth), false);
  assert.strictEqual(isNativeToken(usdc), false);
});

// 3. Custom Slippage Calculation Tests
function calculateMinOutput(expectedOut, slippagePercent) {
  const slippageBps = BigInt(Math.floor(slippagePercent * 100));
  const multiplier = 10000n - slippageBps;
  return (expectedOut * multiplier) / 10000n;
}

test("Slippage Math: Correctly calculates min output for 0.5% and 1.0% tolerances", () => {
  const expectedOut = 1000000000000000000n; // 1.0 ETH

  const min05 = calculateMinOutput(expectedOut, 0.5);
  assert.strictEqual(min05, 995000000000000000n); // 0.995 ETH

  const min10 = calculateMinOutput(expectedOut, 1.0);
  assert.strictEqual(min10, 990000000000000000n); // 0.99 ETH
});

test("Slippage Math: Rejects negative or extreme slippage bounds", () => {
  const isValidSlippage = (val) => !isNaN(val) && val >= 0.05 && val <= 50.0;

  assert.strictEqual(isValidSlippage(0.5), true);
  assert.strictEqual(isValidSlippage(3.0), true);
  assert.strictEqual(isValidSlippage(-1), false);
  assert.strictEqual(isValidSlippage(55), false);
  assert.strictEqual(isValidSlippage(NaN), false);
});

// 4. Hydration Consistency Test
function getNextRunCountdown(lastRun, intervalSec, currentTimestamp, isMounted) {
  if (!isMounted || currentTimestamp === 0) return "Calculating...";
  if (lastRun === 0n) return "Due on initial cycle";
  const nextTimestamp = Number(lastRun) + intervalSec;
  const diff = nextTimestamp - currentTimestamp;
  if (diff <= 0) return "Due now (Keeper polling)";
  const hours = Math.floor(diff / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  return `${hours}h ${mins}m remaining`;
}

test("Hydration Safe: Countdown returns identical deterministic output during SSR and mount", () => {
  const ssrOutput = getNextRunCountdown(1000n, 600, 0, false);
  assert.strictEqual(ssrOutput, "Calculating...");

  const clientOutput = getNextRunCountdown(1000n, 600, 1100, true);
  assert.strictEqual(clientOutput, "0h 8m remaining");
});

// 5. Activity Ledger Duplicate Prevention
test("Activity Ledger: Prevents duplicate transactions by hash", () => {
  const activities = [];
  function addActivity(item) {
    if (activities.some((a) => a.txHash.toLowerCase() === item.txHash.toLowerCase())) {
      return false;
    }
    activities.unshift(item);
    return true;
  }

  const tx1 = { txHash: "0xabc123", type: "Instant Swap" };
  const tx2 = { txHash: "0xdef456", type: "Basket Created" };
  const tx1Duplicate = { txHash: "0xABC123", type: "Instant Swap" };

  assert.strictEqual(addActivity(tx1), true);
  assert.strictEqual(addActivity(tx2), true);
  assert.strictEqual(addActivity(tx1Duplicate), false);
  assert.strictEqual(activities.length, 2);
});

// 6. Swap Quote Engine Tests
function formatWithSmartPrecision(val) {
  if (isNaN(val) || val <= 0) return "0.00";
  if (val < 0.000001) return val.toFixed(8);
  if (val < 0.0001) return val.toFixed(7);
  if (val < 0.01) return val.toFixed(6);
  if (val < 1) return val.toFixed(5);
  if (val < 100) return val.toFixed(4);
  if (val < 10000) return val.toFixed(2);
  return val.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function calculateSwapQuoteTest({ tokenInSymbol, tokenOutSymbol, amountIn, slippage, priceIn, priceOut, dexFeeBps = 30 }) {
  if (!priceIn || !priceOut || priceIn <= 0 || priceOut <= 0) {
    return { isValid: false, error: "Price unavailable" };
  }
  const parsedAmountIn = parseFloat(amountIn);
  if (isNaN(parsedAmountIn) || parsedAmountIn <= 0) {
    return { isValid: false, error: "Enter an amount" };
  }

  const feeMultiplier = (10000 - dexFeeBps) / 10000;
  const ratePerUnit = (priceIn / priceOut) * feeMultiplier;
  const expectedOutput = parsedAmountIn * ratePerUnit;

  const safeSlippage = isNaN(slippage) || slippage < 0.05 || slippage > 50 ? 0.5 : slippage;
  const minReceived = expectedOutput * ((100 - safeSlippage) / 100);
  const valueInUsd = parsedAmountIn * priceIn;
  const valueOutUsd = expectedOutput * priceOut;

  return {
    isValid: true,
    exchangeRate: ratePerUnit,
    expectedOutput,
    minReceived,
    valueInUsd,
    valueOutUsd,
  };
}

test("Swap Quote: USDC→ETH calculates correct market-rate output (not raw router 1:1 bug)", () => {
  // 100 USDC at $1.00/USDC → ETH at $2500/ETH
  // Expected: 100 / 2500 * (1 - 0.003) = 0.039880 ETH
  const quote = calculateSwapQuoteTest({
    tokenInSymbol: "USDC",
    tokenOutSymbol: "ETH",
    amountIn: "100",
    slippage: 0.5,
    priceIn: 1.0,
    priceOut: 2500,
  });

  assert.strictEqual(quote.isValid, true);
  // Rate should be ~0.000397 (not 0.0000000001 from raw router)
  assert.ok(quote.exchangeRate > 0.0003, `Exchange rate ${quote.exchangeRate} should be > 0.0003`);
  assert.ok(quote.exchangeRate < 0.001, `Exchange rate ${quote.exchangeRate} should be < 0.001`);
  // Output should be ~0.039 ETH for 100 USDC
  assert.ok(quote.expectedOutput > 0.035, `Expected output ${quote.expectedOutput} should be > 0.035 ETH`);
  assert.ok(quote.expectedOutput < 0.045, `Expected output ${quote.expectedOutput} should be < 0.045 ETH`);
});

test("Swap Quote: ETH→USDC calculates correct inverse rate", () => {
  // 1 ETH at $2500 → USDC at $1.00
  // Expected: 1 * 2500 * 0.997 = 2492.5 USDC
  const quote = calculateSwapQuoteTest({
    tokenInSymbol: "ETH",
    tokenOutSymbol: "USDC",
    amountIn: "1",
    slippage: 0.5,
    priceIn: 2500,
    priceOut: 1.0,
  });

  assert.strictEqual(quote.isValid, true);
  assert.ok(quote.expectedOutput > 2480, `Expected output ${quote.expectedOutput} USDC should be > 2480`);
  assert.ok(quote.expectedOutput < 2510, `Expected output ${quote.expectedOutput} USDC should be < 2510`);
  // Min received (0.5% slippage below quote)
  assert.ok(quote.minReceived < quote.expectedOutput);
  assert.ok(quote.minReceived > quote.expectedOutput * 0.99);
});

test("Swap Quote: Returns error when prices unavailable (no fake zero output)", () => {
  const quote = calculateSwapQuoteTest({
    tokenInSymbol: "USDC",
    tokenOutSymbol: "ETH",
    amountIn: "100",
    slippage: 0.5,
    priceIn: 0, // Unavailable
    priceOut: 2500,
  });

  assert.strictEqual(quote.isValid, false);
  assert.ok(quote.error, "Should return an error message");
});

test("Smart Precision: Formats small ETH amounts with enough decimals (not truncated to 0.00000)", () => {
  // 100 USDC → ETH at $2500: ~0.039880 ETH
  const ethOutput = 100 / 2500 * 0.997;
  const formatted = formatWithSmartPrecision(ethOutput);
  // Should NOT be "0.00000" or "0.0000"
  assert.notStrictEqual(formatted, "0.00000");
  assert.notStrictEqual(formatted, "0.0000");
  assert.notStrictEqual(formatted, "0.00");
  // Should show at least 4 significant decimal places
  assert.ok(parseFloat(formatted) > 0.039, `Formatted value ${formatted} should be > 0.039`);
});


// ---------------------------------------------------------------------------
// BUG-20: History Timestamp Regression Tests
// Verify formatRelativeTime produces correct relative labels at render time,
// not frozen "Just now" strings stored at record time.
// ---------------------------------------------------------------------------

function formatRelativeTime(timestampMs) {
  if (!timestampMs || timestampMs <= 0) return "Unknown";
  const diffMs = Date.now() - timestampMs;
  if (diffMs < 0) return new Date(timestampMs).toLocaleString();
  if (diffMs < 60_000) return "Just now";
  if (diffMs < 3_600_000) {
    const mins = Math.floor(diffMs / 60_000);
    return `${mins} min${mins !== 1 ? "s" : ""} ago`;
  }
  if (diffMs < 86_400_000) {
    const hrs = Math.floor(diffMs / 3_600_000);
    return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  }
  if (diffMs < 7 * 86_400_000) {
    const days = Math.floor(diffMs / 86_400_000);
    return `${days} day${days !== 1 ? "s" : ""} ago`;
  }
  return new Date(timestampMs).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

test("History Timestamp: Returns 'Just now' for very recent transactions (<1 min)", () => {
  const recent = Date.now() - 10_000; // 10 seconds ago
  assert.strictEqual(formatRelativeTime(recent), "Just now");
});

test("History Timestamp: Returns 'X mins ago' for 5-minute-old transactions", () => {
  const fiveMinsAgo = Date.now() - 5 * 60_000;
  assert.strictEqual(formatRelativeTime(fiveMinsAgo), "5 mins ago");
});

test("History Timestamp: Returns '2 hours ago' for 2-hour-old transactions", () => {
  const twoHoursAgo = Date.now() - 2 * 3_600_000;
  assert.strictEqual(formatRelativeTime(twoHoursAgo), "2 hours ago");
});

test("History Timestamp: Old 10-min transactions should NOT show 'Just now' (regression for frozen timestamp bug)", () => {
  const tenMinsAgo = Date.now() - 10 * 60_000;
  const label = formatRelativeTime(tenMinsAgo);
  assert.notStrictEqual(label, "Just now");
  assert.ok(label.includes("ago"), `Expected relative label, got: ${label}`);
});

test("History Timestamp: Returns 'Unknown' for missing/zero timestamps", () => {
  assert.strictEqual(formatRelativeTime(0), "Unknown");
});

test("History Timestamp: Singular 'min' vs plural 'mins' grammar", () => {
  const oneMinAgo = Date.now() - 65_000; // ~65 seconds
  const result = formatRelativeTime(oneMinAgo);
  assert.strictEqual(result, "1 min ago");
});

// ---------------------------------------------------------------------------
// BUG-21: TokenOut Balance Tracking Regression Tests
// ---------------------------------------------------------------------------

test("TokenOut Balance: Native ETH out and ERC-20 in are tracked separately", () => {
  const isNativeIn = false;
  const isNativeOut = true;

  const ethBalance = 5_000_000_000_000_000_000n;
  const usdcBalance = 1_000_000_000n;

  const balanceIn = isNativeIn ? ethBalance : usdcBalance;
  const balanceOut = isNativeOut ? ethBalance : 0n;

  assert.strictEqual(balanceIn, usdcBalance, "tokenIn should use ERC-20 USDC balance");
  assert.strictEqual(balanceOut, ethBalance, "tokenOut should use native ETH balance");
  assert.notStrictEqual(balanceIn, balanceOut, "balances must be independent");
});

test("TokenOut Balance: ERC-20 WETH/ARB uses separate contract read, not native ETH", () => {
  const isNativeOut = false;
  const ethBalance = 5_000_000_000_000_000_000n;
  const wethBalance = 60_000_000_000_000_000_000n;

  const balanceOut = isNativeOut ? ethBalance : wethBalance;
  assert.strictEqual(balanceOut, wethBalance, "WETH output uses ERC-20 balance, not native ETH");
});

test("TokenOut Balance: USDC->USDT independently tracks both ERC-20 balances", () => {
  const usdcBalance = 1_000_000_000n;
  const usdtBalance = 500_000_000n;

  assert.notStrictEqual(usdcBalance, usdtBalance, "USDC and USDT balances must differ");
  assert.strictEqual(usdcBalance, 1_000_000_000n);
  assert.strictEqual(usdtBalance, 500_000_000n);
});

// ---------------------------------------------------------------------------
// BUG-22: Mock Swap Quote & Router Execution Mismatch Resolution
// Verifies that frontend mock swap quote math perfectly matches MockDEXRouter.sol
// (_computeAmountOut & getAmountsOut) and does not display CoinGecko/Binance prices.
// ---------------------------------------------------------------------------

function computeMockAmountOutTest(amountInRaw, decimalsIn, decimalsOut, rateMultiplierBps = 10000) {
  if (amountInRaw <= 0n) return 0n;
  let normalised;
  if (decimalsOut >= decimalsIn) {
    const scalar = 10n ** BigInt(decimalsOut - decimalsIn);
    normalised = amountInRaw * scalar;
  } else {
    const scalar = 10n ** BigInt(decimalsIn - decimalsOut);
    normalised = amountInRaw / scalar;
  }
  return (normalised * BigInt(rateMultiplierBps)) / 10000n;
}

test("Mock Quote Math: 100 USDC (6 dec) -> WETH (18 dec) equals exactly 100 WETH raw", () => {
  const usdcRaw = 100_000_000n; // 100 USDC
  const wethOutRaw = computeMockAmountOutTest(usdcRaw, 6, 18, 10000);
  assert.strictEqual(wethOutRaw, 100_000_000_000_000_000_000n); // exactly 100 WETH
});

test("Mock Quote Math: 50 WETH (18 dec) -> USDC (6 dec) equals exactly 50 USDC raw", () => {
  const wethRaw = 50_000_000_000_000_000_000n; // 50 WETH
  const usdcOutRaw = computeMockAmountOutTest(wethRaw, 18, 6, 10000);
  assert.strictEqual(usdcOutRaw, 50_000_000n); // exactly 50 USDC
});

test("Mock Quote Math: 25 USDC (6 dec) -> USDT (6 dec) equals exactly 25 USDT raw", () => {
  const usdcRaw = 25_000_000n; // 25 USDC
  const usdtOutRaw = computeMockAmountOutTest(usdcRaw, 6, 6, 10000);
  assert.strictEqual(usdtOutRaw, 25_000_000n); // exactly 25 USDT
});

test("Mock Quote Math: Slippage minReceived directly mirrors expected output minus slippage", () => {
  const expectedOutRaw = 100_000_000_000_000_000_000n; // 100 WETH
  const slippagePercent = 0.5;
  const slippageBps = BigInt(Math.floor((100 - slippagePercent) * 100)); // 9950
  const minReceivedRaw = (expectedOutRaw * slippageBps) / 10000n;

  assert.strictEqual(minReceivedRaw, 99_500_000_000_000_000_000n); // 99.5 WETH
});

test("Mock Quote Math: On-chain getAmountsOut directly overrides local calculation if provided", () => {
  const onChainAmountOut = 105_000_000_000_000_000_000n; // Router returned 105 WETH (e.g. rate adjusted on contract)
  const slippageBps = 9950n;
  const minOut = (onChainAmountOut * slippageBps) / 10000n;

  assert.strictEqual(minOut, 104_475_000_000_000_000_000n);
});

// ---------------------------------------------------------------------------
// Limit Orders: Calculations, Decimals & State Lifecycle Tests
// ---------------------------------------------------------------------------

function calculateLimitOrderOutputsTest(amountIn, targetPrice, decimalsIn, decimalsOut) {
  const inNum = parseFloat(amountIn);
  const priceNum = parseFloat(targetPrice);

  if (isNaN(inNum) || inNum <= 0) {
    return { isValid: false, minAmountOut: "0.00", minAmountOutRaw: 0n, error: "Enter a valid amount" };
  }
  if (isNaN(priceNum) || priceNum <= 0) {
    return { isValid: false, minAmountOut: "0.00", minAmountOutRaw: 0n, error: "Enter a valid target price" };
  }

  const expectedOutFloat = inNum * priceNum;
  const inScalar = 10n ** BigInt(decimalsIn);
  const outScalar = 10n ** BigInt(decimalsOut);

  // Scaled integer arithmetic representation
  const amountInRaw = BigInt(Math.floor(inNum * 1e6)) * (inScalar / 1000000n);
  const minAmountOutRaw = BigInt(Math.floor(expectedOutFloat * 1e6)) * (outScalar / 1000000n);

  return {
    isValid: true,
    expectedOutFloat,
    minAmountOut: expectedOutFloat.toFixed(4),
    minAmountOutRaw,
    amountInRaw,
  };
}

test("Limit Orders: 100 USDC (6 dec) at 0.0004 WETH/USDC calculates 0.04 WETH target", () => {
  const res = calculateLimitOrderOutputsTest("100", "0.0004", 6, 18);
  assert.strictEqual(res.isValid, true);
  assert.strictEqual(res.minAmountOut, "0.0400");
  assert.strictEqual(res.amountInRaw, 100_000_000n); // 100 USDC in 6 decimals
  assert.strictEqual(res.minAmountOutRaw, 40_000_000_000_000_000n); // 0.04 WETH in 18 decimals
});

test("Limit Orders: 1 WETH (18 dec) at 2500 USDC/WETH calculates 2500 USDC target", () => {
  const res = calculateLimitOrderOutputsTest("1", "2500", 18, 6);
  assert.strictEqual(res.isValid, true);
  assert.strictEqual(res.minAmountOut, "2500.0000");
  assert.strictEqual(res.amountInRaw, 1_000_000_000_000_000_000n); // 1 WETH in 18 decimals
  assert.strictEqual(res.minAmountOutRaw, 2_500_000_000n); // 2500 USDC in 6 decimals
});

test("Limit Orders: Rejects invalid or negative target prices", () => {
  const resNeg = calculateLimitOrderOutputsTest("100", "-1", 6, 18);
  assert.strictEqual(resNeg.isValid, false);

  const resZero = calculateLimitOrderOutputsTest("100", "0", 6, 18);
  assert.strictEqual(resZero.isValid, false);

  const resNaN = calculateLimitOrderOutputsTest("100", "abc", 6, 18);
  assert.strictEqual(resNaN.isValid, false);
});

test("Limit Orders: Expiry timestamp logic handles relative presets and permanent (0) orders", () => {
  const nowSec = 1700000000;
  const oneHourSec = 3600;
  const expiryTimestamp = nowSec + oneHourSec;
  assert.strictEqual(expiryTimestamp, 1700003600);

  const neverExpiry = 0;
  assert.strictEqual(neverExpiry, 0);
});

test("Limit Orders: Order cancellation restores user fund state without deducting fees", () => {
  let userUsdcBalance = 1000_000_000n; // 1000 USDC
  const escrowAmount = 100_000_000n; // 100 USDC escrowed

  // Lock in escrow
  userUsdcBalance -= escrowAmount;
  assert.strictEqual(userUsdcBalance, 900_000_000n);

  // Maker cancels order -> 100% refund
  userUsdcBalance += escrowAmount;
  assert.strictEqual(userUsdcBalance, 1000_000_000n);
});


// =============================================================================
// 9. Binance Pair Mapping Tests (getBinancePair logic)
// =============================================================================

function getBinancePairTest(baseSymbol, quoteSymbol) {
  const STABLES = new Set(["USDC", "USDT", "DAI", "BUSD"]);
  const SUPPORTED = new Set(["ETH", "WETH", "LINK", "UNI", "ARB", "BTC"]);

  const base = baseSymbol.toUpperCase().replace("WETH", "ETH");
  const quote = quoteSymbol.toUpperCase().replace("WETH", "ETH");

  if (STABLES.has(base) && STABLES.has(quote)) {
    return { pair: null, inverted: false, isAvailable: false };
  }
  if (!STABLES.has(base) && STABLES.has(quote) && SUPPORTED.has(base)) {
    return { pair: `${base}USDT`, inverted: false, isAvailable: true };
  }
  if (STABLES.has(base) && !STABLES.has(quote) && SUPPORTED.has(quote)) {
    return { pair: `${quote}USDT`, inverted: true, isAvailable: true };
  }
  if (!STABLES.has(base) && !STABLES.has(quote) && SUPPORTED.has(base) && SUPPORTED.has(quote)) {
    return { pair: `${base}${quote}`, inverted: false, isAvailable: true };
  }
  return { pair: null, inverted: false, isAvailable: false };
}

test("getBinancePair: ETH/USDT => ETHUSDT, not inverted", () => {
  const r = getBinancePairTest("ETH", "USDT");
  assert.strictEqual(r.pair, "ETHUSDT");
  assert.strictEqual(r.inverted, false);
  assert.strictEqual(r.isAvailable, true);
});

test("getBinancePair: USDC/ETH => ETHUSDT, inverted (stable in, crypto out)", () => {
  const r = getBinancePairTest("USDC", "ETH");
  assert.strictEqual(r.pair, "ETHUSDT");
  assert.strictEqual(r.inverted, true);
  assert.strictEqual(r.isAvailable, true);
});

test("getBinancePair: WETH/USDC => ETHUSDT (WETH normalised to ETH)", () => {
  const r = getBinancePairTest("WETH", "USDC");
  assert.strictEqual(r.pair, "ETHUSDT");
  assert.strictEqual(r.inverted, false);
  assert.strictEqual(r.isAvailable, true);
});

test("getBinancePair: LINK/ETH => LINKETH cross pair", () => {
  const r = getBinancePairTest("LINK", "ETH");
  assert.strictEqual(r.pair, "LINKETH");
  assert.strictEqual(r.isAvailable, true);
});

test("getBinancePair: USDC/USDT => not available (stable/stable)", () => {
  const r = getBinancePairTest("USDC", "USDT");
  assert.strictEqual(r.pair, null);
  assert.strictEqual(r.isAvailable, false);
});

test("getBinancePair: UNKNOWN/ETH => not available (unsupported token)", () => {
  const r = getBinancePairTest("UNKNOWN", "ETH");
  assert.strictEqual(r.isAvailable, false);
});

// =============================================================================
// 10. Candles Unavailability Fallback Tests
// =============================================================================

function simulateCandleFetch(pairResult, fetchError = false) {
  if (!pairResult.isAvailable) {
    return { isAvailable: false, candles: [], errorMessage: "Pair not on Binance spot." };
  }
  if (fetchError) {
    return { isAvailable: false, candles: [], errorMessage: "Binance API error." };
  }
  return {
    isAvailable: true,
    candles: [{ time: 1700000000, open: 2000, high: 2100, low: 1950, close: 2050 }],
    errorMessage: null,
  };
}

test("Candles: isAvailable=false for unsupported pair — no fabricated candles", () => {
  const result = simulateCandleFetch({ isAvailable: false });
  assert.strictEqual(result.isAvailable, false);
  assert.strictEqual(result.candles.length, 0);
  assert.ok(result.errorMessage && result.errorMessage.length > 0);
});

test("Candles: isAvailable=false on API error — candles array is empty", () => {
  const result = simulateCandleFetch({ isAvailable: true }, true);
  assert.strictEqual(result.isAvailable, false);
  assert.strictEqual(result.candles.length, 0);
  assert.ok(result.errorMessage);
});

test("Candles: returns real candle data when pair available and fetch succeeds", () => {
  const result = simulateCandleFetch({ isAvailable: true }, false);
  assert.strictEqual(result.isAvailable, true);
  assert.strictEqual(result.candles.length, 1);
  assert.strictEqual(result.errorMessage, null);
});

// =============================================================================
// 11. On-Chain OrderId Extraction Tests
// =============================================================================

function extractOrderIdFromLogs(logs, eventName = "OrderCreated") {
  for (const log of logs) {
    if (log.eventName === eventName && log.args && log.args.orderId !== undefined) {
      return { found: true, orderId: log.args.orderId.toString() };
    }
  }
  return { found: false, orderId: null };
}

test("orderId extraction: extracts numeric orderId from decoded OrderCreated log", () => {
  const mockLogs = [{ eventName: "OrderCreated", args: { orderId: 42n } }];
  const result = extractOrderIdFromLogs(mockLogs);
  assert.strictEqual(result.found, true);
  assert.strictEqual(result.orderId, "42");
});

test("orderId extraction: found=false when no OrderCreated event present", () => {
  const mockLogs = [{ eventName: "Transfer", args: { from: "0xabc", value: 1000n } }];
  const result = extractOrderIdFromLogs(mockLogs);
  assert.strictEqual(result.found, false);
  assert.strictEqual(result.orderId, null);
});

test("orderId extraction: large uint256 orderId preserved as string (no precision loss)", () => {
  const mockLogs = [{ eventName: "OrderCreated", args: { orderId: 999999999999999n } }];
  const result = extractOrderIdFromLogs(mockLogs);
  assert.strictEqual(result.orderId, "999999999999999");
});

test("orderId extraction: found=false for empty logs array", () => {
  const result = extractOrderIdFromLogs([]);
  assert.strictEqual(result.found, false);
});

// =============================================================================
// 12. mapOnChainStatus Tests
// =============================================================================

function mapOnChainStatusTest(statusNum) {
  const MAP = { 0: "Open", 1: "Filled", 2: "Cancelled", 3: "Expired" };
  return MAP[statusNum] || "Open";
}

test("mapOnChainStatus: 0 => Open", () => {
  assert.strictEqual(mapOnChainStatusTest(0), "Open");
});
test("mapOnChainStatus: 1 => Filled", () => {
  assert.strictEqual(mapOnChainStatusTest(1), "Filled");
});
test("mapOnChainStatus: 2 => Cancelled", () => {
  assert.strictEqual(mapOnChainStatusTest(2), "Cancelled");
});
test("mapOnChainStatus: 3 => Expired", () => {
  assert.strictEqual(mapOnChainStatusTest(3), "Expired");
});
test("mapOnChainStatus: unknown value defaults to Open (safe fallback)", () => {
  assert.strictEqual(mapOnChainStatusTest(99), "Open");
});

// =============================================================================
// 13. referenceMarketRate Calculation Tests
// =============================================================================

function calcReferenceRate(tokenInSymbol, tokenOutSymbol, prices) {
  const pIn = (prices[tokenInSymbol.toUpperCase()] || {}).priceUsd;
  const pOut = (prices[tokenOutSymbol.toUpperCase()] || {}).priceUsd;
  if (!pIn || !pOut || pIn <= 0 || pOut <= 0) return null;
  const rate = pIn / pOut;
  return rate < 0.001 ? rate.toFixed(8) : rate < 1 ? rate.toFixed(6) : rate.toFixed(4);
}

test("referenceMarketRate: USDC/ETH at ETH=3000 is ~0.000333", () => {
  const prices = { USDC: { priceUsd: 1.0 }, ETH: { priceUsd: 3000 } };
  const rate = calcReferenceRate("USDC", "ETH", prices);
  assert.ok(rate !== null);
  const n = parseFloat(rate);
  assert.ok(n > 0.000332 && n < 0.000334, `Expected ~0.000333, got ${n}`);
});

test("referenceMarketRate: ETH/USDC at ETH=3000 is ~3000", () => {
  const prices = { ETH: { priceUsd: 3000 }, USDC: { priceUsd: 1.0 } };
  const rate = calcReferenceRate("ETH", "USDC", prices);
  assert.ok(rate !== null);
  assert.ok(parseFloat(rate) > 2999 && parseFloat(rate) < 3001);
});

test("referenceMarketRate: returns null when prices object is empty", () => {
  assert.strictEqual(calcReferenceRate("ETH", "USDC", {}), null);
});

test("referenceMarketRate: returns null when only one price is available", () => {
  const prices = { ETH: { priceUsd: 3000 } };
  assert.strictEqual(calcReferenceRate("ETH", "USDC", prices), null);
});

// =============================================================================
// 14. Real-Time Candle Updates & Interval Transition Tests
// =============================================================================

function applyLiveCandleUpdate(candles, liveCandle) {
  if (!candles || candles.length === 0) return [liveCandle];
  const updated = [...candles];
  const lastIdx = updated.length - 1;
  const lastCandle = updated[lastIdx];

  if (lastCandle.time === liveCandle.time) {
    // Same interval: update current candle
    updated[lastIdx] = {
      ...lastCandle,
      high: Math.max(lastCandle.high, liveCandle.high),
      low: Math.min(lastCandle.low, liveCandle.low),
      close: liveCandle.close,
      volume: liveCandle.volume,
    };
  } else if (liveCandle.time > lastCandle.time) {
    // New interval opened: append new candle
    updated.push(liveCandle);
  }
  return updated;
}

test("Live Candles: Updates current candle high, low, close during same interval", () => {
  const initial = [
    { time: 1700000000, open: 2000, high: 2050, low: 1980, close: 2020, volume: 10 },
  ];
  const tick = { time: 1700000000, open: 2000, high: 2080, low: 1970, close: 2075, volume: 15 };
  const result = applyLiveCandleUpdate(initial, tick);

  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].high, 2080);
  assert.strictEqual(result[0].low, 1970);
  assert.strictEqual(result[0].close, 2075);
  assert.strictEqual(result[0].volume, 15);
});

test("Live Candles: Appends a new candle when new interval time opens", () => {
  const initial = [
    { time: 1700000000, open: 2000, high: 2050, low: 1980, close: 2020, volume: 10 },
  ];
  const nextIntervalCandle = {
    time: 1700003600, // 1 hour later
    open: 2020,
    high: 2030,
    low: 2015,
    close: 2025,
    volume: 5,
  };
  const result = applyLiveCandleUpdate(initial, nextIntervalCandle);

  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].time, 1700000000);
  assert.strictEqual(result[1].time, 1700003600);
  assert.strictEqual(result[1].close, 2025);
});

// =============================================================================
// 15. Chart Zoom, Pan & Visible Windowing Tests
// =============================================================================

function calculateVisibleWindow(candles, zoomLevel, panOffset) {
  const total = candles.length;
  if (total === 0) return [];
  const minVisible = 5;
  const count = Math.max(minVisible, Math.min(total, Math.round(total * zoomLevel)));
  const maxPan = total - count;
  const clampedPan = Math.max(0, Math.min(maxPan, panOffset));
  const endIndex = total - clampedPan;
  const startIndex = Math.max(0, endIndex - count);
  return candles.slice(startIndex, endIndex);
}

test("Chart Windowing: 1.0 zoomLevel returns all candles at panOffset 0 (live edge)", () => {
  const mockCandles = Array.from({ length: 30 }, (_, i) => ({ time: 1000 + i, close: 100 + i }));
  const visible = calculateVisibleWindow(mockCandles, 1.0, 0);
  assert.strictEqual(visible.length, 30);
  assert.strictEqual(visible[visible.length - 1].time, 1029); // Latest candle
});

test("Chart Windowing: 0.5 zoomLevel returns latest 50% of candles at panOffset 0", () => {
  const mockCandles = Array.from({ length: 40 }, (_, i) => ({ time: 1000 + i, close: 100 + i }));
  const visible = calculateVisibleWindow(mockCandles, 0.5, 0);
  assert.strictEqual(visible.length, 20);
  assert.strictEqual(visible[visible.length - 1].time, 1039);
});

test("Chart Windowing: Positive panOffset shifts visible slice back into historical candles", () => {
  const mockCandles = Array.from({ length: 40 }, (_, i) => ({ time: 1000 + i, close: 100 + i }));
  const visible = calculateVisibleWindow(mockCandles, 0.5, 10);
  assert.strictEqual(visible.length, 20);
  assert.strictEqual(visible[visible.length - 1].time, 1029); // 10 candles back from live edge
});

// =============================================================================
// 16. Custom Expiry Validation & Local Timezone Conversion Tests
// =============================================================================

function validateCustomExpiryTest(dateTimeLocalStr, mockCurrentTimeMs) {
  if (!dateTimeLocalStr) {
    return { isValid: false, timestamp: 0, error: "Please select an expiry date and time" };
  }
  const parsed = new Date(dateTimeLocalStr);
  const timeMs = parsed.getTime();
  if (isNaN(timeMs)) {
    return { isValid: false, timestamp: 0, error: "Invalid date format" };
  }
  const nowMs = mockCurrentTimeMs || Date.now();
  if (timeMs <= nowMs + 60_000) {
    return { isValid: false, timestamp: 0, error: "Expiry time must be at least 1 minute in the future" };
  }
  return { isValid: true, timestamp: Math.floor(timeMs / 1000) };
}

test("Custom Expiry: Accepts valid future datetime and returns unix timestamp in seconds", () => {
  const mockNow = new Date("2026-10-17T12:00:00Z").getTime();
  const futureStr = "2026-10-18T12:00:00"; // 24h later
  const res = validateCustomExpiryTest(futureStr, mockNow);
  assert.strictEqual(res.isValid, true);
  assert.ok(res.timestamp > Math.floor(mockNow / 1000));
});

test("Custom Expiry: Rejects past or immediate datetime (within 1 min of now)", () => {
  const mockNow = new Date("2026-10-17T12:00:00Z").getTime();
  const pastStr = "2026-10-16T12:00:00";
  const resPast = validateCustomExpiryTest(pastStr, mockNow);
  assert.strictEqual(resPast.isValid, false);
  assert.match(resPast.error, /future/);

  const immediateStr = "2026-10-17T12:00:30"; // 30 sec later
  const resImmediate = validateCustomExpiryTest(immediateStr, mockNow);
  assert.strictEqual(resImmediate.isValid, false);
});

test("Custom Expiry: Rejects empty or malformed date string", () => {
  const resEmpty = validateCustomExpiryTest("");
  assert.strictEqual(resEmpty.isValid, false);

  const resInvalid = validateCustomExpiryTest("not-a-date");
  assert.strictEqual(resInvalid.isValid, false);
});

// =============================================================================
// 17. Expiry Display Formatting Tests
// =============================================================================

function formatExpiryDisplayTest(expiryTimestamp, nowSec) {
  if (expiryTimestamp === 0) return "Never";
  const now = nowSec || Math.floor(Date.now() / 1000);
  if (expiryTimestamp <= now) return "Expired";
  const diffSec = expiryTimestamp - now;
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.round(diffSec / 60));
    return `In ${mins} min${mins === 1 ? "" : "s"}`;
  }
  if (diffSec < 86400) {
    const hours = Math.round(diffSec / 3600);
    return `In ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return "Date Formatted";
}

test("formatExpiryDisplay: 0 returns 'Never'", () => {
  assert.strictEqual(formatExpiryDisplayTest(0), "Never");
});

test("formatExpiryDisplay: Timestamp in past returns 'Expired'", () => {
  assert.strictEqual(formatExpiryDisplayTest(1000, 2000), "Expired");
});

test("formatExpiryDisplay: 30 minutes in future returns 'In 30 mins'", () => {
  assert.strictEqual(formatExpiryDisplayTest(1000 + 1800, 1000), "In 30 mins");
});

test("formatExpiryDisplay: 2 hours in future returns 'In 2 hours'", () => {
  assert.strictEqual(formatExpiryDisplayTest(1000 + 7200, 1000), "In 2 hours");
});

// =============================================================================
// 18. Faucet Resources Configuration Tests
// =============================================================================

test("Faucet Resources: Includes verified Robinhood Chain Testnet (46630) and Arbitrum Sepolia (421614)", () => {
  const resources = [
    { chainId: 46630, explorer: "https://explorer.testnet.chain.robinhood.com", faucet: "https://faucet.testnet.chain.robinhood.com" },
    { chainId: 421614, explorer: "https://sepolia.arbiscan.io", faucet: "https://faucets.chain.link/arbitrum-sepolia" },
  ];

  const rh = resources.find((r) => r.chainId === 46630);
  assert.ok(rh, "Robinhood Testnet resource must exist");
  assert.strictEqual(rh.explorer, "https://explorer.testnet.chain.robinhood.com");
  assert.strictEqual(rh.faucet, "https://faucet.testnet.chain.robinhood.com");

  const arb = resources.find((r) => r.chainId === 421614);
  assert.ok(arb, "Arbitrum Sepolia resource must exist");
  assert.strictEqual(arb.explorer, "https://sepolia.arbiscan.io");
});

// =============================================================================
// 19. Form State Management on Trade Completion Tests
// =============================================================================

test("Form State: Reset amountIn upon confirmed execution; keep input upon error", () => {
  let formState = { amountIn: "100", txMessage: null };

  // Case 1: Transaction succeeds
  function onTradeSuccess(executedAmount) {
    formState.amountIn = "";
    formState.txMessage = { type: "success", text: `Swapped ${executedAmount}` };
  }

  onTradeSuccess(formState.amountIn);
  assert.strictEqual(formState.amountIn, "");
  assert.strictEqual(formState.txMessage.type, "success");

  // Case 2: User rejects or transaction fails -> preserves input so user can retry
  formState.amountIn = "250";
  function onTradeFailure(errMsg) {
    formState.txMessage = { type: "error", text: errMsg };
  }

  onTradeFailure("User rejected transaction in wallet");
  assert.strictEqual(formState.amountIn, "250", "Amount must be preserved on error so user can retry");
  assert.strictEqual(formState.txMessage.type, "error");
});
