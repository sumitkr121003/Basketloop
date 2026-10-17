export interface TokenInfo {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  isFundingToken?: boolean;
  isNative?: boolean;
  chainId?: number;
}

export const ZERO_ADDRESS: `0x${string}` = "0x0000000000000000000000000000000000000000";

// Robinhood Chain Testnet (ChainId 46630) Curated Tokens
export const ROBINHOOD_TESTNET_TOKENS: TokenInfo[] = [
  {
    symbol: "ETH",
    name: "Ether",
    address: ZERO_ADDRESS,
    decimals: 18,
    isFundingToken: true,
    isNative: true,
    chainId: 46630,
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0xf5581b11BF5c5Cb44f1e44a21b80957FF091977b",
    decimals: 18,
    isFundingToken: true,
    chainId: 46630,
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0xb7010f73f0A2217b8e863F20B5c5EA219D43eDc2",
    decimals: 6,
    isFundingToken: true,
    chainId: 46630,
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    address: "0xE1E101575606a11566adf6022294bD1a3E01c20D",
    decimals: 6,
    isFundingToken: true,
    chainId: 46630,
  },
  {
    symbol: "LINK",
    name: "Chainlink",
    address: "0xf653958B8a9296E245Cc4DD03584f939C417deb2",
    decimals: 18,
    chainId: 46630,
  },
  {
    symbol: "UNI",
    name: "Uniswap",
    address: "0xA7924B54a1120AAE87cC59ed5cc01Dd099c70513",
    decimals: 18,
    chainId: 46630,
  },
  {
    symbol: "ARB",
    name: "Arbitrum",
    address: "0x47c1390FF38D6f391C5132A113D75E96Ae5b1565",
    decimals: 18,
    chainId: 46630,
  },
];

// Arbitrum Sepolia (ChainId 421614) Tokens
export const ARBITRUM_SEPOLIA_TOKENS: TokenInfo[] = [
  {
    symbol: "ETH",
    name: "Ether",
    address: ZERO_ADDRESS,
    decimals: 18,
    isFundingToken: true,
    isNative: true,
    chainId: 421614,
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
    decimals: 18,
    isFundingToken: true,
    chainId: 421614,
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    decimals: 6,
    isFundingToken: true,
    chainId: 421614,
  },
  {
    symbol: "LINK",
    name: "Chainlink",
    address: "0xb1D4538B4571d411F07960EF2838Ce337FE1E80E",
    decimals: 18,
    chainId: 421614,
  },
  {
    symbol: "ARB",
    name: "Arbitrum",
    address: "0x61661A4E9E2C785C0882e365Dff86C14704Bcf00",
    decimals: 18,
    chainId: 421614,
  },
];

// Default curated tokens fallback (Robinhood Testnet)
export const CURATED_TOKENS: TokenInfo[] = ROBINHOOD_TESTNET_TOKENS;

/**
 * Returns the supported token registry for a specific chain.
 */
export function getTokensForChain(chainId?: number): TokenInfo[] {
  if (chainId === 421614) {
    return ARBITRUM_SEPOLIA_TOKENS;
  }
  return ROBINHOOD_TESTNET_TOKENS;
}

/**
 * Checks if a token represents the native currency (e.g. ETH).
 */
export function isNativeToken(token?: TokenInfo | null): boolean {
  if (!token) return false;
  return Boolean(token.isNative) || token.address.toLowerCase() === ZERO_ADDRESS.toLowerCase();
}

/**
 * Returns the wrapped counterpart token (e.g. WETH for ETH).
 */
export function getWrappedToken(chainId?: number): TokenInfo {
  const tokens = getTokensForChain(chainId);
  return tokens.find((t) => t.symbol === "WETH") || tokens[1];
}
