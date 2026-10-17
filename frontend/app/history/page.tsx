"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  ExternalLink,
  CheckCircle2,
  Layers,
  Repeat,
  Zap,
  Clock,
  ShieldCheck,
  Pause,
  Trash2,
  PlusCircle,
  KeyRound,
} from "lucide-react";
import { getStoredActivities, formatRelativeTime, type ActivityItem } from "@/lib/activity";

export default function HistoryPage() {
  const [filter, setFilter] = useState<string>("all");
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isClient, setIsClient] = useState<boolean>(false);
  // Tick every 30s so relative timestamps ("2 mins ago", etc.) stay accurate
  const [, setTick] = useState(0);

  useEffect(() => {
    setIsClient(true);
    setActivities(getStoredActivities());

    const handleStorage = () => {
      setActivities(getStoredActivities());
    };

    window.addEventListener("storage", handleStorage);

    // Refresh relative timestamps every 30 seconds
    const tickInterval = setInterval(() => setTick((t) => t + 1), 30_000);

    return () => {
      window.removeEventListener("storage", handleStorage);
      clearInterval(tickInterval);
    };
  }, []);

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      if (filter === "swap") return a.type === "Instant Swap";
      if (filter === "dca") return a.type === "Scheduled DCA";
      if (filter === "basket") return a.type === "Instant Basket" || a.type === "Basket Created";
      if (filter === "approval") return a.type === "Token Approval";
      return true;
    });
  }, [activities, filter]);

  const getActivityIcon = (type: ActivityItem["type"]) => {
    switch (type) {
      case "Instant Swap":
        return (
          <div className="h-6 w-6 rounded-lg bg-mint-500/10 text-mint-400 flex items-center justify-center border border-mint-500/20 shrink-0">
            <Repeat className="h-3.5 w-3.5" />
          </div>
        );
      case "Scheduled DCA":
        return (
          <div className="h-6 w-6 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 shrink-0">
            <Layers className="h-3.5 w-3.5" />
          </div>
        );
      case "Instant Basket":
        return (
          <div className="h-6 w-6 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20 shrink-0">
            <Zap className="h-3.5 w-3.5" />
          </div>
        );
      case "Basket Created":
        return (
          <div className="h-6 w-6 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20 shrink-0">
            <PlusCircle className="h-3.5 w-3.5" />
          </div>
        );
      case "Basket Paused":
      case "Basket Resumed":
        return (
          <div className="h-6 w-6 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 shrink-0">
            <Pause className="h-3.5 w-3.5" />
          </div>
        );
      case "Basket Cancelled":
        return (
          <div className="h-6 w-6 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center border border-red-500/20 shrink-0">
            <Trash2 className="h-3.5 w-3.5" />
          </div>
        );
      case "Token Approval":
        return (
          <div className="h-6 w-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0">
            <KeyRound className="h-3.5 w-3.5" />
          </div>
        );
      default:
        return (
          <div className="h-6 w-6 rounded-lg bg-surface-elevated text-text-secondary flex items-center justify-center border border-border-subtle shrink-0">
            <ShieldCheck className="h-3.5 w-3.5" />
          </div>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Execution Ledger
          </h1>
          <p className="text-xs text-text-secondary">
            On-chain transaction logs for instant token swaps, basket creations, and keeper executions on Robinhood Chain
          </p>
        </div>

        {/* Capsule Filter */}
        <div className="inline-flex rounded-full bg-surface border border-border-subtle p-1 self-start sm:self-auto flex-wrap gap-1">
          {[
            { id: "all", label: "All Activity" },
            { id: "swap", label: "Swaps" },
            { id: "dca", label: "Recurring DCA" },
            { id: "basket", label: "Baskets" },
            { id: "approval", label: "Approvals" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-all ${
                filter === f.id
                  ? "bg-surface-elevated text-text-primary border border-border-prominent shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stargate Activity Table */}
      <div className="overflow-hidden rounded-3xl border border-border-subtle bg-surface shadow-stargate">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border-subtle bg-surface-inset text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              <tr>
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">Action</th>
                <th className="px-6 py-4">Input Processed</th>
                <th className="px-6 py-4">Output / Context</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Robinhood Explorer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/50 text-xs">
              {!isClient ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-text-muted">
                    Loading execution logs...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-text-muted">
                    No transactions recorded matching the selected filter.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-elevated/40 transition-colors">
                    <td className="px-6 py-4.5 font-mono text-text-secondary whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-text-muted shrink-0" />
                        {/* Use formatRelativeTime for live-computed relative label */}
                        <span title={new Date(item.timestampMs).toLocaleString()}>
                          {formatRelativeTime(item.timestampMs)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4.5 whitespace-nowrap">
                      <span className="flex items-center gap-2.5 font-medium text-text-primary">
                        {getActivityIcon(item.type)}
                        <span>{item.type}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4.5 font-mono font-semibold text-text-primary whitespace-nowrap">
                      {item.inputAmount}
                    </td>
                    <td className="px-6 py-4.5 font-medium text-mint-400">
                      {item.outputDescription}
                    </td>
                    <td className="px-6 py-4.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                          item.status === "Success"
                            ? "bg-mint-500/10 text-mint-400 border-mint-500/30"
                            : item.status === "Pending"
                            ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                            : "bg-red-500/10 text-red-400 border-red-500/30"
                        }`}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4.5 text-right font-mono whitespace-nowrap">
                      <a
                        href={`https://explorer.testnet.chain.robinhood.com/tx/${item.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-text-secondary hover:text-mint-400 transition-colors"
                      >
                        <span>
                          {item.txHash.length > 12
                            ? `${item.txHash.slice(0, 6)}...${item.txHash.slice(-4)}`
                            : item.txHash}
                        </span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
