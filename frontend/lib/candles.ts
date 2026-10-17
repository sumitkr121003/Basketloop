/**
 * Real-Time Candlestick & Market Data Service for BasketLoop
 * Fetches verified historical OHLCV data from Binance Public API and
 * streams real-time live updates via Binance Public WebSocket.
 * Never fabricates candles or uses random numbers when data is unavailable.
 */

export type Timeframe = "1H" | "1D" | "1W" | "1M";

export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PairMarketData {
  symbol: string;
  baseSymbol: string;
  quoteSymbol: string;
  candles: Candle[];
  timeframe: Timeframe;
  currentPrice: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  lastUpdated: number;
  source: string;
  isAvailable: boolean;
  errorMessage?: string;
}

export interface BinanceKlineParam {
  interval: string;
  limit: number;
}

export const TIMEFRAME_CONFIG: Record<Timeframe, BinanceKlineParam> = {
  "1H": { interval: "1m", limit: 60 },
  "1D": { interval: "1h", limit: 24 },
  "1W": { interval: "4h", limit: 42 },
  "1M": { interval: "1d", limit: 30 },
};

/**
 * Normalises token symbol for Binance lookup (e.g. WETH -> ETH)
 */
export function normaliseSymbol(symbol: string): string {
  const s = symbol.toUpperCase().trim();
  if (s === "WETH") return "ETH";
  return s;
}

/**
 * Determines Binance trading pair symbol if directly supported.
 */
export function getBinancePair(base: string, quote: string): { pair: string; inverted: boolean } | null {
  const b = normaliseSymbol(base);
  const q = normaliseSymbol(quote);

  if (b === q) return null;

  // Direct USDT/USDC quotes
  if (q === "USDT" || q === "USDC") {
    const directPairs: Record<string, string> = {
      ETH: "ETHUSDT",
      BTC: "BTCUSDT",
      LINK: "LINKUSDT",
      UNI: "UNIUSDT",
      ARB: "ARBUSDT",
      USDC: "USDCUSDT",
    };
    if (directPairs[b]) {
      return { pair: directPairs[b], inverted: false };
    }
  }

  // Inverted: quote is the asset, base is USDT/USDC
  if (b === "USDT" || b === "USDC") {
    const directPairs: Record<string, string> = {
      ETH: "ETHUSDT",
      BTC: "BTCUSDT",
      LINK: "LINKUSDT",
      UNI: "UNIUSDT",
      ARB: "ARBUSDT",
      USDC: "USDCUSDT",
    };
    if (directPairs[q]) {
      return { pair: directPairs[q], inverted: true };
    }
  }

  // Cross pairs supported on Binance
  const crossMap: Record<string, string> = {
    "LINK-ETH": "LINKETH",
    "UNI-ETH": "UNIETH",
  };

  if (crossMap[`${b}-${q}`]) {
    return { pair: crossMap[`${b}-${q}`], inverted: false };
  }
  if (crossMap[`${q}-${b}`]) {
    return { pair: crossMap[`${q}-${b}`], inverted: true };
  }

  return null;
}

// In-memory cache for historical candles to prevent aggressive rate limiting on mount
const candleCache = new Map<string, { data: PairMarketData; expiry: number }>();
const CACHE_TTL_MS = 15_000; // 15s cache for initial REST fetch

/**
 * Fetches real historical OHLCV candlestick data from Binance.
 * Returns isAvailable: false if data cannot be fetched or pair is not listed.
 */
