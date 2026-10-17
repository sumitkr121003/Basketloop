"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, usePublicClient, useBalance, useChainId } from "wagmi";
import { parseUnits, formatUnits, decodeEventLog } from "viem";
import {
  ArrowDown,
  AlertCircle,
  CheckCircle2,
  Loader2,
  SlidersHorizontal,
  ShieldAlert,
  Fuel,
  Wallet,
  Clock,
  Ban,
  TrendingUp,
  History as HistoryIcon,
  RefreshCw,
  Info,
  ExternalLink,
} from "lucide-react";
import {
  getTokensForChain,
  getWrappedToken,
  isNativeToken,
  ZERO_ADDRESS,
  type TokenInfo,
} from "@/lib/tokens";
import {
  DEFAULT_CONTRACTS,
  erc20Abi,
  dexRouterAbi,
  limitOrderManagerAbi,
} from "@/lib/contracts";
import { fetchMultipleTokenPrices, type TokenPrice } from "@/lib/prices";
import { calculateSafeGasCost, DEFAULT_SWAP_GAS, DEFAULT_APPROVE_GAS } from "@/lib/gas";
import { calculateSwapQuote, formatWithSmartPrecision } from "@/lib/quote";
import { recordActivity, formatRelativeTime } from "@/lib/activity";
import {
  EXPIRY_OPTIONS,
  calculateLimitOrderOutputs,
  getLimitOrderStatusBadge,
  getStoredLimitOrders,
  saveLimitOrder,
  updateLimitOrderStatus,
  mapOnChainStatus,
  validateCustomExpiry,
  formatExpiryDisplay,
  type LimitOrderData,
  type LimitOrderStatus,
} from "@/lib/limitOrders";
import { TokenSelectModal } from "@/components/TokenSelectModal";
import { TokenIcon } from "@/components/TokenIcon";
import { TradingChart } from "@/components/TradingChart";
import { OrderCancelModal } from "@/components/OrderCancelModal";

