"use client";

import React, { useState, useRef, useEffect } from "react";
import { Droplets, ExternalLink, ShieldAlert, Check, ChevronDown } from "lucide-react";
import { useChainId } from "wagmi";

interface NetworkResource {
  chainId: number;
  name: string;
  currency: string;
  explorerUrl: string;
  faucetUrls: { label: string; url: string; note: string }[];
}

const NETWORK_RESOURCES: NetworkResource[] = [
  {
    chainId: 46630,
    name: "Robinhood Chain Testnet",
    currency: "ETH (Testnet)",
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    faucetUrls: [
      {
        label: "Official Robinhood Faucet",
        url: "https://faucet.testnet.chain.robinhood.com",
        note: "Claim testnet ETH for gas",
      },
      {
        label: "Robinhood Testnet Explorer",
        url: "https://explorer.testnet.chain.robinhood.com",
        note: "Verify on-chain transactions",
      },
    ],
  },
  {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    currency: "Sepolia ETH",
    explorerUrl: "https://sepolia.arbiscan.io",
    faucetUrls: [
      {
        label: "Chainlink Arbitrum Sepolia Faucet",
        url: "https://faucets.chain.link/arbitrum-sepolia",
        note: "Verified testnet faucet",
      },
      {
        label: "Arbitrum Sepolia Explorer",
        url: "https://sepolia.arbiscan.io",
        note: "Verify on-chain transactions",
      },
    ],
  },
];

export function FaucetDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentChainId = useChainId();

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const activeNetwork =
    NETWORK_RESOURCES.find((n) => n.chainId === currentChainId) || NETWORK_RESOURCES[0];

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface border border-border-subtle hover:border-mint-500/50 hover:bg-surface-elevated text-xs font-semibold text-text-secondary hover:text-text-primary transition-all shadow-sm group"
        aria-label="Open testnet faucets and explorers"
        title="Testnet Faucets & Block Explorers"
      >
        <Droplets className="w-4 h-4 text-cyan-400 group-hover:text-mint-400 transition-colors" />
        <span className="hidden sm:inline">Faucets</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-surface-elevated border border-border-prominent p-4 shadow-2xl z-50 animate-in fade-in-0 zoom-in-95 duration-150 space-y-3.5">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Droplets className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-text-primary tracking-tight">
                  Testnet Resources
                </h4>
                <p className="text-[10px] text-text-muted">
                  Official faucets & block explorers
                </p>
              </div>
            </div>

            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-inset border border-border-subtle text-text-secondary">
              ID: {currentChainId || 46630}
            </span>
          </div>

          {/* Connected Network Indicator */}
          <div className="p-2.5 rounded-xl bg-surface-inset border border-border-subtle/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-text-primary text-[11px]">
                {activeNetwork.name}
              </span>
            </div>
            <span className="text-[10px] text-text-muted font-mono">
              Gas: {activeNetwork.currency}
            </span>
          </div>

          {/* Links for Active Network */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-mono tracking-wider text-text-muted px-1">
              {activeNetwork.name} Links
            </span>
            {activeNetwork.faucetUrls.map((item) => (
              <a
                key={item.url}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-2 rounded-xl bg-surface hover:bg-surface-hover border border-border-subtle hover:border-border-prominent transition-all group"
              >
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-primary group-hover:text-mint-400 transition-colors">
                    {item.label}
                  </span>
                  <span className="text-[10px] text-text-muted">{item.note}</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-text-muted group-hover:text-mint-400 transition-colors shrink-0 ml-2" />
              </a>
            ))}
          </div>

          {/* Other Supported Networks */}
          {NETWORK_RESOURCES.filter((n) => n.chainId !== activeNetwork.chainId).map((other) => (
            <div key={other.chainId} className="pt-2 border-t border-border-subtle/60 space-y-1.5">
              <span className="text-[10px] uppercase font-mono tracking-wider text-text-muted px-1">
                {other.name} Links
              </span>
              {other.faucetUrls.map((item) => (
                <a
                  key={item.url}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2 rounded-xl bg-surface hover:bg-surface-hover border border-border-subtle hover:border-border-prominent transition-all group"
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-text-primary group-hover:text-mint-400 transition-colors">
                      {item.label}
                    </span>
                    <span className="text-[10px] text-text-muted">{item.note}</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-text-muted group-hover:text-mint-400 transition-colors shrink-0 ml-2" />
                </a>
              ))}
            </div>
          ))}

          {/* Testnet Disclaimer */}
          <div className="p-2 rounded-xl bg-surface-inset border border-border-subtle/60 text-[10px] text-text-muted leading-relaxed flex items-start gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>
              Testnet tokens are strictly for testing and experimentation. They hold zero monetary value.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
