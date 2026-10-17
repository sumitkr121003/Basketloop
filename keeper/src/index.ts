import { formatEther } from "viem";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { publicClient, account } from "./client.js";
import { pollSchedules, pollLimitOrders } from "./monitor.js";

async function main() {
  logger.info(
    {
      rpcUrl: config.rpcUrl,
      contractAddress: config.contractAddress,
      keeperAddress: account.address,
      pollIntervalMs: config.pollIntervalMs,
    },
    "Starting BasketLoop Keeper Daemon"
  );

  try {
    // 1. Verify RPC connectivity and check balance
    const balance = await publicClient.getBalance({ address: account.address });
    logger.info(
      {
        keeperAddress: account.address,
        ethBalance: formatEther(balance),
      },
      "Connected to RPC. Keeper balance verified."
    );

    if (balance === 0n) {
      logger.warn(
        "Keeper wallet has 0 ETH! It will not be able to pay gas for execution transactions."
      );
    }

    // 2. Initial execution pass
    logger.info("Executing initial schedule inspection pass...");
    const initialReport = await pollSchedules();
    logger.info(
      {
        total: initialReport.totalSchedules,
        checked: initialReport.checked,
        executed: initialReport.executed,
      },
      "Initial schedule pass complete"
    );

    if (config.limitOrderManagerAddress) {
      logger.info("Executing initial limit order inspection pass...");
      const initialLimitReport = await pollLimitOrders();
      logger.info(
        {
          total: initialLimitReport.totalOrders,
          checked: initialLimitReport.checked,
          executed: initialLimitReport.executed,
        },
        "Initial limit order pass complete"
      );
    }

    // 3. Start recurring polling timer
    let isRunning = false;
    const interval = setInterval(async () => {
      if (isRunning) {
        logger.debug("Previous poll pass still running, skipping interval tick");
        return;
      }
      isRunning = true;
      try {
        await pollSchedules();
        if (config.limitOrderManagerAddress) {
          await pollLimitOrders();
        }
      } catch (err: any) {
        logger.error({ error: err?.message }, "Error during scheduled poll pass");
      } finally {
        isRunning = false;
      }
    }, config.pollIntervalMs);

    // Graceful shutdown
    const shutdown = () => {
      logger.info("Shutting down BasketLoop Keeper Daemon...");
      clearInterval(interval);
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (err: any) {
    logger.fatal({ error: err?.message || String(err) }, "Fatal error initializing keeper");
    process.exit(1);
  }
}

// Only auto-run if executed directly
import { pathToFileURL } from "url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { main };
