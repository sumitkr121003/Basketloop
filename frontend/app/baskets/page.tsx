"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useWriteContract, usePublicClient, useChainId } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import {
  Plus,
  Play,
  Pause,
  Trash2,
  Zap,
  Clock,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  Loader2,
  Info,
  Layers,
  Wallet,
} from "lucide-react";
import { DEFAULT_CONTRACTS, basketLoopManagerAbi, erc20Abi } from "@/lib/contracts";
import { getTokensForChain } from "@/lib/tokens";
import { recordActivity } from "@/lib/activity";
import { TokenIcon } from "@/components/TokenIcon";

interface BasketAsset {
  token: `0x${string}`;
  allocationBps: number;
}

interface BasketItem {
  id: bigint;
  name: string;
  tokenIn: `0x${string}`;
  amountInPerCycle: bigint;
  intervalSeconds: number;
  lastExecutedAt: bigint;
  slippageBps: number;
  status: number; // 0 = Active, 1 = Paused, 2 = Cancelled
  assets: BasketAsset[];
}

const ASSET_COLORS = [
  "bg-mint-500",
  "bg-cyan-400",
  "bg-indigo-400",
  "bg-purple-400",
  "bg-amber-400",
];

export default function BasketsPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const networkName = useMemo(() => {
    if (chainId === 421614) return "Arbitrum Sepolia";
    if (chainId === 31337) return "Hardhat Local";
    return "Robinhood Chain Testnet";
  }, [chainId]);

  const curatedTokens = useMemo(() => getTokensForChain(chainId), [chainId]);

  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [loadingScheduleId, setLoadingScheduleId] = useState<bigint | null>(null);

  // Safe SSR/Hydration countdown state
  const [mounted, setMounted] = useState(false);
  const [nowSeconds, setNowSeconds] = useState(0);

  useEffect(() => {
    setMounted(true);
    setNowSeconds(Math.floor(Date.now() / 1000));
    const interval = setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  // Read User Schedule IDs from contract
  const {
    data: userScheduleIds,
    refetch: refetchUserSchedules,
    isLoading: isLoadingIds,
  } = useReadContract({
    address: DEFAULT_CONTRACTS.basketLoopManager,
    abi: basketLoopManagerAbi,
    functionName: "getUserSchedules",
    args: address ? [address] : undefined,
  });

  const [realBaskets, setRealBaskets] = useState<BasketItem[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);

  // Fetch full schedule details for user's schedule IDs
  const loadSchedules = useCallback(async () => {
    if (!publicClient || !userScheduleIds || userScheduleIds.length === 0) {
      setRealBaskets([]);
      return;
    }

    try {
      setIsLoadingSchedules(true);
      const loaded: BasketItem[] = [];

      for (const id of userScheduleIds) {
        try {
          const res = (await publicClient.readContract({
            address: DEFAULT_CONTRACTS.basketLoopManager,
            abi: basketLoopManagerAbi,
            functionName: "getSchedule",
            args: [id],
          })) as any;

          if (res && res[0] && res[0].id > 0n) {
            const sched = res[0];
            const rawAssets = res[1] || [];
            loaded.push({
              id: sched.id,
              name: sched.name || `Basket #${sched.id.toString()}`,
              tokenIn: sched.tokenIn,
              amountInPerCycle: sched.amountInPerCycle,
              intervalSeconds: sched.intervalSeconds,
              lastExecutedAt: sched.lastExecutedAt,
              slippageBps: sched.slippageBps,
              status: sched.status,
              assets: rawAssets.map((a: any) => ({
                token: a.token,
                allocationBps: a.allocationBps,
              })),
            });
          }
        } catch (err) {
          console.warn(`Could not load schedule #${id}:`, err);
        }
      }

      setRealBaskets(loaded);
    } finally {
      setIsLoadingSchedules(false);
    }
  }, [publicClient, userScheduleIds]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const { writeContractAsync } = useWriteContract();

  const handlePause = async (id: bigint) => {
    try {
      setLoadingScheduleId(id);
      setActionMessage(null);
      const hash = await writeContractAsync({
        address: DEFAULT_CONTRACTS.basketLoopManager,
        abi: basketLoopManagerAbi,
        functionName: "pauseSchedule",
        args: [id],
        gas: 150_000n,
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      setActionMessage({ type: "success", text: `Schedule #${id} successfully paused on-chain!` });
      await refetchUserSchedules();
      await loadSchedules();

      recordActivity({
        type: "Basket Paused",
        inputAmount: `Schedule #${id}`,
        outputDescription: "Automation suspended by owner",
        status: "Success",
        txHash: hash,
        chainId: chainId || 46630,
      });
    } catch (err: any) {
      setActionMessage({ type: "error", text: `Pause failed: ${err?.shortMessage || err?.message}` });
    } finally {
      setLoadingScheduleId(null);
    }
  };

  const handleResume = async (id: bigint) => {
    try {
      setLoadingScheduleId(id);
      setActionMessage(null);
      const hash = await writeContractAsync({
        address: DEFAULT_CONTRACTS.basketLoopManager,
        abi: basketLoopManagerAbi,
        functionName: "resumeSchedule",
        args: [id],
        gas: 150_000n,
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      setActionMessage({ type: "success", text: `Schedule #${id} successfully resumed on-chain!` });
      await refetchUserSchedules();
      await loadSchedules();

      recordActivity({
        type: "Basket Resumed",
        inputAmount: `Schedule #${id}`,
        outputDescription: "Automation resumed by owner",
        status: "Success",
        txHash: hash,
        chainId: chainId || 46630,
      });
    } catch (err: any) {
      setActionMessage({ type: "error", text: `Resume failed: ${err?.shortMessage || err?.message}` });
    } finally {
      setLoadingScheduleId(null);
    }
  };

  const handleCancel = async (id: bigint) => {
    try {
      setLoadingScheduleId(id);
      setActionMessage(null);
      const hash = await writeContractAsync({
        address: DEFAULT_CONTRACTS.basketLoopManager,
        abi: basketLoopManagerAbi,
        functionName: "cancelSchedule",
        args: [id],
        gas: 150_000n,
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      setActionMessage({ type: "success", text: `Schedule #${id} cancelled and removed from active rotation!` });
      await refetchUserSchedules();
      await loadSchedules();

      recordActivity({
        type: "Basket Cancelled",
        inputAmount: `Schedule #${id}`,
        outputDescription: "Schedule permanently terminated by owner",
        status: "Success",
        txHash: hash,
        chainId: chainId || 46630,
      });
    } catch (err: any) {
      setActionMessage({ type: "error", text: `Cancellation failed: ${err?.shortMessage || err?.message}` });
    } finally {
      setLoadingScheduleId(null);
    }
  };

  const handleInstantBuy = async (basket: BasketItem) => {
    if (!address) {
      setActionMessage({ type: "error", text: "Please connect your wallet to execute an instant basket purchase." });
      return;
    }

    try {
      setLoadingScheduleId(basket.id);
      setActionMessage({ type: "info", text: `Preparing instant purchase for "${basket.name}"...` });

      // 1. Verify token allowance for BasketLoopManager
      if (publicClient) {
        const allowance = (await publicClient.readContract({
          address: basket.tokenIn,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, DEFAULT_CONTRACTS.basketLoopManager],
        })) as bigint;

        if (allowance < basket.amountInPerCycle) {
          setActionMessage({
            type: "info",
            text: `Granting token spending allowance for BasketLoopManager (${DEFAULT_CONTRACTS.basketLoopManager.slice(0, 6)}...${DEFAULT_CONTRACTS.basketLoopManager.slice(-4)})...`,
          });

          const approveHash = await writeContractAsync({
            address: basket.tokenIn,
            abi: erc20Abi,
            functionName: "approve",
            args: [DEFAULT_CONTRACTS.basketLoopManager, basket.amountInPerCycle * 10n],
            gas: 70_000n,
          });

          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
      }

      // 2. Call executeInstantBasket on contract
      setActionMessage({ type: "info", text: `Broadcasting instant buy transaction on ${networkName}...` });

      const hash = await writeContractAsync({
        address: DEFAULT_CONTRACTS.basketLoopManager,
        abi: basketLoopManagerAbi,
        functionName: "executeInstantBasket",
        args: [
          basket.tokenIn,
          basket.amountInPerCycle,
          basket.slippageBps,
          basket.assets.map((a) => ({
            token: a.token,
            allocationBps: a.allocationBps,
          })),
        ],
        gas: 450_000n,
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      setActionMessage({
        type: "success",
        text: `Successfully executed instant purchase of "${basket.name}"! Tokens delivered to your wallet.`,
      });

      recordActivity({
        type: "Instant Basket",
        inputAmount: `${formatUnits(basket.amountInPerCycle, 6)} ${getTokenSymbol(basket.tokenIn, 0)}`,
        outputDescription: basket.name,
        status: "Success",
        txHash: hash,
        chainId: chainId || 46630,
      });
    } catch (err: any) {
      setActionMessage({ type: "error", text: `Instant purchase failed: ${err?.shortMessage || err?.message}` });
    } finally {
      setLoadingScheduleId(null);
    }
  };

  const formatInterval = (sec: number) => {
    if (sec <= 600) return "Every 10 Mins";
    if (sec <= 3600) return "Every 1 Hour";
    if (sec <= 86400) return "Daily";
    if (sec <= 604800) return "Weekly";
    return "Monthly";
  };

  // Safe SSR & Client countdown without hydration mismatch
  const getNextRunCountdown = (lastRun: bigint, intervalSec: number) => {
    if (!mounted || nowSeconds === 0) return "Calculating...";
    if (lastRun === 0n) return "Due on initial cycle";
    const nextTimestamp = Number(lastRun) + intervalSec;
    const diff = nextTimestamp - nowSeconds;
    if (diff <= 0) return "Due now (Keeper polling)";
    const hours = Math.floor(diff / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    return `${hours}h ${mins}m remaining`;
  };

  const getTokenSymbol = (addr: string, fallbackIdx: number) => {
    const found = curatedTokens.find((t) => t.address.toLowerCase() === addr.toLowerCase());
    return found ? found.symbol : `Token #${fallbackIdx + 1}`;
  };

  const displayBaskets = useMemo(() => {
    return realBaskets.filter((b) => {
      if (filter === "active") return b.status === 0;
      if (filter === "paused") return b.status === 1;
      return b.status !== 2; // Exclude permanently cancelled from active view
    });
  }, [realBaskets, filter]);

  return (
    <div className="space-y-8 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Recurring Baskets
          </h1>
          <p className="text-xs text-text-secondary">
            Non-custodial automated portfolio dollar-cost averaging on {networkName}
          </p>
        </div>
        <Link
          href="/baskets/create"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-mint-500 hover:bg-mint-600 px-4 py-2.5 text-xs font-semibold text-black shadow-glow-mint transition-all active:scale-[0.99] self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Create New Basket
        </Link>
      </div>

      {/* Summary Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
            Active Baskets
          </div>
          <div className="text-2xl font-bold font-tabular text-text-primary">
            {realBaskets.filter((b) => b.status === 0).length}
          </div>
          <div className="text-xs text-text-muted flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-mint-500" />
            <span>Automated on {networkName}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
            Total Schedules
          </div>
          <div className="text-2xl font-bold font-tabular text-text-primary">
            {realBaskets.filter((b) => b.status !== 2).length}
          </div>
          <div className="text-xs text-text-muted">Managed by your wallet</div>
        </div>

        <div className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
            Protocol Custody
          </div>
          <div className="text-2xl font-bold font-tabular text-mint-400">$0.00 (Zero Idle)</div>
          <div className="text-xs text-text-muted flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-mint-500" />
            <span>Tokens remain in your wallet</span>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {actionMessage && (
        <div
          className={`rounded-2xl p-4 text-xs flex items-center justify-between border ${
            actionMessage.type === "success"
              ? "bg-mint-500/10 text-mint-400 border-mint-500/30"
              : actionMessage.type === "error"
              ? "bg-stargate-error/10 text-stargate-error border-stargate-error/30"
              : "bg-surface-elevated text-text-primary border-border-prominent"
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === "success" ? (
              <Sparkles className="h-4 w-4 shrink-0 text-mint-400" />
            ) : actionMessage.type === "error" ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-stargate-error" />
            ) : (
              <Info className="h-4 w-4 shrink-0 text-cyan-400" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-text-muted hover:text-text-primary text-base font-bold px-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* Stargate Segmented Filter Tabs */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-3">
        <div className="inline-flex rounded-full bg-surface border border-border-subtle p-1 gap-1">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-full px-3.5 py-1 text-xs font-medium transition-all ${
              filter === "all"
                ? "bg-surface-elevated text-text-primary border border-border-prominent shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            All ({realBaskets.filter((b) => b.status !== 2).length})
          </button>
          <button
            onClick={() => setFilter("active")}
            className={`rounded-full px-3.5 py-1 text-xs font-medium transition-all ${
              filter === "active"
                ? "bg-surface-elevated text-mint-400 border border-mint-500/30 shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setFilter("paused")}
            className={`rounded-full px-3.5 py-1 text-xs font-medium transition-all ${
              filter === "paused"
                ? "bg-surface-elevated text-stargate-warning border border-stargate-warning/30 shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Paused
          </button>
        </div>

        <span className="text-xs text-text-muted hidden sm:inline">
          Showing {displayBaskets.length} recurring schedules
        </span>
      </div>

      {/* Loading Indicator */}
      {(isLoadingIds || isLoadingSchedules) && (
        <div className="flex items-center justify-center py-8 text-xs text-text-secondary gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-mint-400" />
          <span>Syncing on-chain schedules from {networkName}...</span>
        </div>
      )}

      {/* Not Connected State */}
      {!isConnected ? (
        <div className="rounded-3xl border border-border-subtle bg-surface p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-elevated border border-border-prominent text-text-muted">
            <Wallet className="h-7 w-7 text-mint-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-text-primary">Wallet Not Connected</h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Connect your Web3 wallet using the top bar to view your automated portfolio baskets and scheduled DCA executions.
            </p>
          </div>
        </div>
      ) : !isLoadingSchedules && !isLoadingIds && displayBaskets.length === 0 ? (
        /* Clean Empty State */
        <div className="rounded-3xl border border-border-subtle bg-surface p-12 text-center max-w-lg mx-auto space-y-5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-elevated border border-border-prominent text-mint-400">
            <Layers className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-text-primary">No recurring baskets found</h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              You don&apos;t have any automated investment baskets on {networkName} yet. Create your first basket to start dollar-cost averaging into your favorite tokens automatically.
            </p>
          </div>
          <Link
            href="/baskets/create"
            className="inline-flex items-center gap-2 rounded-xl bg-mint-500 hover:bg-mint-600 px-5 py-2.5 text-xs font-semibold text-black shadow-glow-mint transition-all"
          >
            <Plus className="h-4 w-4" />
            Create Your First Basket
          </Link>
        </div>
      ) : (
        /* Basket Cards Grid */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {displayBaskets.map((basket) => {
            const isItemLoading = loadingScheduleId === basket.id;

            return (
              <div
                key={basket.id.toString()}
                className="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface p-6 shadow-stargate transition-all hover:border-border-prominent group"
              >
                <div className="space-y-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-text-primary group-hover:text-mint-400 transition-colors">
                          {basket.name}
                        </h2>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-text-secondary font-mono">
                        <span className="font-semibold text-text-primary">
                          {formatUnits(basket.amountInPerCycle, 6)} {getTokenSymbol(basket.tokenIn, 0)}
                        </span>
                        <span>&bull;</span>
                        <span className="text-text-secondary font-sans">{formatInterval(basket.intervalSeconds)}</span>
                      </div>
                    </div>

                    <div>
                      {basket.status === 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-mint-500/10 px-2.5 py-0.5 text-xs font-semibold text-mint-400 border border-mint-500/30">
                          <span className="h-1.5 w-1.5 rounded-full bg-mint-500 animate-pulse" />
                          Active
                        </span>
                      ) : basket.status === 1 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-stargate-warning/10 px-2.5 py-0.5 text-xs font-semibold text-stargate-warning border border-stargate-warning/30">
                          Paused
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-border-subtle px-2.5 py-0.5 text-xs font-semibold text-text-muted">
                          Cancelled
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Visual Allocation Stack */}
                  <div className="space-y-2">
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-inset border border-border-subtle">
                      {basket.assets.map((asset, idx) => (
                        <div
                          key={asset.token}
                          style={{ width: `${asset.allocationBps / 100}%` }}
                          className={`${ASSET_COLORS[idx % ASSET_COLORS.length]} transition-all`}
                          title={`${getTokenSymbol(asset.token, idx)}: ${asset.allocationBps / 100}%`}
                        />
                      ))}
                    </div>

                    {/* Asset Breakdown Legend */}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      {basket.assets.map((asset, idx) => (
                        <div key={asset.token} className="flex items-center gap-1.5 text-xs">
                          <TokenIcon symbol={getTokenSymbol(asset.token, idx)} size={16} />
                          <span className="text-text-secondary">{getTokenSymbol(asset.token, idx)}</span>
                          <span className="font-mono font-medium text-text-primary">
                            {asset.allocationBps / 100}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Timing & Next Run Details */}
                  <div className="rounded-2xl bg-surface-inset border border-border-subtle p-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-text-secondary">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-mint-400" /> Next Execution
                      </span>
                      <span className="font-mono text-text-primary">
                        {basket.status === 1
                          ? "Suspended (Paused)"
                          : getNextRunCountdown(basket.lastExecutedAt, basket.intervalSeconds)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-text-secondary">
                      <span>Max Slippage</span>
                      <span className="font-mono text-text-primary">
                        {(basket.slippageBps / 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Toolbar */}
                <div className="mt-5 flex items-center justify-between pt-4 border-t border-border-subtle">
                  <button
                    onClick={() => handleInstantBuy(basket)}
                    disabled={isItemLoading}
                    className="flex items-center gap-1.5 rounded-xl bg-mint-500/10 hover:bg-mint-500/20 border border-mint-500/30 px-3 py-1.5 text-xs font-semibold text-mint-400 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isItemLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Zap className="h-3 w-3" />
                    )}
                    Instant Buy Now
                  </button>

                  <div className="flex items-center gap-2">
                    {basket.status === 0 ? (
                      <button
                        onClick={() => handlePause(basket.id)}
                        disabled={isItemLoading}
                        className="flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-elevated hover:bg-surface-hover hover:border-border-prominent px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-all disabled:opacity-50"
                      >
                        <Pause className="h-3 w-3" /> Pause
                      </button>
                    ) : basket.status === 1 ? (
                      <button
                        onClick={() => handleResume(basket.id)}
                        disabled={isItemLoading}
                        className="flex items-center gap-1.5 rounded-xl border border-mint-500/30 bg-mint-500/10 hover:bg-mint-500/20 px-3 py-1.5 text-xs font-medium text-mint-400 transition-all disabled:opacity-50"
                      >
                        <Play className="h-3 w-3" /> Resume
                      </button>
                    ) : null}

                    {basket.status !== 2 && (
                      <button
                        onClick={() => handleCancel(basket.id)}
                        disabled={isItemLoading}
                        className="rounded-xl border border-border-subtle bg-surface-elevated hover:bg-stargate-error/10 hover:border-stargate-error/40 hover:text-stargate-error p-2 text-text-muted transition-all disabled:opacity-50"
                        title="Cancel Schedule"
                        aria-label="Cancel Schedule"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
