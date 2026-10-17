"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  BarChart2,
  LineChart as LineChartIcon,
  AlertCircle,
  Crosshair,
  Clock,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Radio,
  ArrowRight,
} from "lucide-react";
import {
  fetchPairMarketData,
  subscribeBinanceKline,
  type Candle,
  type PairMarketData,
  type Timeframe,
  type WsStatus,
} from "@/lib/candles";
import { formatWithSmartPrecision } from "@/lib/quote";
import { TokenIcon } from "./TokenIcon";

interface TradingChartProps {
  baseSymbol: string;
  quoteSymbol: string;
  tradeMode?: "market" | "limit";
  targetPrice?: string;
  onSelectTargetPrice?: (price: string) => void;
}

export function TradingChart({
  baseSymbol,
  quoteSymbol,
  tradeMode = "market",
  targetPrice,
  onSelectTargetPrice,
}: TradingChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [chartType, setChartType] = useState<"area" | "candle">("area");
  const [marketData, setMarketData] = useState<PairMarketData | null>(null);
  const [candlesState, setCandlesState] = useState<Candle[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>("disconnected");
  const [lastTickTime, setLastTickTime] = useState<number>(Date.now());

  // Interactive Hover
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; price: number } | null>(null);

  // Zoom & Pan State (Windowing)
  // zoomLevel: fraction of total candles visible (e.g. 1.0 = all, 0.25 = 25% of candles)
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  // panOffset: index shift from the right edge (0 = at live edge, >0 = viewing history)
  const [panOffset, setPanOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartXRef = useRef<number>(0);
  const dragStartPanRef = useRef<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Load Initial Historical Data via REST
  const loadData = useCallback(
    async (tf: Timeframe, showSpinner = false) => {
      if (showSpinner) setIsLoading(true);
      else setIsRefreshing(true);

      try {
        const data = await fetchPairMarketData(baseSymbol, quoteSymbol, tf);
        setMarketData(data);
        setCandlesState(data.candles);
        // Reset zoom & pan to live edge on new pair / timeframe
        setZoomLevel(1.0);
        setPanOffset(0);
      } catch {
        // Fallback handled in fetchPairMarketData
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [baseSymbol, quoteSymbol]
  );

  useEffect(() => {
    loadData(timeframe, true);
  }, [loadData, timeframe]);

  // 2. Subscribe to Binance Live WebSocket Stream
  useEffect(() => {
    let isSubscribed = true;

    const sub = subscribeBinanceKline(baseSymbol, quoteSymbol, timeframe, {
      onCandleUpdate: (liveCandle, isClosed, currentLivePrice) => {
        if (!isSubscribed) return;

        setLastTickTime(Date.now());

        setCandlesState((prev) => {
          if (!prev || prev.length === 0) return [liveCandle];

          const updated = [...prev];
          const lastIdx = updated.length - 1;
          const lastCandle = updated[lastIdx];

          // Same candle interval: update current candle
          if (lastCandle.time === liveCandle.time) {
            updated[lastIdx] = {
              ...lastCandle,
              high: Math.max(lastCandle.high, liveCandle.high),
              low: Math.min(lastCandle.low, liveCandle.low),
              close: liveCandle.close,
              volume: liveCandle.volume,
            };
          } else if (liveCandle.time > lastCandle.time) {
            // New interval opened: append new candle
            updated.push(liveCandle);
          }
          return updated;
        });

        // Also update current live price in header
        setMarketData((prev) => {
          if (!prev) return prev;
          const current = liveCandle.close;
          const first = prev.candles[0]?.open || current;
          const change = current - first;
          const changePct = first > 0 ? (change / first) * 100 : 0;
          return {
            ...prev,
            currentPrice: current,
            change24h: change,
            changePercent24h: changePct,
            lastUpdated: Date.now(),
          };
        });
      },
      onStatusChange: (status) => {
        if (isSubscribed) {
          setWsStatus(status);
        }
      },
    });

    return () => {
      isSubscribed = false;
      sub.close();
    };
  }, [baseSymbol, quoteSymbol, timeframe]);

  // Determine Visible Window of Candles based on zoomLevel and panOffset
  const visibleCandles = useMemo(() => {
    const total = candlesState.length;
    if (total === 0) return [];

    const minVisible = 10;
    const count = Math.max(minVisible, Math.min(total, Math.round(total * zoomLevel)));

    // Maximum pan back in time
    const maxPan = total - count;
    const clampedPan = Math.max(0, Math.min(maxPan, panOffset));

    const endIndex = total - clampedPan;
    const startIndex = Math.max(0, endIndex - count);

    return candlesState.slice(startIndex, endIndex);
  }, [candlesState, zoomLevel, panOffset]);

  const isAvailable = (marketData?.isAvailable ?? false) && visibleCandles.length > 0;
  const isViewingHistory = panOffset > 0;

  // Zoom Actions
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.max(0.2, prev * 0.75));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => {
      const next = Math.min(1.0, prev * 1.33);
      if (next >= 1.0) setPanOffset(0);
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomLevel(1.0);
    setPanOffset(0);
  };

  const handleReturnToLive = () => {
    setPanOffset(0);
  };

  // Wheel Zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  // Mouse Drag Panning
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return; // Left click only
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartPanRef.current = panOffset;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch Gesture Panning
  const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartXRef.current = e.touches[0].clientX;
      dragStartPanRef.current = panOffset;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (!isDragging || e.touches.length !== 1 || candlesState.length === 0) return;
    const deltaX = e.touches[0].clientX - dragStartXRef.current;
    const sensitivity = 0.3;
    const panChange = Math.round(deltaX * sensitivity);
    const newPan = Math.max(0, Math.min(candlesState.length - 10, dragStartPanRef.current + panChange));
    setPanOffset(newPan);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Min and Max prices for chart scale (computed on visible candles)
  const { minPrice, maxPrice, priceRange } = useMemo(() => {
    if (!visibleCandles.length) return { minPrice: 0, maxPrice: 1, priceRange: 1 };
    let min = Infinity;
    let max = -Infinity;
    for (const c of visibleCandles) {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
    }
    // Include target price in scale if present in limit mode
    if (tradeMode === "limit" && targetPrice && parseFloat(targetPrice) > 0) {
      const tp = parseFloat(targetPrice);
      if (tp < min) min = tp;
      if (tp > max) max = tp;
    }
    const span = max - min || 1;
    const paddedMin = Math.max(0, min - span * 0.05);
    const paddedMax = max + span * 0.05;
    return {
      minPrice: paddedMin,
      maxPrice: paddedMax,
      priceRange: paddedMax - paddedMin || 1,
    };
  }, [visibleCandles, tradeMode, targetPrice]);

  const maxVolume = useMemo(() => {
    if (!visibleCandles.length) return 1;
    return Math.max(...visibleCandles.map((c) => c.volume), 1);
  }, [visibleCandles]);

  // Viewbox coordinates
  const svgWidth = 800;
  const svgHeight = 360;
  const chartHeight = 280;
  const volumeHeight = 60;
  const volumeTop = chartHeight + 10;

  // Scale helpers
  const getX = useCallback(
    (index: number) => {
      if (visibleCandles.length <= 1) return svgWidth / 2;
      return (index / (visibleCandles.length - 1)) * (svgWidth - 20) + 10;
    },
    [visibleCandles.length]
  );

  const getY = useCallback(
    (price: number) => {
      return chartHeight - ((price - minPrice) / priceRange) * (chartHeight - 30) - 15;
    },
    [minPrice, priceRange]
  );

  const getPriceFromY = useCallback(
    (y: number) => {
      const normalised = (chartHeight - 15 - y) / (chartHeight - 30);
      return minPrice + normalised * priceRange;
    },
    [minPrice, priceRange]
  );

  // Generate Area Path
  const areaPath = useMemo(() => {
    if (!visibleCandles.length) return "";
    let d = `M ${getX(0)} ${getY(visibleCandles[0].close)}`;
    for (let i = 1; i < visibleCandles.length; i++) {
      const x = getX(i);
      const y = getY(visibleCandles[i].close);
      d += ` L ${x} ${y}`;
    }
    return d;
  }, [visibleCandles, getX, getY]);

  const areaFilledPath = useMemo(() => {
    if (!visibleCandles.length) return "";
    const startX = getX(0);
    const endX = getX(visibleCandles.length - 1);
    return `${areaPath} L ${endX} ${chartHeight} L ${startX} ${chartHeight} Z`;
  }, [areaPath, visibleCandles.length, getX]);

  // Format price
  const displayPrice = hoveredCandle
    ? hoveredCandle.close
    : marketData?.currentPrice || 0;

  const isPositive = (marketData?.changePercent24h ?? 0) >= 0;

  // Target price coordinate
  const targetPriceNum = parseFloat(targetPrice || "0");
  const targetPriceY =
    tradeMode === "limit" && !isNaN(targetPriceNum) && targetPriceNum > 0
      ? getY(targetPriceNum)
      : null;

  // Mouse move handler (crosshair + dragging)
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isDragging && candlesState.length > 0) {
      const deltaX = e.clientX - dragStartXRef.current;
      // Negative deltaX means dragged left -> view newer candles; positive deltaX -> view older
      const sensitivity = 0.25;
      const panChange = Math.round(deltaX * sensitivity);
      const newPan = Math.max(
        0,
        Math.min(candlesState.length - 10, dragStartPanRef.current + panChange)
      );
      setPanOffset(newPan);
      return;
    }

    if (!visibleCandles.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const scaleX = svgWidth / rect.width;
    const scaleY = svgHeight / rect.height;

    const x = clientX * scaleX;
    const y = clientY * scaleY;

    // Find nearest visible candle
    const index = Math.max(
      0,
      Math.min(
        visibleCandles.length - 1,
        Math.round(((x - 10) / (svgWidth - 20)) * (visibleCandles.length - 1))
      )
    );

    const candle = visibleCandles[index];
    const price = getPriceFromY(y);

    setHoveredCandle(candle);
    setCursorPos({ x: getX(index), y, price });
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setHoveredCandle(null);
    setCursorPos(null);
  };

  const handleClickChart = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isDragging) return;
    if (!onSelectTargetPrice || tradeMode !== "limit") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientY = e.clientY - rect.top;
    const scaleY = svgHeight / rect.height;
    const y = clientY * scaleY;
    const clickedPrice = getPriceFromY(y);
    if (clickedPrice > 0) {
      onSelectTargetPrice(formatWithSmartPrecision(clickedPrice));
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 backdrop-blur-xl shadow-2xl relative overflow-hidden flex flex-col gap-4">
      {/* Top Header: Pair, Price, Live Indicator & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        {/* Left: Pair & Live Price */}
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            <TokenIcon symbol={baseSymbol} size={24} />
            <TokenIcon symbol={quoteSymbol} size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-lg tracking-tight">
                {baseSymbol} / {quoteSymbol}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider bg-slate-800 text-slate-300 border border-slate-700/60 uppercase">
                Reference Market
              </span>

              {/* WebSocket Live Stream Connection Indicator */}
              <div
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono border transition-colors ${
                  wsStatus === "connected"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : wsStatus === "connecting"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
                title={`Market feed: ${wsStatus}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    wsStatus === "connected"
                      ? "bg-emerald-400 animate-pulse"
                      : wsStatus === "connecting"
                      ? "bg-amber-400 animate-ping"
                      : "bg-slate-500"
                  }`}
                />
                <span className="capitalize">{wsStatus === "connected" ? "Live" : wsStatus}</span>
              </div>
            </div>

            <div className="flex items-baseline gap-2.5 mt-0.5">
              <span className="text-2xl font-extrabold text-white tracking-tight">
                ${formatWithSmartPrecision(displayPrice)}
              </span>
              {marketData?.isAvailable && (
                <div
                  className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md ${
                    isPositive
                      ? "text-emerald-400 bg-emerald-500/10"
                      : "text-rose-400 bg-rose-500/10"
                  }`}
                >
                  {isPositive ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isPositive ? "+" : ""}
                    {marketData.changePercent24h.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Zoom Controls, Timeframe & Chart Style */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Zoom Navigation Controls */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 gap-0.5">
            <button
              onClick={handleZoomIn}
              disabled={zoomLevel <= 0.2}
              title="Zoom In (or Scroll Wheel Up)"
              aria-label="Zoom in on price chart"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 disabled:opacity-30 transition-all"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleZoomOut}
              disabled={zoomLevel >= 1.0}
              title="Zoom Out (or Scroll Wheel Down)"
              aria-label="Zoom out on price chart"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 disabled:opacity-30 transition-all"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetZoom}
              title="Fit Chart / Reset Zoom"
              aria-label="Reset chart zoom"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Return to Live Edge Button (shown when viewing past candles) */}
          {isViewingHistory && (
            <button
              onClick={handleReturnToLive}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl hover:bg-emerald-500/30 transition-all animate-pulse"
              title="Jump to current live price"
            >
              <Radio className="w-3 h-3 text-emerald-400" />
              <span>Live Edge</span>
            </button>
          )}

          {/* Timeframe Selector */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(["1H", "1D", "1W", "1M"] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                  timeframe === tf
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Chart Style Toggle (Area vs Candle) */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setChartType("area")}
              title="Line / Area Chart"
              aria-label="Switch to Area Chart"
              className={`p-1.5 rounded-lg transition-all ${
                chartType === "area"
                  ? "bg-cyan-500/20 text-cyan-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <LineChartIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setChartType("candle")}
              title="Candlestick Chart"
              aria-label="Switch to Candlestick Chart"
              className={`p-1.5 rounded-lg transition-all ${
                chartType === "candle"
                  ? "bg-cyan-500/20 text-cyan-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Refresh button */}
          <button
            onClick={() => loadData(timeframe, false)}
            disabled={isRefreshing}
            title="Refresh Market Data"
            aria-label="Refresh price data"
            className="p-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Hover Information Bar & Target Rate Hint */}
      <div className="h-6 flex items-center justify-between text-xs text-slate-400">
        {hoveredCandle ? (
          <div className="flex items-center gap-4 text-[11px] font-mono">
            <span>
              Time:{" "}
              <strong className="text-slate-200">
                {new Date(hoveredCandle.time * 1000).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </strong>
            </span>
            <span>
              O:{" "}
              <strong className="text-slate-200">
                ${formatWithSmartPrecision(hoveredCandle.open)}
              </strong>
            </span>
            <span>
              H:{" "}
              <strong className="text-slate-200">
                ${formatWithSmartPrecision(hoveredCandle.high)}
              </strong>
            </span>
            <span>
              L:{" "}
              <strong className="text-slate-200">
                ${formatWithSmartPrecision(hoveredCandle.low)}
              </strong>
            </span>
            <span>
              C:{" "}
              <strong
                className={
                  hoveredCandle.close >= hoveredCandle.open
                    ? "text-emerald-400"
                    : "text-rose-400"
                }
              >
                ${formatWithSmartPrecision(hoveredCandle.close)}
              </strong>
            </span>
            <span>
              Vol:{" "}
              <strong className="text-slate-200">
                {hoveredCandle.volume.toLocaleString("en-US", {
                  maximumFractionDigits: 1,
                })}
              </strong>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              Live feed via Binance Public Market Data • Scroll or drag to explore history
            </span>
          </div>
        )}

        {tradeMode === "limit" && (
          <div className="flex items-center gap-1.5 text-amber-400/90 text-[11px] bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
            <Crosshair className="w-3 h-3" />
            <span>Click chart to set target limit price</span>
          </div>
        )}
      </div>

      {/* Main Chart Area */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        className="relative w-full h-[320px] bg-slate-950/40 rounded-xl border border-slate-800/60 overflow-hidden flex items-center justify-center select-none"
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <span className="text-xs font-medium">Fetching verified market data...</span>
          </div>
        ) : !isAvailable ? (
          <div className="flex flex-col items-center justify-center gap-2 p-6 text-center max-w-md">
            <AlertCircle className="w-8 h-8 text-amber-400" />
            <h4 className="text-sm font-semibold text-slate-200">
              Live Market Chart Unavailable
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              {marketData?.errorMessage ||
                `Direct market candles for ${baseSymbol}/${quoteSymbol} are not indexed on public feeds.`}
            </p>
            <div className="mt-2 text-[11px] text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
              On-chain testnet swaps and limit orders remain available and functional.
            </div>
            <button
              onClick={() => loadData(timeframe, true)}
              className="mt-3 px-3 py-1 text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/30 transition-all"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className={`w-full h-full ${isDragging ? "cursor-grabbing" : "cursor-crosshair"}`}
            preserveAspectRatio="none"
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={handleClickChart}
          >
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                <stop offset="60%" stopColor="#06b6d4" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.00" />
              </linearGradient>
            </defs>

            {/* Horizontal Price Grid Lines */}
            {[0.2, 0.4, 0.6, 0.8].map((ratio) => {
              const p = minPrice + (1 - ratio) * priceRange;
              const y = chartHeight * ratio;
              return (
                <g key={ratio}>
                  <line
                    x1="0"
                    y1={y}
                    x2={svgWidth}
                    y2={y}
                    stroke="#1e293b"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text
                    x={svgWidth - 10}
                    y={y - 4}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    ${formatWithSmartPrecision(p)}
                  </text>
                </g>
              );
            })}

            {/* Volume Bars */}
            {visibleCandles.map((c, i) => {
              const x = getX(i);
              const barH = (c.volume / maxVolume) * volumeHeight;
              const y = volumeTop + (volumeHeight - barH);
              const barWidth = Math.max(
                2,
                (svgWidth / visibleCandles.length) * 0.6
              );
              const isUp = c.close >= c.open;
              return (
                <rect
                  key={`vol-${c.time}-${i}`}
                  x={x - barWidth / 2}
                  y={y}
                  width={barWidth}
                  height={barH}
                  fill={isUp ? "#10b981" : "#f43f5e"}
                  opacity="0.25"
                />
              );
            })}

            {/* Chart Type: Area Plot */}
            {chartType === "area" && (
              <>
                <path d={areaFilledPath} fill="url(#areaGradient)" />
                <path
                  d={areaPath}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}

            {/* Chart Type: Candlestick Plot */}
            {chartType === "candle" &&
              visibleCandles.map((c, i) => {
                const x = getX(i);
                const openY = getY(c.open);
                const closeY = getY(c.close);
                const highY = getY(c.high);
                const lowY = getY(c.low);
                const isUp = c.close >= c.open;
                const candleColor = isUp ? "#10b981" : "#f43f5e";
                const bodyY = Math.min(openY, closeY);
                const bodyHeight = Math.max(2, Math.abs(openY - closeY));
                const candleWidth = Math.max(
                  3,
                  (svgWidth / visibleCandles.length) * 0.7
                );

                return (
                  <g key={`candle-${c.time}-${i}`}>
                    {/* High-Low Wick */}
                    <line
                      x1={x}
                      y1={highY}
                      x2={x}
                      y2={lowY}
                      stroke={candleColor}
                      strokeWidth="1.2"
                    />
                    {/* Candle Body */}
                    <rect
                      x={x - candleWidth / 2}
                      y={bodyY}
                      width={candleWidth}
                      height={bodyHeight}
                      fill={candleColor}
                      rx="1"
                    />
                  </g>
                );
              })}

            {/* Target Limit Price Indicator Line */}
            {targetPriceY !== null && (
              <g>
                <line
                  x1="0"
                  y1={targetPriceY}
                  x2={svgWidth}
                  y2={targetPriceY}
                  stroke="#fbbf24"
                  strokeDasharray="6 4"
                  strokeWidth="1.5"
                />
                <rect
                  x="10"
                  y={targetPriceY - 11}
                  width="130"
                  height="20"
                  rx="4"
                  fill="#78350f"
                  stroke="#fbbf24"
                  strokeWidth="1"
                />
                <text
                  x="18"
                  y={targetPriceY + 3}
                  fill="#fef3c7"
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  TARGET: ${formatWithSmartPrecision(targetPriceNum)}
                </text>
              </g>
            )}

            {/* Interactive Crosshair & Cursor */}
            {cursorPos && (
              <g>
                {/* Vertical cursor line */}
                <line
                  x1={cursorPos.x}
                  y1="0"
                  x2={cursorPos.x}
                  y2={chartHeight}
                  stroke="#94a3b8"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                />
                {/* Horizontal cursor line */}
                <line
                  x1="0"
                  y1={cursorPos.y}
                  x2={svgWidth}
                  y2={cursorPos.y}
                  stroke="#94a3b8"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                />
                {/* Floating price tag on right Y-axis */}
                <rect
                  x={svgWidth - 75}
                  y={cursorPos.y - 10}
                  width="70"
                  height="20"
                  rx="4"
                  fill="#0f172a"
                  stroke="#38bdf8"
                  strokeWidth="1"
                />
                <text
                  x={svgWidth - 40}
                  y={cursorPos.y + 4}
                  textAnchor="middle"
                  fill="#38bdf8"
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  ${formatWithSmartPrecision(cursorPos.price)}
                </text>
              </g>
            )}
          </svg>
        )}
      </div>

      {/* Footer / Transparency Attribution */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-3">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              wsStatus === "connected" ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
            }`}
          />
          <span>Binance Spot Market Data (Reference)</span>
        </div>
        <div className="text-slate-400">
          <span>Testnet trades execute against simulated on-chain liquidity</span>
        </div>
      </div>
    </div>
  );
}
