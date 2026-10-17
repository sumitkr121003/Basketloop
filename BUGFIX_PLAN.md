# BasketLoop Bug Fix Plan & Status Tracker

**Document Version:** 4.0.0 (Session 2 Complete)
**Target Environment:** EVM (Robinhood Chain Testnet / Localhost)
**Primary Source of Truth:** `BUGFIX_PLAN.md`

---

## 1. Executive Status Matrix

| ID | Issue & Component | Root Cause | Status | Verification |
| :--- | :--- | :--- | :--- | :--- |
| **BUG-1** | **Gas Fee Anomaly & Orbit Gas Limit**<br>`frontend/lib/gas.ts`, `frontend/app/swap/page.tsx` | Arbitrum Orbit / Robinhood Chain block gas limit ($2^{50}$) or fallback multiplier applied when simulated call fails, causing astronomical $9.6M / 3940 ETH estimates. | **Fixed & Tested** | Verified realistic testnet fees (`<$0.01` / `~0.000005 ETH`); regression tests reject Orbit block limits; explicit gas bounds enforced. |
| **BUG-2** | **Basket Creation Confirmation & Refetch**<br>`frontend/app/baskets/create/page.tsx` | Premature navigation without `waitForTransactionReceipt`. State not refetched on `baskets` page. | **Fixed & Tested** | Both approval and `createSchedule` await receipt, track mining status, and record confirmed transaction hash. |
| **BUG-3** | **Basket Buying & Pausing/Resuming**<br>`frontend/app/baskets/page.tsx` | UI operated on hardcoded `DEMO_BASKETS` where `id: 1n, 2n` caller is not owner, reverting `_validateOwner`. Real on-chain schedules were never loaded. Instant buy had no allowance check or receipt wait. | **Fixed & Tested** | Full on-chain schedule loader via `getUserSchedules` + `getSchedule`; pre-flight allowance check for instant buy; receipt awaiting. |
| **BUG-4** | **Basket Deletion & Data Synchronization**<br>`frontend/app/baskets/page.tsx` | Contract supports `cancelSchedule(id)` (sets status to Cancelled). UI did not await receipt, did not refresh schedule list, and demo baskets persisted. | **Fixed & Tested** | Calls `cancelSchedule`, awaits receipt, removes cancelled items from active list, updates activity log. |
| **BUG-5** | **Execution Ledger Real-Time Sync**<br>`frontend/app/history/page.tsx`, `frontend/lib/activity.ts` | History page rendered only static `MOCK_ACTIVITIES` with fake hashes. Real transactions (swaps, approvals, creates, buys, pauses, cancels) were not synced to localStorage or ledger. | **Fixed & Tested** | `recordActivity` synchronizes real transaction hashes, timestamps, types, and explorer links; deduplication tested. |
| **BUG-6** | **MockDEXRouter & Approval Reporting**<br>`frontend/app/swap/page.tsx`, `frontend/lib/contracts.ts` | Router deployed on Robinhood testnet is `MockDEXRouter` at `0x4df2C137fFBa52CfD6548f8d58A42446E15d33D6`. Approval handler hardcoded success text without receipt confirmation and without disclosing spender address or allowance. | **Fixed & Tested** | Explicitly displays spender address (`0x4df2...33D6`), exact allowance (with 10× buffer), testnet notice, and awaits confirmed receipt. |
| **BUG-7** | **ETH and Curated Tokens with Official Icons**<br>`frontend/lib/tokens.ts`, `frontend/components/TokenIcon.tsx` | ETH was missing from token selector. Native ETH was not distinguished from ERC20/WETH. Placeholder text avatars used instead of official SVG vector logos. | **Fixed & Tested** | Added native ETH (`0x000...000`), WETH, USDC, USDT, LINK, UNI, ARB with authentic official SVG logos. Native ETH swaps use `swapExactETHForTokens` / `swapExactTokensForETH` with zero approval. |
| **BUG-8** | **Next.js Hydration Mismatch Error**<br>`frontend/app/baskets/page.tsx` | `getNextRunCountdown` executed `Date.now()` during SSR, producing different text strings between server HTML and client hydration. | **Fixed & Tested** | Implemented mounted client-side countdown lifecycle with deterministic SSR placeholder and interval cleanup. |
| **BUG-9** | **Misleading Labels & Generic Permission Warnings**<br>`frontend/app/swap/page.tsx`, `frontend/app/baskets/create/page.tsx` | Misleading "Estimated changes" / generic warnings replaced with accurate balance deltas, exact token spender address, and explicit requested allowances. | **Fixed & Tested** | Replaced with "Estimated changes to your balance", explicit spender address, and non-custodial custody assurances. |
| **BUG-10** | **Real-Time Prices, Slippage, & Real Swap Quotes**<br>`frontend/lib/prices.ts`, `frontend/lib/quote.ts`, `frontend/app/swap/page.tsx` | Swap prices were hardcoded fallback formulas. Raw router `getAmountsOut` returns 1:1 raw units across different token decimals (100 USDC raw = 100_000_000 → displayed as 0.0000000001 ETH). Added real-time price feeds and correct market-rate quote engine. | **Fixed & Tested** | `calculateSwapQuote` uses `priceIn/priceOut × (1 – fee) × amount` with correct decimals. `formatWithSmartPrecision` prevents false zero display. 4 new regression tests verify USDC→ETH, ETH→USDC, unavailable-price error, and precision formatting. |
| **BUG-11** | **ESLint Setup Non-Interactive Failure**<br>`frontend/.eslintrc.json` | Missing ESLint config blocked `npm run lint` with interactive setup prompt. | **Fixed & Tested** | Created `.eslintrc.json`, installed dependencies; `next lint` passes cleanly with 0 errors/warnings. |
| **BUG-12** | **Price Timestamp Visible in UI**<br>`frontend/app/swap/page.tsx` | `Prices: 09:39:15 PM` timestamp was displayed inline in the swap card header. | **Fixed & Tested** | Removed timestamp label; background price refresh still runs every 30s. Stale prices not presented as fresh. |
| **BUG-13** | **Footer Protocol, Security & Community Columns**<br>`frontend/app/layout.tsx` | Footer contained 4-column section with Protocol, Security & Tech, and Community link lists, adding visual clutter and broken external links. | **Fixed & Tested** | Replaced with single-row streamlined footer; only verified network explorer links retained. |
| **BUG-14** | **Orbit L2 Badge in Navbar**<br>`frontend/components/Navbar.tsx` | Static "Orbit L2" badge displayed next to brand logo regardless of connected chain. | **Fixed & Tested** | Removed badge; brand name remains clean. |
| **BUG-15** | **DEMO_BASKETS Fallback & Empty State**<br>`frontend/app/baskets/page.tsx` | When user had no on-chain baskets, page fell back to fake `DEMO_BASKETS` (IDs 101, 102). Demo items could not be paused or cancelled (no on-chain existence). | **Fixed & Tested** | Removed `DEMO_BASKETS` entirely. Connected wallet with no schedules shows clean empty state with "Create Your First Basket" CTA. Not-connected state also handled separately. |
| **BUG-16** | **Network Name Hardcoded in Baskets Page**<br>`frontend/app/baskets/page.tsx` | Page statically displayed "Robinhood Chain Orbit L2" regardless of `chainId`. | **Fixed & Tested** | Dynamic `networkName` computed from `chainId` (Robinhood Testnet, Arbitrum Sepolia, or Hardhat Local). |
| **BUG-17** | **Token Selector Shows Funding/Native Badges Without Balance**<br>`frontend/components/TokenSelectModal.tsx` | Modal displayed `Funding` and `Native` badge pills but no actual on-chain balance. User had no info on what they hold. | **Fixed & Tested** | Removed `Funding` / `Native` badges. Fetches live on-chain balance (ETH via `getBalance`, ERC-20 via `balanceOf`) for all tokens when modal opens. Displays balance with Wallet icon. |
| **BUG-18** | **No NetworkIcon Component**<br>`frontend/components/NetworkIcon.tsx` | No dedicated SVG component for chain logos. | **Fixed & Tested** | Created `NetworkIcon.tsx` with: Robinhood Chain feather on `#0D0E11` with `#CCFF00` neon; Arbitrum blue chevron; Ethereum diamond fallback. |
| **BUG-19** | **MockDEXRouter Decimal Mismatch — 0.00000000006 WETH output**<br>`contracts/contracts/mocks/MockDEXRouter.sol` | `getAmountsOut` and `swapExactTokensForTokens` passed raw `amountIn` straight through as `amountOut` with no decimal scaling. For 60 USDC (6 dec) → WETH (18 dec): `60_000_000 raw USDC → 60_000_000 raw WETH = 0.00000000006 WETH` instead of `60 WETH`. Root cause: 12-order-of-magnitude gap between 6- and 18-decimal tokens never accounted for. | **Fixed & Tested** | Added `_computeAmountOut(amountIn, tokenIn, tokenOut)` that reads `decimals()` from each token via `ERC20`, computes `scalar = 10^(|decimalsOut − decimalsIn|)`, then applies `rateMultiplierBps`. `swapExactETHForTokens` and `swapExactTokensForETH` similarly corrected. **36/36 tests passing** (28 original + 8 new decimal-regression tests in `MockDEXRouterDecimalFix.test.js`). |
| **BUG-20** | **History Page Displays 'Just now' Permanently for Older Transactions**<br>`frontend/lib/activity.ts`, `frontend/app/history/page.tsx` | `recordActivity` stored static string `timestamp: "Just now"` provided by callers, which froze permanently in `localStorage`. History page rendered `{item.timestamp}` directly without computing elapsed time. | **Fixed & Tested** | Stored ISO string + `timestampMs` at record time. Added `formatRelativeTime(timestampMs)` helper for dynamic elapsed relative time (`Just now`, `X mins ago`, `X hours ago`, full date). History page updates live on 30s interval with absolute timestamp tooltip. 6 new regression tests. |
| **BUG-21** | **Swap Outputs & Balances Not Visible for TokenOut**<br>`frontend/app/swap/page.tsx` | Swap page only subscribed to `tokenIn`'s ERC-20 contract and only called `refetchErc20Balance()` for `tokenIn`. Output panel lacked a live token balance indicator (`bal:`). After swap, `tokenOut` on-chain balance was never re-read or displayed. | **Fixed & Tested** | Added `erc20BalanceOutData` hook for `tokenOut`. Added live `bal:` indicator to "You Receive" card panel. Hook refetches `ethBalance`, `erc20BalanceIn`, `erc20BalanceOut`, and `allowance` upon transaction confirmation. Clarified MockDEX testnet simulated rates in swap details. 3 new regression tests. |
| **BUG-22** | **Quote Mismatch: Displayed Swap Quote Differed from MockDEXRouter Output**<br>`frontend/lib/quote.ts`, `frontend/app/swap/page.tsx` | The frontend used CoinGecko / Binance price feeds (calculating e.g. 0.04 ETH for 100 USDC) while on-chain `MockDEXRouter.sol` executes using `_computeAmountOut` (1:1 simulated rate with decimal normalisation, producing 100 WETH). `minOut` slippage checks also had split derivations. | **Fixed & Tested** | Replaced external market quote on testnet with direct `computeMockAmountOut` formula and on-chain `getAmountsOut` output. Unified `minOut` slippage checks with the quote. UI cleanly labeled as "Simulated Mock Quote · 1:1 Rate". 5 new regression tests. |

