import { publicClient, account } from "./client.js";
import { basketLoopManagerAbi, limitOrderManagerAbi } from "./abi.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

export interface SimulationResult {
  ok: boolean;
  request?: any;
  error?: string;
}

/**
 * Simulates executeSchedule(scheduleId) via static eth_call before broadcasting.
 */
export async function simulateExecution(scheduleId: bigint): Promise<SimulationResult> {
  try {
    const { request } = await publicClient.simulateContract({
      address: config.contractAddress,
      abi: basketLoopManagerAbi,
      functionName: "executeSchedule",
      args: [scheduleId],
      account,
    });

    return { ok: true, request };
  } catch (err: any) {
    const errorMsg = err?.shortMessage || err?.message || String(err);
    logger.warn({ scheduleId: scheduleId.toString(), error: errorMsg }, "Pre-flight simulation failed");
    return { ok: false, error: errorMsg };
  }
}

/**
 * Simulates executeOrder(orderId) via static eth_call before broadcasting.
 */
export async function simulateLimitOrderExecution(orderId: bigint): Promise<SimulationResult> {
  if (!config.limitOrderManagerAddress) {
    return { ok: false, error: "LimitOrderManager address is not configured" };
  }

  try {
    const { request } = await publicClient.simulateContract({
      address: config.limitOrderManagerAddress,
      abi: limitOrderManagerAbi,
      functionName: "executeOrder",
      args: [orderId],
      account,
    });

    return { ok: true, request };
  } catch (err: any) {
    const errorMsg = err?.shortMessage || err?.message || String(err);
    logger.warn({ orderId: orderId.toString(), error: errorMsg }, "Limit order pre-flight simulation failed");
    return { ok: false, error: errorMsg };
  }
}
