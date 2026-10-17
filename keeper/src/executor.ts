import { parseGwei } from "viem";
import { walletClient, publicClient, account } from "./client.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { simulateExecution, simulateLimitOrderExecution } from "./simulator.js";

// Nonce mutex / queue state
let nonceLock: Promise<void> = Promise.resolve();
let currentNonce: number | null = null;

async function getNextNonce(): Promise<number> {
  const onChainNonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });

  if (currentNonce === null || onChainNonce > currentNonce) {
    currentNonce = onChainNonce;
  }

  const nonceToUse = currentNonce;
  currentNonce += 1;
  return nonceToUse;
}

export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  blockNumber?: bigint;
  error?: string;
}

/**
 * Dispatches executeSchedule with dynamic 15% gas buffering and sequential nonce locking.
 */
export async function executeScheduleTx(scheduleId: bigint): Promise<ExecutionResult> {
  // Chain execution behind mutex to avoid nonce race conditions
  return new Promise((resolve) => {
    nonceLock = nonceLock.then(async () => {
      try {
        // 1. Pre-flight simulation
        const sim = await simulateExecution(scheduleId);
        if (!sim.ok || !sim.request) {
          resolve({ success: false, error: sim.error || "Simulation failed" });
          return;
        }

        // 2. Estimate gas and apply 15% buffer
        const block = await publicClient.getBlock({ blockTag: "latest" });
        const baseFee = block.baseFeePerGas ?? 0n;
        // 15% base fee buffer: baseFee * 115 / 100
        const bufferedBaseFee = (baseFee * 115n) / 100n;
        const priorityFee = parseGwei(config.priorityFeeGwei.toString());
        const maxFeePerGas = bufferedBaseFee + priorityFee;

        // 3. Acquire sequential nonce
        const nonce = await getNextNonce();

        logger.info(
          {
            scheduleId: scheduleId.toString(),
            nonce,
            maxFeePerGas: maxFeePerGas.toString(),
            maxPriorityFeePerGas: priorityFee.toString(),
          },
          "Broadcasting executeSchedule transaction"
        );

        // 4. Send transaction
        const txHash = await walletClient.writeContract({
          ...sim.request,
          nonce,
          maxFeePerGas,
          maxPriorityFeePerGas: priorityFee,
        });

        logger.info({ scheduleId: scheduleId.toString(), txHash }, "Transaction submitted, waiting for receipt");

        // 5. Wait for block inclusion
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (receipt.status === "success") {
          logger.info(
            {
              scheduleId: scheduleId.toString(),
              txHash,
              blockNumber: receipt.blockNumber.toString(),
              gasUsed: receipt.gasUsed.toString(),
            },
            "Schedule executed successfully on-chain"
          );
          resolve({ success: true, txHash, blockNumber: receipt.blockNumber });
        } else {
          logger.error({ scheduleId: scheduleId.toString(), txHash }, "Transaction reverted on-chain");
          resolve({ success: false, txHash, error: "Transaction reverted on-chain" });
        }
      } catch (err: any) {
        // Reset currentNonce on error so next pass re-syncs with chain
        currentNonce = null;
        const msg = err?.shortMessage || err?.message || String(err);
        logger.error({ scheduleId: scheduleId.toString(), error: msg }, "Failed to dispatch executeSchedule");
        resolve({ success: false, error: msg });
      }
    });
  });
}

/**
 * Dispatches executeOrder for a limit order with dynamic 15% gas buffering and sequential nonce locking.
 */
export async function executeLimitOrderTx(orderId: bigint): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    nonceLock = nonceLock.then(async () => {
      try {
        const sim = await simulateLimitOrderExecution(orderId);
        if (!sim.ok || !sim.request) {
          resolve({ success: false, error: sim.error || "Limit order simulation failed" });
          return;
        }

        const block = await publicClient.getBlock({ blockTag: "latest" });
        const baseFee = block.baseFeePerGas ?? 0n;
        const bufferedBaseFee = (baseFee * 115n) / 100n;
        const priorityFee = parseGwei(config.priorityFeeGwei.toString());
        const maxFeePerGas = bufferedBaseFee + priorityFee;

        const nonce = await getNextNonce();

        logger.info(
          {
            orderId: orderId.toString(),
            nonce,
            maxFeePerGas: maxFeePerGas.toString(),
            maxPriorityFeePerGas: priorityFee.toString(),
          },
          "Broadcasting executeOrder (limit order) transaction"
        );

        const txHash = await walletClient.writeContract({
          ...sim.request,
          nonce,
          maxFeePerGas,
          maxPriorityFeePerGas: priorityFee,
        });

        logger.info({ orderId: orderId.toString(), txHash }, "Limit order transaction submitted, waiting for receipt");

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (receipt.status === "success") {
          logger.info(
            {
              orderId: orderId.toString(),
              txHash,
              blockNumber: receipt.blockNumber.toString(),
              gasUsed: receipt.gasUsed.toString(),
            },
            "Limit order executed successfully on-chain"
          );
          resolve({ success: true, txHash, blockNumber: receipt.blockNumber });
        } else {
          logger.error({ orderId: orderId.toString(), txHash }, "Limit order transaction reverted on-chain");
          resolve({ success: false, txHash, error: "Limit order transaction reverted on-chain" });
        }
      } catch (err: any) {
        currentNonce = null;
        const msg = err?.shortMessage || err?.message || String(err);
        logger.error({ orderId: orderId.toString(), error: msg }, "Failed to dispatch executeOrder");
        resolve({ success: false, error: msg });
      }
    });
  });
}