export async function fetchPairMarketData(
  baseSymbol: string,
  quoteSymbol: string,
  timeframe: Timeframe = "1D"
): Promise<PairMarketData> {
  const normBase = normaliseSymbol(baseSymbol);
  const normQuote = normaliseSymbol(quoteSymbol);
  const cacheKey = `${normBase}_${normQuote}_${timeframe}`;

  const cached = candleCache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }

  const defaultUnavailable: PairMarketData = {
    symbol: `${normBase}/${normQuote}`,
    baseSymbol: normBase,
    quoteSymbol: normQuote,
    candles: [],
    timeframe,
    currentPrice: 0,
    change24h: 0,
    changePercent24h: 0,
    high24h: 0,
    low24h: 0,
    volume24h: 0,
    lastUpdated: Date.now(),
    source: "Binance Public API",
    isAvailable: false,
    errorMessage: `Live market chart data unavailable for ${normBase}/${normQuote}`,
  };

  // Same token check
  if (normBase === normQuote) {
    return {
      ...defaultUnavailable,
      errorMessage: "Select two different tokens to display a chart",
    };
  }

  const pairInfo = getBinancePair(normBase, normQuote);

  if (!pairInfo) {
    return defaultUnavailable;
  }

  const config = TIMEFRAME_CONFIG[timeframe] || TIMEFRAME_CONFIG["1D"];

  try {
    const [klineRes, tickerRes] = await Promise.all([
      fetch(
        `https://api.binance.com/api/v3/klines?symbol=${pairInfo.pair}&interval=${config.interval}&limit=${config.limit}`,
        { headers: { Accept: "application/json" } }
      ),
      fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pairInfo.pair}`, {
        headers: { Accept: "application/json" },
      }),
    ]);

    if (!klineRes.ok) {
      return {
        ...defaultUnavailable,
        errorMessage: `Market data provider returned HTTP ${klineRes.status}`,
      };
    }

    const rawKlines: any[][] = await klineRes.json();
    if (!Array.isArray(rawKlines) || rawKlines.length === 0) {
      return defaultUnavailable;
    }

    let tickerData: any = {};
    if (tickerRes.ok) {
      tickerData = await tickerRes.json().catch(() => ({}));
    }

    const rawCandles: Candle[] = rawKlines.map((k) => {
      const openTimeSec = Math.floor(Number(k[0]) / 1000);
      let open = parseFloat(k[1]);
      let high = parseFloat(k[2]);
      let low = parseFloat(k[3]);
      let close = parseFloat(k[4]);
      let volume = parseFloat(k[5]);

      if (pairInfo.inverted) {
        open = open > 0 ? 1 / open : 0;
        close = close > 0 ? 1 / close : 0;
        high = high > 0 ? 1 / high : 0;
        low = low > 0 ? 1 / low : 0;
      }

      return {
        time: openTimeSec,
        open,
        high,
        low,
        close,
        volume,
      };
    });

    const latestCandle = rawCandles[rawCandles.length - 1];
    const currentPrice = latestCandle.close;
    const high24h = Math.max(...rawCandles.map((c) => c.high));
    const low24h = Math.min(...rawCandles.map((c) => c.low));
    let changePercent24h = 0;
    let change24h = 0;

    if (tickerData.priceChangePercent) {
      changePercent24h = pairInfo.inverted
        ? -parseFloat(tickerData.priceChangePercent)
        : parseFloat(tickerData.priceChangePercent);
      change24h = pairInfo.inverted
        ? -parseFloat(tickerData.priceChange || "0")
        : parseFloat(tickerData.priceChange || "0");
    } else if (rawCandles.length > 1) {
      const firstClose = rawCandles[0].open;
      change24h = currentPrice - firstClose;
      changePercent24h = firstClose > 0 ? (change24h / firstClose) * 100 : 0;
    }

    const result: PairMarketData = {
      symbol: `${normBase}/${normQuote}`,
      baseSymbol: normBase,
      quoteSymbol: normQuote,
      candles: rawCandles,
      timeframe,
      currentPrice,
      change24h,
      changePercent24h,
      high24h,
      low24h,
      volume24h: parseFloat(tickerData.volume || "0"),
      lastUpdated: Date.now(),
      source: "Binance Public Market Data",
      isAvailable: true,
    };

    candleCache.set(cacheKey, { data: result, expiry: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err: any) {
    return {
      ...defaultUnavailable,
      errorMessage: err?.message || "Failed to connect to market data feed",
    };
  }
}

/**
 * WebSocket subscription manager for live Binance Klines.
 * Subscribes to wss://stream.binance.com:9443/ws/{pair}@kline_{interval}
 * Handles automatic reconnect with exponential backoff, token switching cleanup,
 * and passes candle updates to onUpdate callback.
 */
export interface BinanceWsKlineEvent {
  e: string; // Event type
  E: number; // Event time
  s: string; // Symbol
  k: {
    t: number; // Kline start time
    T: number; // Kline close time
    s: string; // Symbol
    i: string; // Interval
    o: string; // Open price
    c: string; // Close price
    h: string; // High price
    l: string; // Low price
    v: string; // Base asset volume
    x: boolean; // Is this kline closed?
  };
}

export type WsStatus = "connecting" | "connected" | "disconnected" | "error";

export interface LiveKlineSubscription {
  close: () => void;
}

export function subscribeBinanceKline(
  baseSymbol: string,
  quoteSymbol: string,
  timeframe: Timeframe,
  callbacks: {
    onCandleUpdate: (candle: Candle, isClosed: boolean, rawPrice: number) => void;
    onStatusChange: (status: WsStatus) => void;
  }
): LiveKlineSubscription {
  const normBase = normaliseSymbol(baseSymbol);
  const normQuote = normaliseSymbol(quoteSymbol);
  const pairInfo = getBinancePair(normBase, normQuote);

  if (!pairInfo) {
    callbacks.onStatusChange("disconnected");
    return { close: () => {} };
  }

  const interval = TIMEFRAME_CONFIG[timeframe]?.interval || "1h";
  const streamName = `${pairInfo.pair.toLowerCase()}@kline_${interval}`;
  const wsUrl = `wss://stream.binance.com:9443/ws/${streamName}`;

  let ws: WebSocket | null = null;
  let isClosedManually = false;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;

  const connect = () => {
    if (isClosedManually) return;
    callbacks.onStatusChange("connecting");

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (isClosedManually) {
          ws?.close();
          return;
        }
        reconnectAttempts = 0;
        callbacks.onStatusChange("connected");
      };

      ws.onmessage = (event) => {
        if (isClosedManually) return;
        try {
          const data: BinanceWsKlineEvent = JSON.parse(event.data);
          if (data && data.k) {
            const k = data.k;
            const openTimeSec = Math.floor(k.t / 1000);
            let open = parseFloat(k.o);
            let high = parseFloat(k.h);
            let low = parseFloat(k.l);
            let close = parseFloat(k.c);
            const volume = parseFloat(k.v);
            const isClosed = k.x;

            if (pairInfo.inverted) {
              open = open > 0 ? 1 / open : 0;
              close = close > 0 ? 1 / close : 0;
              high = high > 0 ? 1 / high : 0;
              low = low > 0 ? 1 / low : 0;
            }

            callbacks.onCandleUpdate(
              {
                time: openTimeSec,
                open,
                high,
                low,
                close,
                volume,
              },
              isClosed,
              close
            );
          }
        } catch {
          // Ignore malformed message
        }
      };

      ws.onerror = () => {
        callbacks.onStatusChange("error");
      };

      ws.onclose = () => {
        if (!isClosedManually) {
          callbacks.onStatusChange("disconnected");
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const backoffMs = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
            reconnectAttempts++;
            reconnectTimeout = setTimeout(connect, backoffMs);
          }
        }
      };
    } catch {
      callbacks.onStatusChange("error");
    }
  };

  connect();

  return {
    close: () => {
      isClosedManually = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
        ws = null;
      }
      callbacks.onStatusChange("disconnected");
    },
  };
}
