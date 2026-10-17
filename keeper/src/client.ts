import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";

// Generic EVM chain definition based on RPC connection
export const targetChain = defineChain({
  id: 46630, // Local / default or detected
  name: "Target Network",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [config.rpcUrl] },
  },
});

export const account = privateKeyToAccount(config.keeperPrivateKey);

export const publicClient = createPublicClient({
  chain: targetChain,
  transport: http(config.rpcUrl),
});

export const walletClient = createWalletClient({
  account,
  chain: targetChain,
  transport: http(config.rpcUrl),
});
