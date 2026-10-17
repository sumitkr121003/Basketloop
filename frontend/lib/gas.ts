import { formatUnits, type PublicClient } from "viem";

export interface GasEstimateResult {
  isValid: boolean;
  gasLimit: bigint;
  gasPriceWei: bigint;
  feeWei: bigint;
  feeEth: string;
  feeUsd: string | null;
  error?: string;
}

// Reasonable gas limit bounds for EVM DEX and Basket operations
export const MIN_PLAUSIBLE_GAS = 21_000n;
export const MAX_PLAUSIBLE_GAS = 2_000_000n;
export const DEFAULT_SWAP_GAS = 250_000n;
export const DEFAULT_APPROVE_GAS = 65_000n;

/**
 * Validates and formats gas estimates safely.
 * Rejects Orbit L2 astronomical block gas limits (> 2M) or zero/reverted estimates.
 */
export function calculateSafeGasCost(
  gasUnits: bigint,
  effectiveGasPriceWei: bigint,
  nativeTokenPriceUsd: number | null
): GasEstimateResult {
  // Reject implausible gas units (e.g. Arbitrum Orbit 2^50 block gas limit)
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

  // Calculate total fee in Wei = gasUnits * gasPrice
  const feeWei = gasUnits * effectiveGasPriceWei;
  const feeEthFormatted = formatUnits(feeWei, 18);
  const feeEthNum = parseFloat(feeEthFormatted);

  let feeUsdFormatted: string | null = null;
  if (nativeTokenPriceUsd && nativeTokenPriceUsd > 0 && !isNaN(feeEthNum)) {
    const totalUsd = feeEthNum * nativeTokenPriceUsd;
    feeUsdFormatted = totalUsd < 0.01 ? "<$0.01" : `$${totalUsd.toFixed(2)}`;
  }

  return {
    isValid: true,
    gasLimit: gasUnits,
    gasPriceWei: effectiveGasPriceWei,
    feeWei,
    feeEth: feeEthNum < 0.000001 ? "<0.000001" : feeEthNum.toFixed(6),
    feeUsd: feeUsdFormatted,
  };
}

/**
 * Estimates transaction gas safely with pre-flight check.
 */
export async function estimateSafeTransactionFee(
  publicClient: PublicClient,
  txParams: {
    account?: `0x${string}`;
    to: `0x${string}`;
    data?: `0x${string}`;
    value?: bigint;
  },
  nativeTokenPriceUsd: number | null
): Promise<GasEstimateResult> {
  try {
    const [gasEstimate, gasPrice] = await Promise.all([
      publicClient.estimateGas(txParams as any).catch((err) => {
        throw new Error(err?.shortMessage || err?.message || "Execution simulation reverted");
      }),
      publicClient.getGasPrice().catch(() => 10_000_000n), // Default 0.01 Gwei on testnet
    ]);

    // Apply 20% safe buffer to gas limit
    const bufferedGas = (gasEstimate * 120n) / 100n;

    return calculateSafeGasCost(bufferedGas, gasPrice, nativeTokenPriceUsd);
  } catch (err: any) {
    return {
      isValid: false,
      gasLimit: 0n,
      gasPriceWei: 0n,
      feeWei: 0n,
      feeEth: "0.00",
      feeUsd: null,
      error: err?.message || "Gas estimation failed",
    };
  }
}
