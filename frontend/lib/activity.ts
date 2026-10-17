export interface ActivityItem {
  id: string;
  timestamp: string; // ISO string stored at record time
  timestampMs: number;
  type:
    | "Instant Swap"
    | "Scheduled DCA"
    | "Instant Basket"
    | "Basket Created"
    | "Basket Paused"
    | "Basket Resumed"
    | "Basket Cancelled"
    | "Token Approval"
    | "Limit Order Created"
    | "Limit Order Cancelled"
    | "Limit Order Executed";
  inputAmount: string;
  outputDescription: string;
  status: "Success" | "Pending" | "Failed";
  txHash: string;
  chainId?: number;
}

const STORAGE_KEY = "basketloop_transactions";

export const INITIAL_SEED_ACTIVITIES: ActivityItem[] = [
  {
    id: "seed-1",
    timestamp: new Date(Date.now() - 600_000).toISOString(),
    timestampMs: Date.now() - 600_000,
    type: "Instant Swap",
    inputAmount: "50.00 USDC",
    outputDescription: "0.0152 WETH",
    status: "Success",
    txHash: "0x89e1a2f3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1",
  },
  {
    id: "seed-2",
    timestamp: new Date(Date.now() - 7_200_000).toISOString(),
    timestampMs: Date.now() - 7_200_000,
    type: "Scheduled DCA",
    inputAmount: "100.00 USDC",
    outputDescription: "0.018 WETH, 15.2 ARB, 2.5 LINK",
    status: "Success",
    txHash: "0x4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b",
  },
];

/**
 * Formats a timestampMs into a human-readable relative time label.
 * Called at render time so labels update as time passes (not frozen at record time).
 */
export function formatRelativeTime(timestampMs: number): string {
  if (!timestampMs || timestampMs <= 0) return "Unknown";
  const diffMs = Date.now() - timestampMs;
  if (diffMs < 0) return new Date(timestampMs).toLocaleString();
  if (diffMs < 60_000) return "Just now";
  if (diffMs < 3_600_000) {
    const mins = Math.floor(diffMs / 60_000);
    return `${mins} min${mins !== 1 ? "s" : ""} ago`;
  }
  if (diffMs < 86_400_000) {
    const hrs = Math.floor(diffMs / 3_600_000);
    return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  }
  if (diffMs < 7 * 86_400_000) {
    const days = Math.floor(diffMs / 86_400_000);
    return `${days} day${days !== 1 ? "s" : ""} ago`;
  }
  // Older than a week: absolute date
  return new Date(timestampMs).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Retrieves stored user activities from localStorage.
 */
export function getStoredActivities(): ActivityItem[] {
  if (typeof window === "undefined") return INITIAL_SEED_ACTIVITIES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_SEED_ACTIVITIES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_SEED_ACTIVITIES;
  } catch {
    return INITIAL_SEED_ACTIVITIES;
  }
}

/**
 * Records a real on-chain transaction into user activity history.
 * Stores timestampMs; render timestamps using formatRelativeTime(item.timestampMs).
 */
export function recordActivity(item: Omit<ActivityItem, "id" | "timestampMs" | "timestamp">): void {
  if (typeof window === "undefined") return;
  try {
    const current = getStoredActivities();
    // Prevent duplicate hash additions
    if (current.some((c) => c.txHash.toLowerCase() === item.txHash.toLowerCase())) {
      return;
    }

    const now = Date.now();
    const newItem: ActivityItem = {
      ...item,
      id: `${item.txHash}-${now}`,
      timestampMs: now,
      timestamp: new Date(now).toISOString(),
    };

    const updated = [newItem, ...current.filter((c) => !c.id.startsWith("seed-"))];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.slice(0, 50))); // Keep last 50
  } catch {
    // LocalStorage quota or access error
  }
}