export default function SwapPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const curatedTokens = useMemo(() => getTokensForChain(chainId), [chainId]);
  const wrappedToken = useMemo(() => getWrappedToken(chainId), [chainId]);

  // Order Mode: "market" | "limit" (Jupiter Spot Style)
  const [tradeMode, setTradeMode] = useState<"market" | "limit">("market");

  // Token Selection
  const [tokenIn, setTokenIn] = useState<TokenInfo>(curatedTokens[2] || curatedTokens[0]); // USDC default
  const [tokenOut, setTokenOut] = useState<TokenInfo>(curatedTokens[0]); // ETH default
  const [amountIn, setAmountIn] = useState<string>("100");

  // Market Mode Slippage
  const [slippage, setSlippage] = useState<number>(0.5);
  const [customSlippageInput, setCustomSlippageInput] = useState<string>("");
  const [isCustomSlippage, setIsCustomSlippage] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Limit Order State (Jupiter UX)
  const [targetPrice, setTargetPrice] = useState<string>("1.0");
  const [selectedExpirySeconds, setSelectedExpirySeconds] = useState<number>(86400); // 1 Day default
  const [isCustomExpiry, setIsCustomExpiry] = useState<boolean>(false);
  const [customExpiryDate, setCustomExpiryDate] = useState<string>("");
  const [activeOrderTab, setActiveOrderTab] = useState<"open" | "history">("open");
  const [storedOrders, setStoredOrders] = useState<LimitOrderData[]>([]);

  // Status & Feedback
  const [txMessage, setTxMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isCancellingId, setIsCancellingId] = useState<string | null>(null);

  // Cancellation Confirmation Modal State
  const [cancelModalOrder, setCancelModalOrder] = useState<LimitOrderData | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);

  // Quote Refresh Tracking
  const [quoteLastUpdated, setQuoteLastUpdated] = useState<number>(Date.now());
  const [isRefreshingQuote, setIsRefreshingQuote] = useState<boolean>(false);

  // Modals
  const [isTokenInModalOpen, setIsTokenInModalOpen] = useState(false);
  const [isTokenOutModalOpen, setIsTokenOutModalOpen] = useState(false);

  // Real-Time Prices State
  const [prices, setPrices] = useState<Record<string, TokenPrice | null>>({});
  const [pricesReady, setPricesReady] = useState(false);

  // Gas estimation state
  const [gasFeeEth, setGasFeeEth] = useState<string>("~0.000005 ETH");
  const [gasFeeUsd, setGasFeeUsd] = useState<string | null>("<$0.01");
  const [gasError, setGasError] = useState<string | null>(null);

  // Fetch real-time market prices
  useEffect(() => {
    let isMounted = true;
    const updatePrices = async () => {
      const syms = ["ETH", "WETH", "USDC", "USDT", "LINK", "UNI", "ARB"];
      const fetched = await fetchMultipleTokenPrices(syms);
      if (isMounted) {
        setPrices(fetched);
        setPricesReady(true);
        setQuoteLastUpdated(Date.now());
      }
    };

    updatePrices();
    const interval = setInterval(updatePrices, 20_000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Load and sync local limit orders
  const refreshOrders = useCallback(() => {
    setStoredOrders(getStoredLimitOrders());
  }, []);

  useEffect(() => {
    refreshOrders();
  }, [refreshOrders]);

  const isNativeIn = isNativeToken(tokenIn);
  const isNativeOut = isNativeToken(tokenOut);

  // Native ETH Balance
  const { data: ethBalanceData, refetch: refetchEthBalance } = useBalance({ address });

  // ERC-20 Balance for TokenIn
  const { data: erc20BalanceInData, refetch: refetchErc20BalanceIn } = useReadContract({
    address: isNativeIn ? undefined : tokenIn.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address && !isNativeIn ? [address] : undefined,
  });

  // ERC-20 Balance for TokenOut
  const { data: erc20BalanceOutData, refetch: refetchErc20BalanceOut } = useReadContract({
    address: isNativeOut ? undefined : tokenOut.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address && !isNativeOut ? [address] : undefined,
  });

  // Read Allowance for DEX Router (Market Orders)
  const { data: routerAllowanceData, refetch: refetchRouterAllowance } = useReadContract({
    address: isNativeIn ? undefined : tokenIn.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && !isNativeIn ? [address, DEFAULT_CONTRACTS.dexRouter] : undefined,
  });

  // Read Allowance for LimitOrderManager (Limit Orders)
  const isLimitContractConfigured =
    DEFAULT_CONTRACTS.limitOrderManager &&
    DEFAULT_CONTRACTS.limitOrderManager.toLowerCase() !== ZERO_ADDRESS.toLowerCase();

  const { data: limitAllowanceData, refetch: refetchLimitAllowance } = useReadContract({
    address: isNativeIn || !isLimitContractConfigured ? undefined : tokenIn.address,
    abi: erc20Abi,
    functionName: "allowance",
    args:
      address && !isNativeIn && isLimitContractConfigured
        ? [address, DEFAULT_CONTRACTS.limitOrderManager]
        : undefined,
  });

  const parsedAmountIn = useMemo(() => {
    try {
      return amountIn && parseFloat(amountIn) > 0 ? parseUnits(amountIn, tokenIn.decimals) : 0n;
    } catch {
      return 0n;
    }
  }, [amountIn, tokenIn.decimals]);

  // Determine swap path for Router
  const routerPath = useMemo(() => {
    const inAddr = isNativeIn ? wrappedToken.address : tokenIn.address;
    const outAddr = isNativeOut ? wrappedToken.address : tokenOut.address;
    return [inAddr, outAddr];
  }, [isNativeIn, isNativeOut, tokenIn.address, tokenOut.address, wrappedToken.address]);

  const isSameToken = routerPath[0].toLowerCase() === routerPath[1].toLowerCase();

  // Read On-Chain Router Quote
  const { data: amountsOutData } = useReadContract({
    address: DEFAULT_CONTRACTS.dexRouter,
    abi: dexRouterAbi,
    functionName: "getAmountsOut",
    args: parsedAmountIn > 0n && !isSameToken ? [parsedAmountIn, routerPath] : undefined,
  });

  // Market Order Quote Calculation
  const effectiveSlippage = isCustomSlippage ? parseFloat(customSlippageInput) || 0.5 : slippage;
  const isSlippageHigh = effectiveSlippage > 3.0;
  const isSlippageInvalid = isNaN(effectiveSlippage) || effectiveSlippage < 0.05 || effectiveSlippage > 50;

  const swapQuote = useMemo(() => {
    return calculateSwapQuote({
      tokenIn,
      tokenOut,
      amountIn,
      slippage: effectiveSlippage,
      prices,
      amountsOutOnChain:
        amountsOutData && amountsOutData.length > 1 ? amountsOutData[1] : undefined,
    });
  }, [tokenIn, tokenOut, amountIn, effectiveSlippage, amountsOutData, prices]);

  // Limit Order Output Calculation
  const limitOutputs = useMemo(() => {
    return calculateLimitOrderOutputs(
      amountIn,
      targetPrice,
      tokenIn.decimals,
      tokenOut.decimals
    );
  }, [amountIn, targetPrice, tokenIn.decimals, tokenOut.decimals]);

  // Dynamic safe gas calculation
  useEffect(() => {
    const calcGas = async () => {
      try {
        setGasError(null);
        const gasPrice = publicClient ? await publicClient.getGasPrice().catch(() => 10_000_000n) : 10_000_000n;
        const ethPrice = prices["ETH"]?.priceUsd || 2500;
        const res = calculateSafeGasCost(DEFAULT_SWAP_GAS, gasPrice, ethPrice);
        if (res.isValid) {
          setGasFeeEth(`~${res.feeEth} ETH`);
          setGasFeeUsd(res.feeUsd);
        } else {
          setGasError(res.error || "Fee estimation unavailable");
        }
      } catch {
        setGasError("Fee unavailable");
      }
    };
    calcGas();
  }, [publicClient, prices]);

  // Contract Writes
  const { writeContractAsync: approveAsync, isPending: isApproving } = useWriteContract();
  const { writeContractAsync: swapAsync, isPending: isSwapping } = useWriteContract();
  const { writeContractAsync: limitOrderAsync, isPending: isPlacingLimit } = useWriteContract();

  // Balance display helpers
  const userBalanceInFormatted = useMemo(() => {
    if (isNativeIn) {
      return ethBalanceData ? formatUnits(ethBalanceData.value, 18) : "0.00";
    }
    return erc20BalanceInData ? formatUnits(erc20BalanceInData, tokenIn.decimals) : "0.00";
  }, [isNativeIn, ethBalanceData, erc20BalanceInData, tokenIn.decimals]);

  const userBalanceOutFormatted = useMemo(() => {
    if (isNativeOut) {
      return ethBalanceData ? formatUnits(ethBalanceData.value, 18) : "0.00";
    }
    return erc20BalanceOutData ? formatUnits(erc20BalanceOutData, tokenOut.decimals) : "0.00";
  }, [isNativeOut, ethBalanceData, erc20BalanceOutData, tokenOut.decimals]);

  const rawUserBalance = isNativeIn ? ethBalanceData?.value ?? 0n : erc20BalanceInData ?? 0n;
  const isInsufficientBalance = parsedAmountIn > 0n && parsedAmountIn > rawUserBalance;

  // Allowance requirements for Market vs Limit
  const needsRouterApproval =
    tradeMode === "market" &&
    !isNativeIn &&
    routerAllowanceData !== undefined &&
    parsedAmountIn > 0n &&
    routerAllowanceData < parsedAmountIn;

  const needsLimitApproval =
    tradeMode === "limit" &&
    !isNativeIn &&
    isLimitContractConfigured &&
    limitAllowanceData !== undefined &&
    parsedAmountIn > 0n &&
    limitAllowanceData < parsedAmountIn;

  const handleInvert = () => {
    const prevIn = tokenIn;
    setTokenIn(tokenOut);
    setTokenOut(prevIn);
  };

  const handleSelectPresetSlippage = (val: number) => {
    setIsCustomSlippage(false);
    setSlippage(val);
  };

  const handleCustomSlippageChange = (val: string) => {
    setCustomSlippageInput(val);
    setIsCustomSlippage(true);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0.05 && parsed <= 50) {
      setSlippage(parsed);
    }
  };

  // Adjust target price by percentage — prefer live Binance reference price
  const handleAdjustTargetPrice = (pct: number) => {
    const pIn = prices[tokenIn.symbol.toUpperCase()]?.priceUsd;
    const pOut = prices[tokenOut.symbol.toUpperCase()]?.priceUsd;
    const liveRate =
      pIn && pOut && pIn > 0 && pOut > 0 ? pIn / pOut : null;
    const baseRate = liveRate || parseFloat(swapQuote.exchangeRate) || 1.0;
    const newPrice = baseRate * (1 + pct / 100);
    setTargetPrice(formatWithSmartPrecision(newPrice));
  };

  // ---------------------------------------------------------------------------
  // Market Order Execution
  // ---------------------------------------------------------------------------
  const handleApproveRouter = async () => {
    if (isNativeIn) return;
    try {
      setTxMessage(null);
      setIsConfirming(true);

      const amountToApprove = parsedAmountIn * 10n;

      const hash = await approveAsync({
        address: tokenIn.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [DEFAULT_CONTRACTS.dexRouter, amountToApprove],
        gas: DEFAULT_APPROVE_GAS,
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      await refetchRouterAllowance();

      setTxMessage({
        type: "success",
        text: `Approved ${tokenIn.symbol} for DEX Router (${DEFAULT_CONTRACTS.dexRouter.slice(0, 6)}...${DEFAULT_CONTRACTS.dexRouter.slice(-4)}) on Robinhood Chain Testnet.`,
      });

      recordActivity({
        type: "Token Approval",
        inputAmount: `${amountIn} ${tokenIn.symbol}`,
        outputDescription: `Spender: DEX Router (${DEFAULT_CONTRACTS.dexRouter.slice(0, 6)}...${DEFAULT_CONTRACTS.dexRouter.slice(-4)})`,
        status: "Success",
        txHash: hash,
        chainId: chainId || 46630,
      });
    } catch (err: any) {
      setTxMessage({ type: "error", text: err?.shortMessage || err?.message || "Approval failed" });
    } finally {
      setIsConfirming(false);
    }
  };

  const handleSwap = async () => {
    if (!address) return;
    try {
      setTxMessage(null);
      setIsConfirming(true);

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
      const minOut = swapQuote.minReceivedRaw > 0n ? swapQuote.minReceivedRaw : 1n;

      let hash: `0x${string}`;

      if (isNativeIn) {
        hash = await swapAsync({
          address: DEFAULT_CONTRACTS.dexRouter,
          abi: dexRouterAbi,
          functionName: "swapExactETHForTokens",
          args: [minOut, routerPath, address, deadline],
          value: parsedAmountIn,
          gas: DEFAULT_SWAP_GAS,
        });
      } else if (isNativeOut) {
        hash = await swapAsync({
          address: DEFAULT_CONTRACTS.dexRouter,
          abi: dexRouterAbi,
          functionName: "swapExactTokensForETH",
          args: [parsedAmountIn, minOut, routerPath, address, deadline],
          gas: DEFAULT_SWAP_GAS,
        });
      } else {
        hash = await swapAsync({
          address: DEFAULT_CONTRACTS.dexRouter,
          abi: dexRouterAbi,
          functionName: "swapExactTokensForTokens",
          args: [parsedAmountIn, minOut, routerPath, address, deadline],
          gas: DEFAULT_SWAP_GAS,
        });
      }

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      // Refresh balances
      await Promise.all([
        refetchEthBalance(),
        refetchErc20BalanceIn(),
        refetchErc20BalanceOut(),
        refetchRouterAllowance(),
      ]);

      const swappedAmount = amountIn;
      // Reset input form for next trade
      setAmountIn("");

      setTxMessage({
        type: "success",
        text: `Swapped ${swappedAmount} ${tokenIn.symbol} → ${swapQuote.expectedOutput} ${tokenOut.symbol}!`,
      });

      recordActivity({
        type: "Instant Swap",
        inputAmount: `${swappedAmount} ${tokenIn.symbol}`,
        outputDescription: `${swapQuote.expectedOutput} ${tokenOut.symbol}`,
        status: "Success",
        txHash: hash,
        chainId: chainId || 46630,
      });
    } catch (err: any) {
      setTxMessage({
        type: "error",
        text: err?.shortMessage || err?.message || "Swap transaction failed",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Limit Order Execution
  // ---------------------------------------------------------------------------
  const handleApproveLimit = async () => {
    if (isNativeIn || !isLimitContractConfigured) return;
    try {
      setTxMessage(null);
      setIsConfirming(true);

      const amountToApprove = parsedAmountIn * 10n;

      const hash = await approveAsync({
        address: tokenIn.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [DEFAULT_CONTRACTS.limitOrderManager, amountToApprove],
        gas: DEFAULT_APPROVE_GAS,
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      await refetchLimitAllowance();

      setTxMessage({
        type: "success",
        text: `Approved ${tokenIn.symbol} for LimitOrderManager (${DEFAULT_CONTRACTS.limitOrderManager.slice(0, 6)}...${DEFAULT_CONTRACTS.limitOrderManager.slice(-4)})`,
      });

      recordActivity({
        type: "Token Approval",
        inputAmount: `${amountIn} ${tokenIn.symbol}`,
        outputDescription: `Spender: LimitOrderManager (${DEFAULT_CONTRACTS.limitOrderManager.slice(0, 6)}...${DEFAULT_CONTRACTS.limitOrderManager.slice(-4)})`,
        status: "Success",
        txHash: hash,
        chainId: chainId || 46630,
      });
    } catch (err: any) {
      setTxMessage({ type: "error", text: err?.shortMessage || err?.message || "Approval failed" });
    } finally {
      setIsConfirming(false);
    }
  };

  const handlePlaceLimitOrder = async () => {
    if (!address) return;
    if (!limitOutputs.isValid) return;

    if (!isLimitContractConfigured) {
      setTxMessage({
        type: "error",
        text: "LimitOrderManager is not yet deployed on this network. Please deploy LimitOrderManager first.",
      });
      return;
    }

    try {
      setTxMessage(null);
      setIsConfirming(true);

      let expiryTimestamp = 0;
      if (isCustomExpiry) {
        const val = validateCustomExpiry(customExpiryDate);
        if (!val.isValid) {
          setTxMessage({ type: "error", text: val.error || "Invalid custom expiry date" });
          setIsConfirming(false);
          return;
        }
        expiryTimestamp = val.timestamp;
      } else {
        expiryTimestamp =
          selectedExpirySeconds > 0
            ? Math.floor(Date.now() / 1000) + selectedExpirySeconds
            : 0;
      }

      const inAddr = isNativeIn ? ZERO_ADDRESS : tokenIn.address;
      const outAddr = isNativeOut ? ZERO_ADDRESS : tokenOut.address;

      // 1. Submit on-chain createOrder via connected wallet
      const txHash = await limitOrderAsync({
        address: DEFAULT_CONTRACTS.limitOrderManager,
        abi: limitOrderManagerAbi,
        functionName: "createOrder",
        args: [
          inAddr,
          outAddr,
          limitOutputs.amountInRaw,
          limitOutputs.minAmountOutRaw,
          BigInt(expiryTimestamp),
        ],
        value: isNativeIn ? limitOutputs.amountInRaw : 0n,
      });

      // 2. Wait for block inclusion and receipt verification
      if (!publicClient) {
        throw new Error("Wallet not connected to RPC");
      }
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        throw new Error("Limit order transaction reverted on-chain");
      }

      // 3. Decode real on-chain orderId from OrderCreated event
      let onChainOrderId: string = `order-${Date.now()}`;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: limitOrderManagerAbi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "OrderCreated") {
            const args = decoded.args as { orderId: bigint };
            onChainOrderId = args.orderId.toString();
            break;
          }
        } catch {
          // Not our event — continue
        }
      }

      // 4. Persist order record with real on-chain ID
      const newOrder: LimitOrderData = {
        id: onChainOrderId,
        maker: address,
        tokenIn,
        tokenOut,
        amountIn,
        amountInRaw: limitOutputs.amountInRaw.toString(),
        minAmountOut: limitOutputs.minAmountOut,
        minAmountOutRaw: limitOutputs.minAmountOutRaw.toString(),
        targetPrice,
        expirySeconds: isCustomExpiry ? Math.max(0, expiryTimestamp - Math.floor(Date.now() / 1000)) : selectedExpirySeconds,
        expiryTimestamp,
        createdAt: Date.now(),
        status: "Open",
        txHash,
      };

      saveLimitOrder(newOrder);
      refreshOrders();

      await Promise.all([
        refetchEthBalance(),
        refetchErc20BalanceIn(),
        refetchLimitAllowance(),
      ]);

      const placedAmount = amountIn;
      // Reset limit order form for next order
      setAmountIn("");
      setIsCustomExpiry(false);
      setCustomExpiryDate("");
      setSelectedExpirySeconds(86400);

      setTxMessage({
        type: "success",
        text: `Limit order placed! Pay ${placedAmount} ${tokenIn.symbol} → Receive at least ${limitOutputs.minAmountOut} ${tokenOut.symbol}`,
      });

      recordActivity({
        type: "Limit Order Created",
        inputAmount: `${placedAmount} ${tokenIn.symbol}`,
        outputDescription: `Target: ≥${limitOutputs.minAmountOut} ${tokenOut.symbol}`,
        status: "Success",
        txHash,
        chainId: chainId || 46630,
      });
    } catch (err: any) {
      setTxMessage({
        type: "error",
        text: err?.shortMessage || err?.message || "Failed to place limit order",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  // Open cancellation confirmation modal
  const openCancelModal = (order: LimitOrderData) => {
    setCancelModalOrder(order);
    setIsCancelModalOpen(true);
  };

  // Cancel Limit Order — called after user confirms in the modal
  const handleCancelOrder = async (order: LimitOrderData) => {
    if (!address) return;
    try {
      setIsCancellingId(order.id);
      setTxMessage(null);

      let cancelHash: `0x${string}` | undefined;

      const isNumericId = /^\d+$/.test(order.id);
      if (isLimitContractConfigured && isNumericId) {
        cancelHash = await limitOrderAsync({
          address: DEFAULT_CONTRACTS.limitOrderManager,
          abi: limitOrderManagerAbi,
          functionName: "cancelOrder",
          args: [BigInt(order.id)],
        });

        if (!publicClient) throw new Error("No RPC client available");
        const receipt = await publicClient.waitForTransactionReceipt({ hash: cancelHash });
        if (receipt.status !== "success") {
          throw new Error("Cancellation transaction reverted on-chain");
        }
      }

      updateLimitOrderStatus(order.id, "Cancelled");
      refreshOrders();

      await Promise.all([refetchEthBalance(), refetchErc20BalanceIn()]);

      // Close modal on success
      setIsCancelModalOpen(false);
      setCancelModalOrder(null);

      setTxMessage({
        type: "success",
        text: `Order cancelled. 100% of escrowed ${order.amountIn} ${order.tokenIn.symbol} returned to your wallet.`,
      });

      if (cancelHash) {
        recordActivity({
          type: "Limit Order Cancelled",
          inputAmount: `${order.amountIn} ${order.tokenIn.symbol}`,
          outputDescription: "Escrow refunded to wallet",
          status: "Success",
          txHash: cancelHash,
          chainId: chainId || 46630,
        });
      }
    } catch (err: any) {
      setTxMessage({
        type: "error",
        text: err?.shortMessage || err?.message || "Failed to cancel order",
      });
    } finally {
      setIsCancellingId(null);
    }
  };

  const openOrders = useMemo(() => {
    return storedOrders.filter((o) => o.status === "Open");
  }, [storedOrders]);

  const historyOrders = useMemo(() => {
    return storedOrders.filter((o) => o.status !== "Open");
  }, [storedOrders]);

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col xl:flex-row gap-6 pt-4 sm:pt-8 pb-16 px-4 items-start">
      {/* Left: Trading Chart (hidden on very small screens, flex-1 on xl+) */}
      <div className="hidden xl:block xl:flex-1 min-w-0">
        <TradingChart
          baseSymbol={tokenIn.symbol}
          quoteSymbol={tokenOut.symbol}
          tradeMode={tradeMode}
          targetPrice={tradeMode === "limit" ? targetPrice : undefined}
          onSelectTargetPrice={tradeMode === "limit" ? setTargetPrice : undefined}
        />
      </div>

      {/* Right: Swap Card + Order Tracker */}
      <div className="w-full xl:w-[500px] shrink-0 flex flex-col items-center">
      {/* Stargate Transaction Card */}
      <div className="w-full max-w-[500px] rounded-3xl border border-border-subtle bg-surface p-6 shadow-stargate relative">
        {/* Card Header & Jupiter Mode Toggle */}
        <div className="flex items-center justify-between pb-4">
          <div className="space-y-0.5">
            <h1 className="text-xl font-bold tracking-tight text-text-primary flex items-center gap-2">
              {tradeMode === "market" ? "Instant Swap" : "Limit Order"}
            </h1>
            <p className="text-xs text-text-secondary">
              Robinhood Chain Testnet · {tradeMode === "market" ? "Market Order" : "Limit Order"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {tradeMode === "market" && (
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`rounded-xl p-2 transition-all ${
                  showSettings
                    ? "bg-surface-elevated text-text-primary border border-border-prominent"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated border border-transparent"
                }`}
                aria-label="Swap settings"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Jupiter Spot Segmented Tab Bar [ Market | Limit ] */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-surface-inset border border-border-subtle mb-4">
          <button
            type="button"
            onClick={() => setTradeMode("market")}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all ${
              tradeMode === "market"
                ? "bg-surface-elevated text-text-primary shadow-sm border border-border-prominent"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Market
          </button>
          <button
            type="button"
            onClick={() => setTradeMode("limit")}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all ${
              tradeMode === "limit"
                ? "bg-surface-elevated text-text-primary shadow-sm border border-border-prominent"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Limit
          </button>
        </div>

        {/* Slippage Settings Drawer (Market Mode Only) */}
        {tradeMode === "market" && showSettings && (
          <div className="mb-4 rounded-2xl border border-border-prominent bg-surface-elevated p-3.5 text-xs space-y-2.5 animate-in fade-in-0 duration-150">
            <div className="flex justify-between items-center text-text-secondary">
              <span className="font-medium text-text-primary">Slippage Tolerance</span>
              <span className="font-mono text-mint-400 font-semibold">{effectiveSlippage}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              {[0.1, 0.5, 1.0].map((val) => (
                <button
                  key={val}
                  onClick={() => handleSelectPresetSlippage(val)}
                  className={`flex-1 rounded-lg py-1.5 font-medium transition-all text-xs ${
                    !isCustomSlippage && slippage === val
                      ? "bg-mint-500 text-black font-semibold shadow-sm"
                      : "bg-surface border border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-prominent"
                  }`}
                >
                  {val}%
                </button>
              ))}

              <div className="relative flex-1">
                <input
                  type="number"
                  step="0.1"
                  min="0.05"
                  max="50"
                  placeholder="Custom"
                  value={customSlippageInput}
                  onChange={(e) => handleCustomSlippageChange(e.target.value)}
                  className={`w-full rounded-lg py-1 px-2 text-xs font-mono bg-surface border text-right outline-none text-text-primary placeholder:text-text-muted ${
                    isCustomSlippage ? "border-mint-500 text-mint-400 font-bold" : "border-border-subtle"
                  }`}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary text-[11px]">
                  {customSlippageInput ? "%" : ""}
                </span>
              </div>
            </div>

            {isSlippageHigh && (
              <div className="flex items-center gap-1.5 text-[11px] text-state-warning pt-1">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span>High slippage increases frontrunning risk. Minimum received will be lower.</span>
              </div>
            )}
            {isSlippageInvalid && (
              <div className="flex items-center gap-1.5 text-[11px] text-state-error pt-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Enter a valid slippage tolerance between 0.05% and 50.0%.</span>
              </div>
            )}
          </div>
        )}

        {/* Stacked Input Panels with Seam Invert Button */}
        <div className="space-y-1 relative">
          {/* Panel 1: Token In */}
          <div className="rounded-2xl border border-border-subtle bg-surface-inset p-4 transition-all focus-within:border-border-prominent hover:border-border-prominent/60">
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-text-secondary pb-2">
              <span>You Pay</span>
              <div className="flex items-center gap-1.5 lowercase">
                <Wallet className="h-3 w-3" />
                <span>bal:</span>
                <span className="font-mono text-text-primary font-semibold">
                  {parseFloat(userBalanceInFormatted).toFixed(4)}
                </span>
                <button
                  onClick={() => setAmountIn(userBalanceInFormatted)}
                  className="ml-1 text-[10px] font-mono font-bold uppercase tracking-wider text-mint-400 hover:text-mint-300 bg-mint-500/10 border border-mint-500/30 px-1.5 py-0.5 rounded transition-colors"
                >
                  Max
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <input
                  type="number"
                  placeholder="0.0"
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                  className="w-full bg-transparent text-3xl font-bold font-tabular text-text-primary outline-none placeholder:text-text-muted"
                />
                <div className="text-xs text-text-secondary mt-0.5">
                  {tokenIn.name}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsTokenInModalOpen(true)}
                className="flex items-center gap-2 rounded-full bg-surface-elevated hover:bg-surface-hover border border-border-prominent px-3.5 py-2 text-sm font-semibold text-text-primary transition-all shadow-sm shrink-0"
              >
                <TokenIcon symbol={tokenIn.symbol} size={22} />
                <span>{tokenIn.symbol}</span>
                <span className="text-text-secondary text-xs">&#9662;</span>
              </button>
            </div>
          </div>

          {/* Centered Seam Invert Button */}
          <div className="relative flex justify-center -my-3 z-10">
            <button
              onClick={handleInvert}
              className="group flex h-9 w-9 items-center justify-center rounded-full bg-surface border border-border-prominent text-text-secondary hover:text-text-primary hover:border-mint-500 hover:scale-105 active:scale-95 transition-all shadow-md"
              aria-label="Invert token swap direction"
            >
              <ArrowDown className="h-4 w-4 transition-transform duration-300 group-hover:rotate-180 text-mint-400" />
            </button>
          </div>

          {/* Panel 2: Token Out */}
          <div className="rounded-2xl border border-border-subtle bg-surface-inset p-4 transition-all focus-within:border-border-prominent hover:border-border-prominent/60">
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-text-secondary pb-2">
              <span>{tradeMode === "market" ? "You Receive (Estimated)" : "You Receive (Minimum Output)"}</span>
              <div className="flex items-center gap-1.5 lowercase">
                <Wallet className="h-3 w-3" />
                <span>bal:</span>
                <span className="font-mono text-text-primary font-semibold">
                  {parseFloat(userBalanceOutFormatted).toFixed(4)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <div className="w-full bg-transparent text-3xl font-bold font-tabular text-text-primary outline-none">
                  {isSameToken
                    ? "0.00"
                    : tradeMode === "market"
                    ? swapQuote.isValid
                      ? swapQuote.expectedOutput
                      : swapQuote.error
                      ? "—"
                      : "..."
                    : limitOutputs.isValid
                    ? limitOutputs.minAmountOut
                    : "—"}
                </div>
                <div className="text-xs text-mint-400 mt-0.5">
                  {isSameToken
                    ? "Select different tokens"
                    : tradeMode === "market"
                    ? swapQuote.isValid
                      ? `${tokenOut.name}`
                      : swapQuote.error || ""
                    : limitOutputs.isValid
                    ? `Target rate: ${targetPrice} ${tokenOut.symbol} per ${tokenIn.symbol}`
                    : limitOutputs.error || ""}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsTokenOutModalOpen(true)}
                className="flex items-center gap-2 rounded-full bg-surface-elevated hover:bg-surface-hover border border-border-prominent px-3.5 py-2 text-sm font-semibold text-text-primary transition-all shadow-sm shrink-0"
              >
                <TokenIcon symbol={tokenOut.symbol} size={22} />
                <span>{tokenOut.symbol}</span>
                <span className="text-text-secondary text-xs">&#9662;</span>
              </button>
            </div>
          </div>
        </div>

        {/* Limit Order Parameters: Target Price & Expiry */}
        {tradeMode === "limit" && (
          <div className="mt-3.5 space-y-3">
            {/* Target Price Card (Jupiter Spot Rate Bar) */}
            <div className="rounded-2xl border border-border-subtle bg-surface-inset p-3.5 text-xs space-y-2">
              <div className="flex justify-between items-center text-text-secondary">
                <span className="font-medium text-text-primary flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-mint-400" /> Target Rate
                </span>
                <span className="text-[11px] text-text-muted">
                  1 {tokenIn.symbol} = {targetPrice} {tokenOut.symbol}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    step="any"
                    placeholder="1.0"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    className="w-full rounded-xl bg-surface border border-border-subtle py-2 px-3 text-sm font-mono text-text-primary outline-none focus:border-border-prominent"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary font-mono text-xs">
                    {tokenOut.symbol}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleAdjustTargetPrice(0)}
                  className="rounded-xl px-2.5 py-2 bg-surface border border-border-subtle hover:border-mint-500/50 text-[11px] font-semibold text-text-primary transition-all"
                  title="Use Simulated Market Rate"
                >
                  Market
                </button>
              </div>

              {/* Quick rate adjustment chips */}
              <div className="flex items-center gap-1.5 pt-1">
                {[1, 5, 10].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handleAdjustTargetPrice(pct)}
                    className="flex-1 py-1 rounded-lg bg-surface border border-border-subtle hover:border-border-prominent text-[11px] font-mono text-text-secondary hover:text-text-primary transition-all text-center"
                  >
                    +{pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Expiry Selector (Jupiter Spot Expiry Pills) */}
            <div className="rounded-2xl border border-border-subtle bg-surface-inset p-3.5 text-xs space-y-2">
              <div className="flex justify-between items-center text-text-secondary">
                <span className="font-medium text-text-primary flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-cyan-400" /> Order Expiry
                </span>
                <span className="text-[11px] font-mono text-mint-400 font-semibold">
                  {isCustomExpiry
                    ? customExpiryDate
                      ? new Date(customExpiryDate).toLocaleDateString([], { month: "short", day: "numeric" }) +
                        " " +
                        new Date(customExpiryDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : "Select Date & Time"
                    : EXPIRY_OPTIONS.find((o) => o.seconds === selectedExpirySeconds)?.label}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {EXPIRY_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      setIsCustomExpiry(false);
                      setSelectedExpirySeconds(opt.seconds);
                    }}
                    className={`flex-1 min-w-[55px] rounded-lg py-1.5 font-medium transition-all text-xs text-center capitalize ${
                      !isCustomExpiry && selectedExpirySeconds === opt.seconds
                        ? "bg-mint-500 text-black font-semibold shadow-sm"
                        : "bg-surface border border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-prominent"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                {/* Custom Option Button */}
                <button
                  type="button"
                  onClick={() => setIsCustomExpiry(true)}
                  className={`flex-1 min-w-[55px] rounded-lg py-1.5 font-medium transition-all text-xs text-center ${
                    isCustomExpiry
                      ? "bg-mint-500 text-black font-semibold shadow-sm"
                      : "bg-surface border border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-prominent"
                  }`}
                >
                  Custom
                </button>
              </div>

              {/* Custom Date & Time Picker */}
              {isCustomExpiry && (
                <div className="pt-2 border-t border-border-subtle/60 flex flex-col gap-1.5">
                  <label className="text-[11px] text-text-secondary font-medium">
                    Select Expiry Date & Time (Local Timezone)
                  </label>
                  <input
                    type="datetime-local"
                    value={customExpiryDate}
                    min={new Date(Date.now() + 120_000).toISOString().slice(0, 16)}
                    onChange={(e) => setCustomExpiryDate(e.target.value)}
                    className="w-full rounded-xl bg-surface border border-border-subtle py-2 px-3 text-xs font-mono text-text-primary outline-none focus:border-mint-500"
                  />
                  <span className="text-[10px] text-text-muted">
                    Must be in the future. The order will automatically expire at this time.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Transaction Details & Disclaimers */}
        <div className="mt-4 rounded-2xl bg-surface-inset border border-border-subtle p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between text-text-secondary">
            <span>Estimated changes to your balance</span>
            <span className="font-mono text-text-primary font-medium">
              -{amountIn || "0"} {tokenIn.symbol} / +
              {tradeMode === "market"
                ? swapQuote.isValid
                  ? swapQuote.expectedOutput
                  : "—"
                : limitOutputs.isValid
                ? limitOutputs.minAmountOut
                : "—"}{" "}
              {tokenOut.symbol}
            </span>
          </div>

          {tradeMode === "market" ? (
            <>
              <div className="flex items-center justify-between text-text-secondary">
                <span>Exchange Rate</span>
                <span className="font-mono text-text-primary font-medium">
                  1 {tokenIn.symbol} ≈{" "}
                  {swapQuote.isValid
                    ? `${swapQuote.exchangeRate} ${tokenOut.symbol}`
                    : "—"}
                </span>
              </div>

              {swapQuote.referenceMarketRate && (
                <div className="flex items-center justify-between text-text-secondary">
                  <span className="flex items-center gap-1">
                    <Info className="h-3 w-3 text-cyan-400" />
                    Reference Market Rate
                  </span>
                  <span className="font-mono text-cyan-400 font-medium">
                    1 {tokenIn.symbol} ≈ {swapQuote.referenceMarketRate} {tokenOut.symbol}
                    <span className="text-text-muted ml-1 text-[10px]">({swapQuote.referencePriceSource || "Binance Live"})</span>
                  </span>
                </div>
              )}

              <div className="flex items-center gap-1 text-[10px] text-slate-500">
                <RefreshCw className="w-3 h-3" />
                <span>Quote updated {Math.round((Date.now() - quoteLastUpdated) / 1000)}s ago</span>
              </div>

              <div className="flex items-center justify-between text-text-secondary">
                <span>Minimum Received ({effectiveSlippage}%)</span>
                <span className="font-mono text-mint-400 font-medium">
                  {swapQuote.isValid ? swapQuote.minReceived : "—"} {tokenOut.symbol}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-text-secondary">
                <span>Order Status</span>
                <span className="font-mono text-mint-400 font-medium">
                  Waiting for target price
                </span>
              </div>

              <div className="flex items-center justify-between text-text-secondary">
                <span>Execution Condition</span>
                <span className="font-mono text-text-primary font-medium">
                  Executes when rate reaches {targetPrice} {tokenOut.symbol}
                </span>
              </div>

              <div className="flex items-center justify-between text-text-secondary">
                <span>Order Expiry</span>
                <span className="font-mono text-text-secondary">
                  {isCustomExpiry
                    ? customExpiryDate
                      ? new Date(customExpiryDate).toLocaleDateString([], { month: "short", day: "numeric" }) +
                        " " +
                        new Date(customExpiryDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : "Custom"
                    : EXPIRY_OPTIONS.find((o) => o.seconds === selectedExpirySeconds)?.label}
                </span>
              </div>
            </>
          )}

          <div className="flex items-center justify-between text-text-secondary">
            <span className="flex items-center gap-1">
              <Fuel className="h-3 w-3 text-cyan-400" /> Network Gas Fee
            </span>
            <span className="font-mono text-text-primary font-medium">
              {gasError ? (
                <span className="text-text-muted">{gasError}</span>
              ) : (
                `${gasFeeEth} ${gasFeeUsd ? `(${gasFeeUsd})` : ""}`
              )}
            </span>
          </div>

          <div className="border-t border-border-subtle/50 pt-2 mt-1 text-[11px] text-text-muted">
            {tradeMode === "market"
              ? "ℹ️ Testnet Pricing: Quotes reflect testnet exchange rates with simulated liquidity."
              : "ℹ️ Your order stays open until it executes, expires, or you cancel it. Any refundable funds are returned after a successful cancellation."}
          </div>
        </div>

        {/* Feedback Message */}
        {txMessage && (
          <div
            className={`mt-4 rounded-xl p-3 text-xs flex items-center gap-2 border ${
              txMessage.type === "success"
                ? "bg-mint-500/10 text-mint-400 border-mint-500/30"
                : "bg-stargate-error/10 text-stargate-error border-stargate-error/30"
            }`}
          >
            {txMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span className="leading-snug">{txMessage.text}</span>
          </div>
        )}

        {/* Action Button */}
        <div className="mt-5">
          {!isConnected ? (
            <div className="w-full text-center py-3 rounded-xl bg-surface-elevated border border-border-subtle text-text-secondary text-sm font-medium">
              Please connect your wallet in the top bar
            </div>
          ) : isSameToken ? (
            <button
              disabled
              className="w-full rounded-xl bg-surface-elevated border border-border-subtle py-3.5 text-sm font-semibold text-text-muted cursor-not-allowed"
            >
              Select Different Tokens
            </button>
          ) : isInsufficientBalance ? (
            <button
              disabled
              className="w-full rounded-xl bg-surface-elevated border border-border-subtle py-3.5 text-sm font-semibold text-text-muted cursor-not-allowed"
            >
              Insufficient {tokenIn.symbol} Balance
            </button>
          ) : tradeMode === "market" ? (
            isSlippageInvalid ? (
              <button
                disabled
                className="w-full rounded-xl bg-surface-elevated border border-border-subtle py-3.5 text-sm font-semibold text-text-muted cursor-not-allowed"
              >
                Invalid Slippage Tolerance
              </button>
            ) : !swapQuote.isValid ? (
              <button
                disabled
                className="w-full rounded-xl bg-surface-elevated border border-border-subtle py-3.5 text-sm font-semibold text-text-muted cursor-not-allowed"
              >
                {swapQuote.error || "Enter an amount"}
              </button>
            ) : needsRouterApproval ? (
              <button
                onClick={handleApproveRouter}
                disabled={isApproving || isConfirming}
                className="w-full rounded-xl bg-mint-500 hover:bg-mint-600 disabled:opacity-60 text-black font-semibold text-sm py-3.5 transition-all shadow-glow-mint active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {(isApproving || isConfirming) && <Loader2 className="h-4 w-4 animate-spin" />}
                {isConfirming
                  ? "Confirming in wallet..."
                  : isApproving
                  ? `Approving ${tokenIn.symbol}...`
                  : `Approve ${tokenIn.symbol}`}
              </button>
            ) : (
              <button
                onClick={handleSwap}
                disabled={isSwapping || isConfirming || parsedAmountIn === 0n || !swapQuote.isValid}
                className="w-full rounded-xl bg-mint-500 hover:bg-mint-600 disabled:opacity-60 text-black font-semibold text-sm py-3.5 transition-all shadow-glow-mint active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {(isSwapping || isConfirming) && <Loader2 className="h-4 w-4 animate-spin" />}
                {isConfirming
                  ? "Confirming in wallet..."
                  : isSwapping
                  ? "Executing Swap..."
                  : "Swap"}
              </button>
            )
          ) : (
            /* Limit Order Action */
            !isLimitContractConfigured ? (
              <button
                disabled
                className="w-full rounded-xl bg-surface-elevated border border-border-subtle py-3.5 text-sm font-semibold text-text-muted cursor-not-allowed"
              >
                Limit Orders Unavailable
              </button>
            ) : !limitOutputs.isValid ? (
              <button
                disabled
                className="w-full rounded-xl bg-surface-elevated border border-border-subtle py-3.5 text-sm font-semibold text-text-muted cursor-not-allowed"
              >
                {limitOutputs.error || "Enter order amount & target rate"}
              </button>
            ) : needsLimitApproval ? (
              <button
                onClick={handleApproveLimit}
                disabled={isApproving || isConfirming}
                className="w-full rounded-xl bg-mint-500 hover:bg-mint-600 disabled:opacity-60 text-black font-semibold text-sm py-3.5 transition-all shadow-glow-mint active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {(isApproving || isConfirming) && <Loader2 className="h-4 w-4 animate-spin" />}
                {isConfirming
                  ? "Confirming in wallet..."
                  : isApproving
                  ? `Approving ${tokenIn.symbol}...`
                  : `Approve ${tokenIn.symbol}`}
              </button>
            ) : (
              <button
                onClick={handlePlaceLimitOrder}
                disabled={isPlacingLimit || isConfirming || parsedAmountIn === 0n || !limitOutputs.isValid}
                className="w-full rounded-xl bg-mint-500 hover:bg-mint-600 disabled:opacity-60 text-black font-semibold text-sm py-3.5 transition-all shadow-glow-mint active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {(isPlacingLimit || isConfirming) && <Loader2 className="h-4 w-4 animate-spin" />}
                {isConfirming
                  ? "Confirming in wallet..."
                  : isPlacingLimit
                  ? "Creating Order..."
                  : "Place Limit Order"}
              </button>
            )
          )}
        </div>
      </div>

      {/* Jupiter Spot Below-the-Fold Order Tracker Tabs */}
      <div className="w-full max-w-[500px] mt-6">
        <div className="flex items-center gap-2 border-b border-border-subtle pb-2 mb-4">
          <button
            type="button"
            onClick={() => setActiveOrderTab("open")}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all ${
              activeOrderTab === "open"
                ? "bg-surface-elevated text-text-primary border border-border-prominent shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <span>Open Orders</span>
            <span className="rounded-full bg-mint-500/20 text-mint-400 px-1.5 py-0.2 text-[10px] font-mono">
              {openOrders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveOrderTab("history")}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all ${
              activeOrderTab === "history"
                ? "bg-surface-elevated text-text-primary border border-border-prominent shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <HistoryIcon className="h-3.5 w-3.5" />
            <span>Order History</span>
            <span className="rounded-full bg-surface-inset border border-border-subtle text-text-secondary px-1.5 py-0.2 text-[10px] font-mono">
              {historyOrders.length}
            </span>
          </button>
        </div>

        {/* Tab 1: Open Orders */}
        {activeOrderTab === "open" && (
          <div className="space-y-2.5">
            {openOrders.length === 0 ? (
              <div className="rounded-2xl border border-border-subtle bg-surface p-6 text-center text-xs text-text-secondary">
                <Clock className="h-6 w-6 mx-auto mb-2 text-text-muted" />
                <p>No open limit orders.</p>
                <p className="text-[11px] text-text-muted mt-1">
                  Place an order above to execute when target rates are reached.
                </p>
              </div>
            ) : (
              openOrders.map((order) => {
                const badge = getLimitOrderStatusBadge(order.status);
                const isCancelling = isCancellingId === order.id;

                return (
                  <div
                    key={order.id}
                    className="rounded-2xl border border-border-subtle bg-surface p-4 text-xs space-y-2.5 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TokenIcon symbol={order.tokenIn.symbol} size={18} />
                        <span className="font-semibold text-text-primary">
                          {order.tokenIn.symbol} → {order.tokenOut.symbol}
                        </span>
                        <TokenIcon symbol={order.tokenOut.symbol} size={18} />
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${badge.className}`}>
                          {badge.label}
                        </span>
                        <span className="text-[10px] text-text-muted">
                          {formatRelativeTime(order.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-surface-inset p-2.5 rounded-xl border border-border-subtle/60">
                      <div>
                        <span className="text-text-muted block">You Pay:</span>
                        <span className="font-mono font-medium text-text-primary">
                          {order.amountIn} {order.tokenIn.symbol}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted block">Target Min Receive:</span>
                        <span className="font-mono font-medium text-mint-400">
                          ≥{order.minAmountOut} {order.tokenOut.symbol}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted block">Target Price:</span>
                        <span className="font-mono text-text-secondary">
                          {order.targetPrice} {order.tokenOut.symbol} / {order.tokenIn.symbol}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted block">Expiry:</span>
                        <span className="font-mono text-text-secondary">
                          {formatExpiryDisplay(order.expiryTimestamp)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-text-muted font-mono">
                        ID: {order.id.slice(0, 12)}
                      </span>

                      <button
                        type="button"
                        onClick={() => openCancelModal(order)}
                        disabled={isCancelling}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stargate-error/10 hover:bg-stargate-error/20 text-stargate-error border border-stargate-error/30 text-[11px] font-semibold transition-all disabled:opacity-50"
                      >
                        {isCancelling ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Ban className="h-3 w-3" />
                        )}
                        <span>Cancel & Refund</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 2: Order History */}
        {activeOrderTab === "history" && (
          <div className="space-y-2.5">
            {historyOrders.length === 0 ? (
              <div className="rounded-2xl border border-border-subtle bg-surface p-6 text-center text-xs text-text-secondary">
                <HistoryIcon className="h-6 w-6 mx-auto mb-2 text-text-muted" />
                <p>No past limit order history.</p>
              </div>
            ) : (
              historyOrders.map((order) => {
                const badge = getLimitOrderStatusBadge(order.status);

                return (
                  <div
                    key={order.id}
                    className="rounded-2xl border border-border-subtle bg-surface p-4 text-xs space-y-2 opacity-90 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TokenIcon symbol={order.tokenIn.symbol} size={18} />
                        <span className="font-semibold text-text-primary">
                          {order.tokenIn.symbol} → {order.tokenOut.symbol}
                        </span>
                        <TokenIcon symbol={order.tokenOut.symbol} size={18} />
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${badge.className}`}>
                          {badge.label}
                        </span>
                        <span className="text-[10px] text-text-muted">
                          {formatRelativeTime(order.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-surface-inset p-2.5 rounded-xl border border-border-subtle/60">
                      <div>
                        <span className="text-text-muted block">Input:</span>
                        <span className="font-mono font-medium text-text-primary">
                          {order.amountIn} {order.tokenIn.symbol}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted block">Target Min Receive:</span>
                        <span className="font-mono font-medium text-text-primary">
                          {order.minAmountOut} {order.tokenOut.symbol}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* End: Right Swap Card + Order Tracker column */}
      </div>

      {/* Portaled Modals — outside both columns so they fill the viewport */}
      <OrderCancelModal
        isOpen={isCancelModalOpen}
        order={cancelModalOrder}
        onClose={() => { setIsCancelModalOpen(false); setCancelModalOrder(null); }}
        onConfirmCancel={handleCancelOrder}
        isCancelling={!!isCancellingId}
      />

      <TokenSelectModal
        isOpen={isTokenInModalOpen}
        onClose={() => setIsTokenInModalOpen(false)}
        onSelect={(token) => setTokenIn(token)}
        tokens={curatedTokens}
        selectedToken={tokenIn}
        title="Pay With"
      />

      <TokenSelectModal
        isOpen={isTokenOutModalOpen}
        onClose={() => setIsTokenOutModalOpen(false)}
        onSelect={(token) => setTokenOut(token)}
        tokens={curatedTokens}
        selectedToken={tokenOut}
        title="Receive"
      />
    </div>
  );
}
