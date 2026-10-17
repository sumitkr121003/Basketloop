import { formatUnits, parseUnits } from "viem";
import { type TokenInfo } from "./tokens";

export type LimitOrderStatus = "Open" | "Filled" | "Cancelled" | "Expired";

export interface LimitOrderData {
  id: string; // On-chain orderId or local tracker
  maker: string;
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  amountIn: string;
  amountInRaw: string;
  minAmountOut: string;
  minAmountOutRaw: string;
  targetPrice: string; // formatted target rate (tokenOut per tokenIn)
  expirySeconds: number; // 0 for never, or duration in seconds
  expiryTimestamp: number; // unix timestamp in seconds (0 = never)
  createdAt: number; // unix timestamp in milliseconds
  status: LimitOrderStatus;
  txHash?: string;
  fillTxHash?: string;
}

export interface ExpiryOption {
  label: string;
  seconds: number;
}

export const EXPIRY_OPTIONS: ExpiryOption[] = [
  { label: "10 minutes", seconds: 600 },
  { label: "1 hour", seconds: 3600 },
  { label: "1 day", seconds: 86400 },
  { label: "1 week", seconds: 604800 },
  { label: "Never", seconds: 0 },
];

/**
 * Validates a custom date/time string from local datetime-local input and converts it to unix timestamp in seconds.
 * Ensures the date is strictly in the future.
 */
export function validateCustomExpiry(dateTimeLocalStr: string): {
  isValid: boolean;
  timestamp: number;
  error?: string;
} {
  if (!dateTimeLocalStr) {
    return { isValid: false, timestamp: 0, error: "Please select an expiry date and time" };
  }

  const parsed = new Date(dateTimeLocalStr);
  const timeMs = parsed.getTime();

  if (isNaN(timeMs)) {
    return { isValid: false, timestamp: 0, error: "Invalid date format" };
  }

  const nowMs = Date.now();
  // Must be at least 60 seconds in the future
  if (timeMs <= nowMs + 60_000) {
    return { isValid: false, timestamp: 0, error: "Expiry time must be at least 1 minute in the future" };
  }

  const timestampSec = Math.floor(timeMs / 1000);
  return { isValid: true, timestamp: timestampSec };
}

/**
 * Format expiry display for cards and tables
 */
export function formatExpiryDisplay(expiryTimestamp: number): string {
  if (expiryTimestamp === 0) return "Never";
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiryTimestamp <= nowSec) return "Expired";
  const diffSec = expiryTimestamp - nowSec;
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.round(diffSec / 60));
    return `In ${mins} min${mins === 1 ? "" : "s"}`;
  }
  if (diffSec < 86400) {
    const hours = Math.round(diffSec / 3600);
    return `In ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const date = new Date(expiryTimestamp * 1000);
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const STORAGE_KEY = "basketloop_limit_orders";

/**
 * Calculates the minAmountOut given an amountIn and target execution price (tokenOut per tokenIn).
 * Example: 100 USDC input, targetPrice = 0.0004 WETH per USDC -> minAmountOut = 0.04 WETH.
 */
export function calculateLimitOrderOutputs(
  amountIn: string,
  targetPrice: string,
  decimalsIn: number,
  decimalsOut: number
): {
  isValid: boolean;
  minAmountOut: string;
  minAmountOutRaw: bigint;
  amountInRaw: bigint;
  error?: string;
} {
  const inNum = parseFloat(amountIn);
  const priceNum = parseFloat(targetPrice);

  if (isNaN(inNum) || inNum <= 0) {
    return { isValid: false, minAmountOut: "0.00", minAmountOutRaw: 0n, amountInRaw: 0n, error: "Enter a valid amount" };
  }
  if (isNaN(priceNum) || priceNum <= 0) {
    return { isValid: false, minAmountOut: "0.00", minAmountOutRaw: 0n, amountInRaw: 0n, error: "Enter a valid target price" };
  }

  try {
    const amountInRaw = parseUnits(amountIn, decimalsIn);
    const expectedOutFloat = inNum * priceNum;

    // Guard precision
    const maxDec = Math.min(decimalsOut, 18);
    const formattedOut = expectedOutFloat.toFixed(maxDec);
    const minAmountOutRaw = parseUnits(formattedOut, decimalsOut);

    return {
      isValid: true,
      minAmountOut: expectedOutFloat < 0.000001 ? expectedOutFloat.toFixed(8) : expectedOutFloat < 0.01 ? expectedOutFloat.toFixed(6) : expectedOutFloat.toFixed(4),
      minAmountOutRaw,
      amountInRaw,
    };
  } catch (err: any) {
    return {
      isValid: false,
      minAmountOut: "0.00",
      minAmountOutRaw: 0n,
      amountInRaw: 0n,
      error: "Calculation precision overflow",
    };
  }
}

/**
 * Format status badge styling and label.
 */
export function getLimitOrderStatusBadge(status: LimitOrderStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case "Open":
      return { label: "Open", className: "bg-mint-500/10 text-mint-400 border-mint-500/30" };
    case "Filled":
      return { label: "Filled", className: "bg-blue-500/10 text-blue-400 border-blue-500/30" };
    case "Cancelled":
      return { label: "Cancelled", className: "bg-surface-elevated text-text-muted border-border-subtle" };
    case "Expired":
      return { label: "Expired", className: "bg-amber-500/10 text-amber-400 border-amber-500/30" };
  }
}

/**
 * Reads user limit orders from local storage.
 */
export function getStoredLimitOrders(): LimitOrderData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Saves or updates a limit order in local storage.
 */
export function saveLimitOrder(order: LimitOrderData): void {
  if (typeof window === "undefined") return;
  try {
    const orders = getStoredLimitOrders();
    const index = orders.findIndex((o) => o.id === order.id);
    let updated: LimitOrderData[];
    if (index >= 0) {
      updated = [...orders];
      updated[index] = order;
    } else {
      updated = [order, ...orders];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.slice(0, 100)));
  } catch {
    // LocalStorage quota or access error
  }
}

/**
 * Updates status of a stored limit order.
 */
export function updateLimitOrderStatus(orderId: string, status: LimitOrderStatus, fillTxHash?: string): void {
  if (typeof window === "undefined") return;
  try {
    const orders = getStoredLimitOrders();
    const index = orders.findIndex((o) => o.id === orderId);
    if (index >= 0) {
      orders[index].status = status;
      if (fillTxHash) orders[index].fillTxHash = fillTxHash;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    }
  } catch {
    // LocalStorage error
  }
}

/**
 * Maps Solidity OrderStatus uint8 enum to LimitOrderStatus string.
 */
export function mapOnChainStatus(statusNum: number): LimitOrderStatus {
  switch (statusNum) {
    case 0:
      return "Open";
    case 1:
      return "Filled";
    case 2:
      return "Cancelled";
    case 3:
      return "Expired";
    default:
      return "Open";
  }
}
