/**
 * Real-Time Market Price Service for BasketLoop
 * Fetches verified USD market prices for supported assets (ETH, WETH, USDC, USDT, LINK, UNI, ARB).
 * Implements in-memory caching (30s TTL), timestamp tracking, and fallback providers.
 */

export interface TokenPrice {
  symbol: string;
  priceUsd: number;
  lastUpdated: number;
}

// In-memory price cache with timestamps
const priceCache: Record<string, { priceUsd: number; timestamp: number }> = {};
const CACHE_TTL_MS = 30_000; // 30 seconds

// Mapping token symbols to CoinGecko IDs
const COINGECKO_ID_MAP: Record<string, string> = {
  ETH: "ethereum",
  WETH: "weth",
  USDC: "usd-coin",
  USDT: "tether",
  LINK: "chainlink",
  UNI: "uniswap",
  ARB: "arbitrum",
};

// Mapping token symbols to Binance USDT pairs for secondary fallback
const BINANCE_PAIR_MAP: Record<string, string> = {
  ETH: "ETHUSDT",
  WETH: "ETHUSDT",
  LINK: "LINKUSDT",
  UNI: "UNIUSDT",
  ARB: "ARBUSDT",
};

/**
 * Fetches real-time price in USD for a given symbol.
 * Returns null if price is unavailable (never returns fabricated values).
 */
export async function fetchTokenPriceUsd(symbol: string): Promise<TokenPrice | null> {
  const sym = symbol.toUpperCase();

  // Stablecoins are pegged to $1.00 USD
  if (sym === "USDC" || sym === "USDT") {
    return { symbol: sym, priceUsd: 1.0, lastUpdated: Date.now() };
  }

  // Check cache
  const cached = priceCache[sym];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { symbol: sym, priceUsd: cached.priceUsd, lastUpdated: cached.timestamp };
  }

  // 1. Try CoinGecko Public API
  const geckoId = COINGECKO_ID_MAP[sym];
  if (geckoId) {
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`,
        { headers: { Accept: "application/json" } }
      );
      if (res.ok) {
        const data = await res.json();
        const price = data[geckoId]?.usd;
        if (typeof price === "number" && price > 0) {
          priceCache[sym] = { priceUsd: price, timestamp: Date.now() };
          return { symbol: sym, priceUsd: price, lastUpdated: Date.now() };
        }
      }
    } catch {
      // Fall through to Binance fallback
    }
  }

  // 2. Fallback to Binance Public Ticker API (High availability, no API key required)
  const binancePair = BINANCE_PAIR_MAP[sym];
  if (binancePair) {
    try {
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${binancePair}`);
      if (res.ok) {
        const data = await res.json();
        const price = parseFloat(data.price);
        if (!isNaN(price) && price > 0) {
          priceCache[sym] = { priceUsd: price, timestamp: Date.now() };
          return { symbol: sym, priceUsd: price, lastUpdated: Date.now() };
        }
      }
    } catch {
      // Both providers failed
    }
  }

  // If cached value exists even if stale, return it with original timestamp
  if (cached) {
    return { symbol: sym, priceUsd: cached.priceUsd, lastUpdated: cached.timestamp };
  }

  return null;
}

/**
 * Batch fetches prices for a list of token symbols.
 */
export async function fetchMultipleTokenPrices(
  symbols: string[]
): Promise<Record<string, TokenPrice | null>> {
  const results: Record<string, TokenPrice | null> = {};
  await Promise.all(
    symbols.map(async (sym) => {
      results[sym.toUpperCase()] = await fetchTokenPriceUsd(sym);
    })
  );
  return results;
}
