import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arbitrumSepolia } from "viem/chains";
import { robinhoodTestnet, hardhatLocal } from "./chains";

export const wagmiConfig = getDefaultConfig({
  appName: "BasketLoop",
  projectId: "3a8170812b534d0ff9d794f19a901d64", // Standard public demo WalletConnect ID
  chains: [robinhoodTestnet, arbitrumSepolia, hardhatLocal],
  ssr: true,
});
