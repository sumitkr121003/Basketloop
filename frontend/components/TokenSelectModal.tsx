"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import { X, Search, Check, Wallet } from "lucide-react";
import { type TokenInfo, isNativeToken } from "@/lib/tokens";
import { erc20Abi } from "@/lib/contracts";
import { TokenIcon } from "./TokenIcon";

interface TokenSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: TokenInfo) => void;
  tokens: TokenInfo[];
  selectedToken?: TokenInfo;
  title?: string;
  disableNative?: boolean; // When protocol requires ERC-20 (e.g. recurring DCA)
}

export function TokenSelectModal({
  isOpen,
  onClose,
  onSelect,
  tokens,
  selectedToken,
  title = "Select a Token",
  disableNative = false,
}: TokenSelectModalProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [loadingBalances, setLoadingBalances] = useState(false);

  const availableTokens = useMemo(() => {
    if (disableNative) {
      return tokens.filter((t) => !isNativeToken(t));
    }
    return tokens;
  }, [tokens, disableNative]);

  const filteredTokens = useMemo(() => {
    if (!searchQuery.trim()) return availableTokens;
    const q = searchQuery.toLowerCase().trim();
    return availableTokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q)
    );
  }, [availableTokens, searchQuery]);

  // Fetch live on-chain balances for all available tokens when modal is open
  useEffect(() => {
    if (!isOpen || !address || !publicClient) return;

    let isMounted = true;
    const fetchBalances = async () => {
      setLoadingBalances(true);
      const newBalances: Record<string, string> = {};

      try {
        await Promise.all(
          availableTokens.map(async (token) => {
            try {
              if (isNativeToken(token)) {
                const bal = await publicClient.getBalance({ address });
                const formatted = parseFloat(formatUnits(bal, 18)).toFixed(4);
                newBalances[token.symbol] = formatted;
              } else {
                const bal = await publicClient.readContract({
                  address: token.address,
                  abi: erc20Abi,
                  functionName: "balanceOf",
                  args: [address],
                });
                const formatted = parseFloat(formatUnits(bal as bigint, token.decimals)).toFixed(4);
                newBalances[token.symbol] = formatted;
              }
            } catch {
              newBalances[token.symbol] = "0.0000";
            }
          })
        );

        if (isMounted) {
          setBalances(newBalances);
        }
      } finally {
        if (isMounted) {
          setLoadingBalances(false);
        }
      }
    };

    fetchBalances();

    return () => {
      isMounted = false;
    };
  }, [isOpen, address, publicClient, availableTokens]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in-0 duration-200">
      <div
        className="w-full max-w-md rounded-2xl bg-surface border border-border-prominent shadow-stargate p-5 relative space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-1">
          <h3 className="text-base font-semibold text-text-primary tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search Field */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by name, symbol, or address"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            className="w-full rounded-xl bg-surface-inset border border-border-subtle pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-mint-500 transition-colors"
          />
        </div>

        {/* Quick Selection Pills */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {availableTokens.slice(0, 5).map((t) => {
            const isSelected =
              selectedToken &&
              (isNativeToken(t) && isNativeToken(selectedToken)
                ? true
                : selectedToken.address.toLowerCase() === t.address.toLowerCase());
            return (
              <button
                key={t.symbol}
                onClick={() => {
                  onSelect(t);
                  onClose();
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  isSelected
                    ? "bg-mint-500/20 text-mint-400 border border-mint-500/40"
                    : "bg-surface-elevated border border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-prominent"
                }`}
              >
                <TokenIcon symbol={t.symbol} size={16} />
                <span className="font-semibold">{t.symbol}</span>
              </button>
            );
          })}
        </div>

        {/* Token List */}
        <div className="max-h-72 overflow-y-auto space-y-1 pt-2 divide-y divide-border-subtle/40">
          {filteredTokens.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-muted">
              No tokens found matching &quot;{searchQuery}&quot;
            </div>
          ) : (
            filteredTokens.map((token) => {
              const isSelected =
                selectedToken &&
                (isNativeToken(token) && isNativeToken(selectedToken)
                  ? true
                  : selectedToken.address.toLowerCase() === token.address.toLowerCase());

              const userBalance = balances[token.symbol];

              return (
                <button
                  key={`${token.symbol}-${token.address}`}
                  onClick={() => {
                    onSelect(token);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all group ${
                    isSelected
                      ? "bg-surface-elevated border border-mint-500/30"
                      : "hover:bg-surface-elevated/70 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <TokenIcon symbol={token.symbol} size={32} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-text-primary">{token.symbol}</span>
                      </div>
                      <div className="text-xs text-text-secondary truncate max-w-[150px] sm:max-w-[180px]">
                        {token.name}
                      </div>
                    </div>
                  </div>

                  {/* Live On-Chain Balance & Selection Indicator */}
                  <div className="flex items-center gap-3 text-right">
                    {address && (
                      <div className="space-y-0.5">
                        <div className="text-xs font-mono font-semibold text-text-primary">
                          {userBalance !== undefined ? userBalance : loadingBalances ? "..." : "0.0000"}
                        </div>
                        <div className="text-[10px] text-text-muted flex items-center gap-1 justify-end">
                          <Wallet className="h-2.5 w-2.5" />
                          <span>Balance</span>
                        </div>
                      </div>
                    )}

                    {isSelected && (
                      <div className="h-5 w-5 rounded-full bg-mint-500/20 text-mint-400 flex items-center justify-center shrink-0">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
