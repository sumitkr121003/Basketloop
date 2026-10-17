import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { type Address, type Hex } from "viem";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  rpcUrl: requireEnv("RPC_URL"),
  contractAddress: requireEnv("BASKET_LOOP_MANAGER_ADDRESS") as Address,
  limitOrderManagerAddress: (process.env.LIMIT_ORDER_MANAGER_ADDRESS as Address) || undefined,
  keeperPrivateKey: requireEnv("KEEPER_PRIVATE_KEY") as Hex,
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? "30000", 10),
  priorityFeeGwei: parseFloat(process.env.DEFAULT_PRIORITY_FEE_GWEI ?? "0.1"),
  logLevel: process.env.LOG_LEVEL ?? "info",
} as const;
