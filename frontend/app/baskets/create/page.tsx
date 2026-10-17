"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useWriteContract, usePublicClient, useChainId } from "wagmi";
import { parseUnits, isAddress } from "viem";
import {
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Loader2,
  Check,
  ShieldCheck,
  Info,
} from "lucide-react";
import { getTokensForChain, type TokenInfo } from "@/lib/tokens";
import { DEFAULT_CONTRACTS, basketLoopManagerAbi, erc20Abi } from "@/lib/contracts";
import { DEFAULT_APPROVE_GAS } from "@/lib/gas";
import { recordActivity } from "@/lib/activity";
import { TokenSelectModal } from "@/components/TokenSelectModal";
import { TokenIcon } from "@/components/TokenIcon";

interface SelectedAsset {
  token: TokenInfo;
  allocationPercent: number; // 1 to 100
}

const ASSET_COLORS = [
  "bg-mint-500",
  "bg-cyan-400",
  "bg-indigo-400",
  "bg-purple-400",
  "bg-amber-400",
];

export default function CreateBasketPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const curatedTokens = getTokensForChain(chainId);

  // Wizard Step: 1 = Assets, 2 = Budget & Schedule
  const [step, setStep] = useState<number>(1);

  // Form State
  const [basketName, setBasketName] = useState<string>("DeFi Core Accumulator");
  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>([
    { token: curatedTokens[1] || curatedTokens[0], allocationPercent: 60 }, // WETH 60%
    { token: curatedTokens[6] || curatedTokens[2], allocationPercent: 40 }, // ARB 40%
  ]);

  // Step 2 State (Funding token must be ERC-20 for scheduled pulls)
  const [fundingToken, setFundingToken] = useState<TokenInfo>(
    curatedTokens.find((t) => t.symbol === "USDC") || curatedTokens[2]
  );
  const [budgetAmount, setBudgetAmount] = useState<string>("100");
  const [intervalSeconds, setIntervalSeconds] = useState<number>(600); // 10 minutes default for testnet demo
  const [intervalType, setIntervalType] = useState<"demo" | "standard">("demo");
  const [slippageBps, setSlippageBps] = useState<number>(100); // 1%

  // Custom token input
  const [customAddress, setCustomAddress] = useState<string>("");
  const [customTokenError, setCustomTokenError] = useState<string | null>(null);

  // Modal / Tx state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [txStep, setTxStep] = useState<1 | 2>(1);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [miningStatus, setMiningStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Token modal trigger
  const [isFundingTokenModalOpen, setIsFundingTokenModalOpen] = useState(false);

  const { writeContractAsync } = useWriteContract();

  // Allocation Math
  const totalAllocation = selectedAssets.reduce((sum, a) => sum + (a.allocationPercent || 0), 0);
  const isValidAllocation =
    totalAllocation === 100 &&
    selectedAssets.length >= 2 &&
    selectedAssets.length <= 5 &&
    selectedAssets.every((a) => (a.allocationPercent || 0) > 0);

  const handleAddAsset = (token: TokenInfo) => {
    if (selectedAssets.length >= 5) return;
    if (selectedAssets.some((a) => a.token.address.toLowerCase() === token.address.toLowerCase())) return;
    setSelectedAssets([...selectedAssets, { token, allocationPercent: 10 }]);
  };

  const handleRemoveAsset = (idx: number) => {
    if (selectedAssets.length <= 2) return;
    setSelectedAssets(selectedAssets.filter((_, i) => i !== idx));
  };

  const handleAllocationChange = (idx: number, value: number) => {
    const updated = [...selectedAssets];
    updated[idx].allocationPercent = isNaN(value) ? 0 : Math.max(0, Math.min(100, value));
    setSelectedAssets(updated);
  };

  const handleAddCustomToken = () => {
    setCustomTokenError(null);
    if (!isAddress(customAddress)) {
      setCustomTokenError("Invalid EVM contract address");
      return;
    }
    if (selectedAssets.some((a) => a.token.address.toLowerCase() === customAddress.toLowerCase())) {
      setCustomTokenError("Token already added to basket");
      return;
    }
    const custom: TokenInfo = {
      symbol: `TOKEN-${customAddress.slice(2, 6).toUpperCase()}`,
      name: `Custom (${customAddress.slice(0, 8)}...)`,
      address: customAddress as `0x${string}`,
      decimals: 18,
    };
    handleAddAsset(custom);
    setCustomAddress("");
  };

  // Execution flow
  const handleApprove = async () => {
    try {
      setIsApproving(true);
      setErrorMessage(null);
      setMiningStatus("Awaiting wallet approval...");

      const amountToApprove = parseUnits(budgetAmount, fundingToken.decimals) * 10n; // 10 cycles allowance
      const hash = await writeContractAsync({
        address: fundingToken.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [DEFAULT_CONTRACTS.basketLoopManager, amountToApprove],
        gas: DEFAULT_APPROVE_GAS,
      });

      setMiningStatus("Confirming approval on Robinhood Chain...");
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      setMiningStatus(null);
      setTxStep(2);
    } catch (err: any) {
      setMiningStatus(null);
      setErrorMessage(err?.shortMessage || err?.message || "Token approval failed");
    } finally {
      setIsApproving(false);
    }
  };

  const handleCreateSchedule = async () => {
    try {
      setIsCreating(true);
      setErrorMessage(null);
      setMiningStatus("Awaiting transaction confirmation...");

      const parsedBudget = parseUnits(budgetAmount, fundingToken.decimals);
      const assetsParam = selectedAssets.map((a) => ({
        token: a.token.address,
        allocationBps: a.allocationPercent * 100,
      }));

      const hash = await writeContractAsync({
        address: DEFAULT_CONTRACTS.basketLoopManager,
        abi: basketLoopManagerAbi,
        functionName: "createSchedule",
        args: [
          basketName,
          fundingToken.address,
          parsedBudget,
          intervalSeconds,
          slippageBps,
          assetsParam,
        ],
        gas: 450_000n, // Explicit gas parameter prevents Orbit astronomical gas estimation
      });

      setMiningStatus("Deploying recurring schedule on-chain...");
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      recordActivity({
        type: "Basket Created",
        inputAmount: `${budgetAmount} ${fundingToken.symbol}`,
        outputDescription: `${basketName} (${selectedAssets.map((a) => `${a.allocationPercent}% ${a.token.symbol}`).join(", ")})`,
        status: "Success",
        txHash: hash,
        chainId: chainId || 46630,
      });

      setMiningStatus(null);
      setIsModalOpen(false);
      router.push("/baskets");
    } catch (err: any) {
      setMiningStatus(null);
      setErrorMessage(err?.shortMessage || err?.message || "Failed to create schedule on-chain");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl py-4 sm:py-8 pb-16">
      {/* Page Header */}
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Create Recurring Basket
        </h1>
        <p className="text-xs text-text-secondary">
          Step {step} of 2 &bull; Define multi-token allocation & automated execution cadence
        </p>
      </div>

      {/* Stargate Segmented Stepper */}
      <div className="mb-8 flex items-center justify-between rounded-2xl bg-surface border border-border-subtle p-2">
        <div className="flex items-center gap-2.5 px-3 py-1.5">
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-all ${
              step >= 1 ? "bg-mint-500 text-black shadow-glow-mint" : "bg-surface-elevated text-text-muted"
            }`}
          >
            {step > 1 ? <Check className="h-3.5 w-3.5" /> : "1"}
          </div>
          <span className={`text-xs font-semibold ${step >= 1 ? "text-text-primary" : "text-text-muted"}`}>
            Assets & Allocations
          </span>
        </div>

        <div className="h-px flex-1 mx-3 bg-border-prominent" />

        <div className="flex items-center gap-2.5 px-3 py-1.5">
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-all ${
              step >= 2 ? "bg-mint-500 text-black shadow-glow-mint" : "bg-surface-elevated text-text-muted"
            }`}
          >
            2
          </div>
          <span className={`text-xs font-semibold ${step >= 2 ? "text-text-primary" : "text-text-muted"}`}>
            Budget & Cadence
          </span>
        </div>
      </div>

      {/* STEP 1: Assets & Allocations */}
      {step === 1 && (
        <div className="space-y-6 rounded-3xl border border-border-subtle bg-surface p-6 sm:p-7 shadow-stargate">
          {/* Basket Name */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              Basket Name
            </label>
            <input
              type="text"
              value={basketName}
              onChange={(e) => setBasketName(e.target.value)}
              className="w-full rounded-2xl border border-border-subtle bg-surface-inset px-4 py-3 text-sm font-semibold text-text-primary outline-none focus:border-border-prominent transition-all"
              placeholder="e.g. DeFi Long-Term Accumulator"
            />
          </div>

          {/* Allocation Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary font-medium">Allocation Split</span>
              <span
                className={`font-mono font-bold ${
                  totalAllocation === 100
                    ? "text-mint-400"
                    : totalAllocation > 100
                    ? "text-stargate-error"
                    : "text-stargate-warning"
                }`}
              >
                {totalAllocation}% / 100%
              </span>
            </div>

            {/* Segmented Split Bar */}
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-inset border border-border-subtle flex">
              {selectedAssets.map((asset, idx) => (
                <div
                  key={idx}
                  style={{ width: `${Math.min(100, asset.allocationPercent)}%` }}
                  className={`${ASSET_COLORS[idx % ASSET_COLORS.length]} transition-all duration-200`}
                  title={`${asset.token.symbol}: ${asset.allocationPercent}%`}
                />
              ))}
            </div>
          </div>

          {/* Selected Assets List */}
          <div className="space-y-3">
            <label className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              Composition (2 to 5 Tokens)
            </label>
            {selectedAssets.map((item, idx) => (
              <div
                key={item.token.address}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-inset p-3.5 hover:border-border-prominent transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-elevated border border-border-prominent">
                    <TokenIcon symbol={item.token.symbol} size={22} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-text-primary">{item.token.symbol}</p>
                    <p className="text-xs text-text-secondary truncate max-w-[120px] sm:max-w-xs">
                      {item.token.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface px-2.5 py-1">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={item.allocationPercent === 0 ? "" : item.allocationPercent}
                      onChange={(e) => handleAllocationChange(idx, parseInt(e.target.value, 10))}
                      className="w-12 bg-transparent text-right text-sm font-mono font-bold text-mint-400 outline-none"
                    />
                    <span className="text-xs font-mono font-bold text-text-muted">%</span>
                  </div>

                  {selectedAssets.length > 2 && (
                    <button
                      onClick={() => handleRemoveAsset(idx)}
                      className="rounded-lg p-1.5 text-text-muted hover:text-stargate-error transition-colors"
                      aria-label="Remove asset from basket"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Quick-Add Curated Token Pills */}
          {selectedAssets.length < 5 && (
            <div className="space-y-2 pt-1">
              <span className="text-xs text-text-secondary">Add popular curated tokens:</span>
              <div className="flex flex-wrap gap-2">
                {curatedTokens
                  .filter(
                    (t) =>
                      !t.isNative && // Recurring DCA uses ERC-20 (WETH)
                      !selectedAssets.some((a) => a.token.address.toLowerCase() === t.address.toLowerCase())
                  )
                  .map((token) => (
                    <button
                      key={token.symbol}
                      onClick={() => handleAddAsset(token)}
                      className="flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-elevated hover:bg-surface-hover hover:border-mint-500/50 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-all"
                    >
                      <TokenIcon symbol={token.symbol} size={14} />
                      <Plus className="h-3 w-3 text-mint-400" />
                      {token.symbol}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Custom ERC-20 Address Input */}
          <div className="rounded-2xl border border-border-subtle bg-surface-inset p-3.5 space-y-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              Add Custom Token Contract
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="0x..."
                value={customAddress}
                onChange={(e) => setCustomAddress(e.target.value)}
                className="flex-1 rounded-xl border border-border-subtle bg-surface px-3.5 py-2 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-mint-500 font-mono transition-colors"
              />
              <button
                onClick={handleAddCustomToken}
                className="rounded-xl bg-surface-elevated hover:bg-surface-hover px-4 py-2 text-xs font-semibold text-mint-400 border border-border-prominent transition-all"
              >
                + Add Token
              </button>
            </div>
            {customTokenError && (
              <p className="text-xs text-stargate-error flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {customTokenError}
              </p>
            )}
          </div>

          {/* Next Button */}
          <div className="pt-2">
            <button
              onClick={() => setStep(2)}
              disabled={!isValidAllocation}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-mint-500 hover:bg-mint-600 disabled:opacity-50 py-3.5 text-sm font-semibold text-black shadow-glow-mint transition-all active:scale-[0.99]"
            >
              Continue to Schedule <ArrowRight className="h-4 w-4" />
            </button>
            {!isValidAllocation && (
              <p className="mt-2.5 text-center text-xs text-stargate-warning">
                Total allocations must equal exactly 100% (currently {totalAllocation}%)
              </p>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: Budget & Recurring Schedule */}
      {step === 2 && (
        <div className="space-y-6 rounded-3xl border border-border-subtle bg-surface p-6 sm:p-7 shadow-stargate">
          {/* Funding Currency */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              Funding Token (Source Currency)
            </label>
            <div className="flex items-center justify-between rounded-2xl border border-border-subtle bg-surface-inset p-3.5">
              <div className="flex items-center gap-2.5">
                <TokenIcon symbol={fundingToken.symbol} size={28} />
                <div>
                  <div className="text-sm font-bold text-text-primary">{fundingToken.symbol}</div>
                  <div className="text-xs text-text-secondary">{fundingToken.name}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsFundingTokenModalOpen(true)}
                className="text-xs font-semibold text-mint-400 hover:text-mint-300 bg-surface-elevated border border-border-prominent px-3 py-1.5 rounded-xl transition-all"
              >
                Change Currency
              </button>
            </div>
          </div>

          {/* Budget Amount */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              Budget Per Cycle
            </label>
            <div className="flex items-center rounded-2xl border border-border-subtle bg-surface-inset px-4 py-3 focus-within:border-border-prominent transition-all">
              <input
                type="number"
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
                className="w-full bg-transparent text-2xl font-bold font-tabular text-text-primary outline-none"
                placeholder="100"
              />
              <span className="text-sm font-mono font-bold text-mint-400">{fundingToken.symbol}</span>
            </div>
          </div>

          {/* Interval Mode Switcher */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                Execution Cadence
              </label>

              {/* Segmented Capsule Toggle */}
              <div className="inline-flex rounded-full bg-surface-inset border border-border-subtle p-0.5">
                <button
                  onClick={() => {
                    setIntervalType("demo");
                    setIntervalSeconds(600);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                    intervalType === "demo"
                      ? "bg-surface-elevated text-text-primary border border-border-prominent"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Demo Mode
                </button>
                <button
                  onClick={() => {
                    setIntervalType("standard");
                    setIntervalSeconds(604800);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                    intervalType === "standard"
                      ? "bg-surface-elevated text-text-primary border border-border-prominent"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Standard
                </button>
              </div>
            </div>

            {intervalType === "demo" ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setIntervalSeconds(600)}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    intervalSeconds === 600
                      ? "border-mint-500 bg-mint-500/10 text-text-primary shadow-glow-mint"
                      : "border-border-subtle bg-surface-inset text-text-secondary hover:border-border-prominent"
                  }`}
                >
                  <p className="text-sm font-bold text-text-primary">Every 10 Minutes</p>
                  <p className="text-xs text-text-secondary mt-0.5">Fast testnet keeper execution</p>
                </button>
                <button
                  onClick={() => setIntervalSeconds(3600)}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    intervalSeconds === 3600
                      ? "border-mint-500 bg-mint-500/10 text-text-primary shadow-glow-mint"
                      : "border-border-subtle bg-surface-inset text-text-secondary hover:border-border-prominent"
                  }`}
                >
                  <p className="text-sm font-bold text-text-primary">Every 1 Hour</p>
                  <p className="text-xs text-text-secondary mt-0.5">Hourly portfolio accumulation</p>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setIntervalSeconds(86400)}
                  className={`rounded-2xl border p-3.5 text-center transition-all ${
                    intervalSeconds === 86400
                      ? "border-mint-500 bg-mint-500/10 text-text-primary shadow-glow-mint"
                      : "border-border-subtle bg-surface-inset text-text-secondary hover:border-border-prominent"
                  }`}
                >
                  <p className="text-sm font-bold text-text-primary">Daily</p>
                </button>
                <button
                  onClick={() => setIntervalSeconds(604800)}
                  className={`rounded-2xl border p-3.5 text-center transition-all ${
                    intervalSeconds === 604800
                      ? "border-mint-500 bg-mint-500/10 text-text-primary shadow-glow-mint"
                      : "border-border-subtle bg-surface-inset text-text-secondary hover:border-border-prominent"
                  }`}
                >
                  <p className="text-sm font-bold text-text-primary">Weekly</p>
                </button>
                <button
                  onClick={() => setIntervalSeconds(2592000)}
                  className={`rounded-2xl border p-3.5 text-center transition-all ${
                    intervalSeconds === 2592000
                      ? "border-mint-500 bg-mint-500/10 text-text-primary shadow-glow-mint"
                      : "border-border-subtle bg-surface-inset text-text-secondary hover:border-border-prominent"
                  }`}
                >
                  <p className="text-sm font-bold text-text-primary">Monthly</p>
                </button>
              </div>
            )}
          </div>

          {/* Allocation Breakdown Summary Box */}
          <div className="rounded-2xl border border-border-subtle bg-surface-inset p-4 space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              Per-Cycle Allocation Preview
            </span>
            <p className="text-xs text-text-secondary">
              Total <span className="font-mono font-bold text-text-primary">{budgetAmount} {fundingToken.symbol}</span> split across:
            </p>
            <ul className="text-xs space-y-1 pt-1 divide-y divide-border-subtle/40">
              {selectedAssets.map((a, idx) => (
                <li key={a.token.symbol} className="flex justify-between py-1">
                  <span className="flex items-center gap-1.5 text-text-primary">
                    <span className={`h-1.5 w-1.5 rounded-full ${ASSET_COLORS[idx % ASSET_COLORS.length]}`} />
                    {a.token.symbol} ({a.allocationPercent}%)
                  </span>
                  <span className="font-mono font-medium text-mint-400">
                    &asymp; {((parseFloat(budgetAmount || "0") * a.allocationPercent) / 100).toFixed(2)}{" "}
                    {fundingToken.symbol}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Controls Footer */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setStep(1)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-border-subtle bg-surface-elevated hover:bg-surface-hover px-4 py-3.5 text-xs font-semibold text-text-secondary hover:text-text-primary transition-all"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={() => {
                setIsModalOpen(true);
                setTxStep(1);
              }}
              disabled={!isConnected || !budgetAmount || parseFloat(budgetAmount) <= 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-mint-500 hover:bg-mint-600 disabled:opacity-50 py-3.5 text-sm font-semibold text-black shadow-glow-mint transition-all active:scale-[0.99]"
            >
              Review & Activate Basket
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Activation Confirmation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in-0 duration-200">
          <div className="w-full max-w-md rounded-3xl border border-border-prominent bg-surface p-6 sm:p-7 shadow-stargate space-y-5">
            <div>
              <h3 className="text-lg font-bold text-text-primary">Activate Recurring Basket</h3>
              <p className="text-xs text-text-secondary mt-1">
                Two on-chain signatures are required to initialize zero-custody automation.
              </p>
            </div>

            <div className="space-y-3.5">
              {/* Step 1: Approve */}
              <div
                className={`rounded-2xl border p-4 transition-all ${
                  txStep === 1
                    ? "border-mint-500/40 bg-mint-500/5 shadow-sm"
                    : "border-border-subtle bg-surface-inset opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mint-500 text-xs font-bold text-black">
                    1
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-text-primary">Approve {fundingToken.symbol} Spending</h4>
                    <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                      Authorize <span className="text-text-primary font-medium">BasketLoopManager</span> (
                      <span className="font-mono text-mint-400">
                        {DEFAULT_CONTRACTS.basketLoopManager.slice(0, 6)}...{DEFAULT_CONTRACTS.basketLoopManager.slice(-4)}
                      </span>
                      ) to pull {budgetAmount} {fundingToken.symbol} per cycle (10 cycles allowance ={" "}
                      {(parseFloat(budgetAmount) * 10).toFixed(2)} {fundingToken.symbol}).
                    </p>
                    <div className="flex items-center gap-1.5 mt-2 text-[11px] text-mint-400">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>Zero idle custody: tokens remain in your wallet until executed.</span>
                    </div>

                    {txStep === 1 && (
                      <button
                        onClick={handleApprove}
                        disabled={isApproving}
                        className="mt-3 flex items-center gap-2 rounded-xl bg-mint-500 hover:bg-mint-600 px-4 py-2 text-xs font-semibold text-black shadow-glow-mint disabled:opacity-60 transition-all"
                      >
                        {isApproving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {isApproving ? "Waiting for signature..." : `Approve ${fundingToken.symbol}`}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Step 2: Create Schedule */}
              <div
                className={`rounded-2xl border p-4 transition-all ${
                  txStep === 2
                    ? "border-mint-500/40 bg-mint-500/5 shadow-sm"
                    : "border-border-subtle bg-surface-inset opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mint-500 text-xs font-bold text-black">
                    2
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-text-primary">Broadcast Schedule On-Chain</h4>
                    <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                      Register automation in BasketLoopManager on Robinhood Chain Testnet.
                    </p>
                    {txStep === 2 && (
                      <button
                        onClick={handleCreateSchedule}
                        disabled={isCreating}
                        className="mt-3 flex items-center gap-2 rounded-xl bg-mint-500 hover:bg-mint-600 px-4 py-2 text-xs font-semibold text-black shadow-glow-mint disabled:opacity-60 transition-all"
                      >
                        {isCreating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {isCreating ? "Confirming on-chain..." : "Confirm & Activate"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {miningStatus && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-400 flex items-center gap-2">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                <span>{miningStatus}</span>
              </div>
            )}

            {errorMessage && (
              <div className="rounded-xl border border-stargate-error/30 bg-stargate-error/10 p-3 text-xs text-stargate-error flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={isApproving || isCreating}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Funding Token Selection Modal */}
      <TokenSelectModal
        isOpen={isFundingTokenModalOpen}
        onClose={() => setIsFundingTokenModalOpen(false)}
        onSelect={(token) => setFundingToken(token)}
        tokens={curatedTokens.filter((t) => t.isFundingToken && !t.isNative)}
        selectedToken={fundingToken}
        title="Select Funding Token"
        disableNative={true}
      />
    </div>
  );
}