---

## 2. New Files Created This Session

| File | Purpose |
| :--- | :--- |
| `frontend/lib/quote.ts` | Market-rate and MockDEX swap quote engine with decimal-aware precision and `formatWithSmartPrecision` |
| `frontend/app/api/quote/route.ts` | Next.js API route for server-side swap quotes with 10s HTTP cache |
| `frontend/components/NetworkIcon.tsx` | Official SVG network logos (Robinhood feather, Arbitrum, Ethereum) |
| `contracts/scripts/deploy-router-only.js` | Option B automated router-only deployment and upgrade script |

---

## 3. Test & Build Verification Summary

* **Frontend Regression Tests:** **26/26 passing** via `npm run test` (node --test tests/regression.test.js)
* **Smart Contract Test Suite:** **36/36 passing** via `npm test` (`hardhat test`)
* **Frontend ESLint Check:** Clean exit (0 errors, 0 warnings) via `npm run lint`
* **Next.js Production Build:** Successful — 9 routes generated (7 static + 1 dynamic API `/api/quote`) via `npm run build`

---

## 4. Official Robinhood Chain Documentation Audit

| Property | Testnet (Chain ID 46630) | Mainnet (Chain ID 4663) |
| :--- | :--- | :--- |
| RPC URL | `https://rpc.testnet.chain.robinhood.com/rpc` | `https://rpc.mainnet.chain.robinhood.com/` |
| Native Currency | ETH (18 decimals) | ETH (18 decimals) |
| Explorer | `https://explorer.testnet.chain.robinhood.com` | `https://robinhoodchain.blockscout.com` |
| Faucet | `https://faucet.testnet.chain.robinhood.com` | N/A |

**Deployed Testnet Contracts (`deployments.json`):**

| Contract | Address |
| :--- | :--- |
| `BasketLoopManager` | `0xdb6E99b366a34b12c4F538F88aB819a8b0793C54` |
| `MockDEXRouter` | `0x4df2C137fFBa52CfD6548f8d58A42446E15d33D6` |
| `MockUSDC` | `0xb7010f73f0A2217b8e863F20B5c5EA219D43eDc2` (6 dec) |
| `MockUSDT` | `0xE1E101575606a11566adf6022294bD1a3E01c20D` (6 dec) |
| `MockWETH` | `0xf5581b11BF5c5Cb44f1e44a21b80957FF091977b` (18 dec) |
| `MockARB` | `0x47c1390FF38D6f391C5132A113D75E96Ae5b1565` (18 dec) |
| `MockLINK` | `0xf653958B8a9296E245Cc4DD03584f939C417deb2` (18 dec) |
| `MockUNI` | `0xA7924B54a1120AAE87cC59ed5cc01Dd099c70513` (18 dec) |
