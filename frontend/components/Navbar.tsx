"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowLeftRight, Layers, History, Menu, X, PlusCircle } from "lucide-react";
import { FaucetDropdown } from "./FaucetDropdown";

export function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { name: "Swap", href: "/swap", icon: ArrowLeftRight },
    { name: "Baskets", href: "/baskets", icon: Layers },
    { name: "Create", href: "/baskets/create", icon: PlusCircle },
    { name: "History", href: "/history", icon: History },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 h-16 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <Link href="/baskets" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface border border-border-prominent text-mint-500 shadow-sm group-hover:border-mint-500/50 group-hover:shadow-glow-mint transition-all">
            {/* SVG custom cyclic logo */}
            <svg
              className="h-5 w-5 transition-transform duration-300 group-hover:rotate-45"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight text-text-primary">
              Basket<span className="text-mint-500">Loop</span>
            </span>
          </div>
        </Link>

        {/* Stargate Segmented Capsule Navigation */}
        <nav className="hidden md:flex items-center gap-1 rounded-full bg-surface/90 p-1 border border-border-subtle shadow-inner">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href === "/baskets" && pathname === "/") ||
              (item.href === "/baskets" && pathname.startsWith("/baskets/create"));

            // Exact match for create vs baskets
            const isExactActive = pathname === item.href;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-150 ${
                  isExactActive || (item.href === "/baskets" && pathname === "/")
                    ? "bg-surface-elevated text-text-primary border border-border-prominent shadow-sm"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-hover/60"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Faucet, Wallet & Mobile Trigger */}
        <div className="flex items-center gap-2">
          {/* Faucet & Explorer Dropdown */}
          <FaucetDropdown />

          <div className="[&>div]:!rounded-xl [&_button]:!rounded-xl [&_button]:!font-medium [&_button]:!text-xs">
            <ConnectButton
              showBalance={false}
              chainStatus="icon"
              accountStatus={{
                smallScreen: "avatar",
                largeScreen: "full",
              }}
            />
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden rounded-xl p-2 text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-colors border border-border-subtle"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border-subtle bg-surface/95 backdrop-blur-lg px-4 py-3 space-y-1 animate-in slide-in-from-top-2 duration-150">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href === "/baskets" && pathname === "/");
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-mint-500/10 text-mint-400 border border-mint-500/30"
                    : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
