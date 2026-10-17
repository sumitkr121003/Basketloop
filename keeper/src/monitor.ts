import { publicClient } from "./client.js";
import { basketLoopManagerAbi, limitOrderManagerAbi } from "./abi.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { executeScheduleTx, executeLimitOrderTx, type ExecutionResult } from "./executor.js";

export interface ScheduleCheck {
  id: bigint;
  executable: boolean;
  reason: string;
  execution?: ExecutionResult;
}

export interface PollReport {
  timestamp: number;
  totalSchedules: number;
  checked: number;
  executed: number;
  results: ScheduleCheck[];
}

/**
 * Iterates through all existing schedules and checks eligibility via canExecute.
 * Executes any schedule that is due and passes simulation.
 */
export async function pollSchedules(): Promise<PollReport> {
  const report: PollReport = {
    timestamp: Date.now(),
    totalSchedules: 0,
    checked: 0,
    executed: 0,
    results: [],
  };

  try {
    const nextScheduleId = await publicClient.readContract({
      address: config.contractAddress,
      abi: basketLoopManagerAbi,
      functionName: "nextScheduleId",
    });

    const total = Number(nextScheduleId - 1n);
    report.totalSchedules = total;

    if (total === 0) {
      logger.debug("No schedules found on-chain");
      return report;
    }

    logger.info({ totalSchedules: total }, "Scanning active schedules");

    for (let i = 1n; i < nextScheduleId; i++) {
      report.checked += 1;

      try {
        const [executable, reason] = await publicClient.readContract({
          address: config.contractAddress,
          abi: basketLoopManagerAbi,
          functionName: "canExecute",
          args: [i],
        });

        const checkResult: ScheduleCheck = {
          id: i,
          executable,
          reason,
        };

        if (executable) {
          logger.info({ scheduleId: i.toString() }, "Schedule is eligible for execution! Triggering...");
          const execRes = await executeScheduleTx(i);
          checkResult.execution = execRes;
          if (execRes.success) {
            report.executed += 1;
          }
        } else {
          logger.debug({ scheduleId: i.toString(), reason }, "Schedule skipped");
        }

        report.results.push(checkResult);
      } catch (err: any) {
        logger.warn(
          { scheduleId: i.toString(), error: err?.shortMessage || err?.message },
          "Failed to inspect schedule"
        );
        report.results.push({
          id: i,
          executable: false,
          reason: `Inspection failed: ${err?.shortMessage || err?.message}`,
        });
      }
    }
  } catch (err: any) {
    logger.error({ error: err?.shortMessage || err?.message }, "Failed to poll schedules");
  }

  return report;
}

export interface LimitOrderCheck {
  id: bigint;
  executable: boolean;
  reason: string;
  execution?: ExecutionResult;
}

export interface LimitOrderPollReport {
  timestamp: number;
  totalOrders: number;
  checked: number;
  executed: number;
  results: LimitOrderCheck[];
}

/**
 * Iterates through all open limit orders and checks eligibility via canExecute.
 * Executes any limit order whose price condition is met.
 */
export async function pollLimitOrders(): Promise<LimitOrderPollReport> {
  const report: LimitOrderPollReport = {
    timestamp: Date.now(),
    totalOrders: 0,
    checked: 0,
    executed: 0,
    results: [],
  };

  if (!config.limitOrderManagerAddress) {
    return report;
  }

  try {
    const nextOrderId = await publicClient.readContract({
      address: config.limitOrderManagerAddress,
      abi: limitOrderManagerAbi,
      functionName: "nextOrderId",
    });

    const total = Number(nextOrderId - 1n);
    report.totalOrders = total;

    if (total === 0) {
      logger.debug("No limit orders found on-chain");
      return report;
    }

    logger.info({ totalOrders: total }, "Scanning active limit orders");

    for (let i = 1n; i < nextOrderId; i++) {
      report.checked += 1;

      try {
        const [executable, reason] = await publicClient.readContract({
          address: config.limitOrderManagerAddress,
          abi: limitOrderManagerAbi,
          functionName: "canExecute",
          args: [i],
        });

        const checkResult: LimitOrderCheck = {
          id: i,
          executable,
          reason,
        };

        if (executable) {
          logger.info({ orderId: i.toString() }, "Limit order is eligible for execution! Triggering...");
          const execRes = await executeLimitOrderTx(i);
          checkResult.execution = execRes;
          if (execRes.success) {
            report.executed += 1;
          }
        } else {
          logger.debug({ orderId: i.toString(), reason }, "Limit order skipped");
        }

        report.results.push(checkResult);
      } catch (err: any) {
        logger.warn(
          { orderId: i.toString(), error: err?.shortMessage || err?.message },
          "Failed to inspect limit order"
        );
        report.results.push({
          id: i,
          executable: false,
          reason: `Inspection failed: ${err?.shortMessage || err?.message}`,
        });
      }
    }
  } catch (err: any) {
    logger.error({ error: err?.shortMessage || err?.message }, "Failed to poll limit orders");
  }

  return report;
}
