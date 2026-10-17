# BasketLoop UI Design Specification & Design System
**Inspired by Stargate Finance Design Language — Adapted for Non-Custodial Recurring Crypto Baskets**

- **Document Version:** 2.0.0
- **Status:** Approved for Implementation
- **Target Platform:** Responsive Web (Mobile, Tablet, Desktop)
- **Reference Application:** [Stargate Finance](https://stargate.finance/) (LayerZero Omnichain Liquidity Protocol)
- **Brand Identity:** BasketLoop (Non-Custodial Recurring Investment Protocol on Robinhood Chain Orbit L2)

---

## 1. Design Goals

1. **Elevate to Tier-1 DeFi Aesthetics:** Transform BasketLoop from a functional prototype into an institutional-grade, high-polish Web3 application that matches the visual sophistication, micro-interactions, and spatial rhythm of Stargate Finance.
2. **Preserve Product Identity & Core Purpose:** Retain BasketLoop's signature identity — effortless non-custodial recurring basket DCA (Dollar-Cost Averaging) and instant DEX swaps — while using Stargate's layout structure, card depths, and precision typography as a design benchmark.
3. **Harmonious Tokenized Design System:** Establish a unified system of colors, dark surfaces, border treatments, shadows, corner radii, and spacing scales through Tailwind CSS and reusable React components.
4. **Intuitive Financial Ergonomics:** Enable users to seamlessly configure complex multi-asset allocations ($2 \le N \le 5$, $\sum = 100\%$), review execution cadences, and execute instant trades with minimal cognitive load and zero anxiety.
5. **Robust Responsive Fidelity:** Deliver an uncompromised experience across mobile viewports (360px+), tablets (768px+), and large desktop monitors (1280px - 1920px+).

---

## 2. Reference Website Analysis (Stargate Finance)

Based on direct inspection of `https://stargate.finance/` and its production Next.js runtime:

### A. Surface Architecture & Depths
* **Root Background:** `#141414` — Deep, neutral matte charcoal/black rather than saturated navy. Creates a clean, cinema-grade canvas.
* **Canvas Texture:** A subtle, repeating micro-constellation or starfield pattern (`/static/backgrounds/stars.webp`) combined with soft ambient radial glows behind primary interaction cards.
* **Primary Container Surfaces:** `#212121` — Elevated card panels with `1px solid #2C2C2C` or `#252525` borders.
* **Inset Input Surfaces:** `#171717` to `#1A1A1A` — Inset recessed surfaces for "You Pay" and "You Receive" fields, creating an immediate tactile distinction between the outer card chassis and interactive input zones.
* **Box Shadows:** `0px 4px 111.9px 0px rgba(20, 20, 20, 0.80)` — Expansive, diffused dark drop shadows providing floating depth without heavy colored halos.

### B. Typography & Hierarchy
* **Primary Typeface:** `Geist` / `Inter` (`font-sans`), loaded with weights `400` (Regular), `500` (Medium), `600` (SemiBold), and `700` (Bold).
* **High Contrast Primary Text:** `#FAFAFA` (Off-white / 98% brightness) ensures maximum legibility against dark surfaces.
* **Secondary / Descriptive Text:** `#9A9A9A` (Muted gray) provides clear hierarchy for labels, balances, network notes, and transaction metadata.
* **Micro-Labels & Badges:** Upper-case, tracking-wider 11px-12px labels (`font-mono` or `font-semibold`) for status badges and input caps.

### C. Color Accents & Semantic States
* **Signature Accent:** `#0FB983` — Stargate's vibrant emerald/teal green (high vibrancy, high contrast against `#141414`).
* **Warning Color:** `#F46F28` — Warm amber/orange for slippage warnings and gas spikes.
* **Destructive / Error Color:** `#F3566B` — Vibrant coral pink/red for transaction failures and insufficient allowances.
* **Selection / Highlight:** `rgba(250, 250, 250, 0.12)` text selection and subtle `rgba(255, 255, 255, 0.05)` hover fills.

### D. Layout & Structural Rhythms
* **Header:** Minimalist sticky navigation (`height: 64px`), backdrop blur `backdrop-filter: blur(8px)` with transparent or `#141414/80` background.
* **Navigation Links:** Horizontal tab grouping with `font-size: 14px`, `font-weight: 500`, `#9A9A9A` transitioning to `#FAFAFA` on hover with a `border-radius: 6px`.
* **Primary Transaction Card:** Centered floating container (`max-width: 480px` to `540px`), generous internal padding (`p-6` to `p-8`), rounded corners (`20px` to `24px`).
* **Seam Invert Button:** Floating circular/pill button centered exactly between the input and output container seams with a `180deg` rotation animation on trigger.

---

## 3. BasketLoop Brand Adaptation

BasketLoop adapts Stargate's refined design language to its own identity and product feature set:

| Dimension | Stargate Finance (Reference) | BasketLoop (Adapted Brand) |
| :--- | :--- | :--- |
| **Product Purpose** | Cross-chain token bridge & liquidity pools | Non-custodial automated recurring baskets (DCA) & instant swaps |
| **Primary Accent** | Emerald Teal (`#0FB983`) | Electric Mint / Emerald (`#10B981` / `#0FB983`) |
| **Secondary Accent** | LayerZero Cyan / Slate | Orbit Violet / Cyan (`#6366F1` / `#38BDF8`) for multi-asset baskets |
| **Canvas & Theme** | `#141414` deep space background | `#141414` deep carbon background with subtle orbital gradient |
| **Surfaces** | `#212121` card, `#171717` input insets | `#1C1C1E` chassis card, `#141416` recessed inputs, `#252528` elevated |
| **Card Radii** | `20px` border radius | `20px` (`rounded-2xl`) outer, `14px` (`rounded-xl`) inner |
| **Branding Element** | Interlocking geometric stars | BasketLoop cyclic ring (`Repeat` / `Layers` icon) with Orbit L2 pill |

---

## 4. Color Palette & Design Tokens

### 4.1 Base Surfaces & Backgrounds
* **`bg-canvas` (`#141414`):** Root app background (dark charcoal black).
* **`bg-surface` (`#1C1C1E`):** Primary card, panel, and container fill.
* **`bg-surface-elevated` (`#242428`):** Hover states, popovers, dropdown menus, and active modal overlays.
* **`bg-inset` (`#141416`):** Inset input boxes, token row backgrounds, and recessed parameter fields.
* **`border-subtle` (`#26262A`):** Low-contrast dividers and default card borders.
* **`border-prominent` (`#36363C`):** Hover borders, active tab outlines, and focused input borders.

### 4.2 Brand & Functional Accents
* **`mint-400` (`#34D399`) / `mint-500` (`#0FB983`):** Primary brand accent for CTAs, active pills, success confirmations, and live countdown badges.
* **`mint-glow` (`rgba(15, 185, 131, 0.15)`): Subtle ambient radial glow behind major cards and active buttons.
* **`indigo-400` (`#818CF8`) / `indigo-500` (`#6366F1`):** Secondary accent for recurring schedule badges and multi-token asset distribution tags.
* **`cyan-400` (`#38BDF8`):** Info tooltips, transaction link icons, and network indicators.

### 4.3 Typography Colors
* **`text-primary` (`#FAFAFA`):** Headers, active values, token tickers, and primary button labels.
* **`text-secondary` (`#9A9A9A`):** Descriptive copy, inactive navigation tabs, and field subtitles.
* **`text-tertiary` (`#666666`):** Inactive indicators, disclaimer text, and placeholder values.

### 4.4 Semantic State Tokens
* **`state-success` (`#0FB983`):** Schedule active, swap confirmed, allowance approved.
* **`state-warning` (`#F46F28`):** Low deployer/wallet balance warning, price impact threshold.
* **`state-error` (`#F3566B`):** Reverted transaction, slippage breach, invalid allocation sum.

---

## 5. Typography

BasketLoop utilizes the modern geometric sans-serif font stack with dedicated numeric support:

* **Primary Font Stack:** `'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
* **Monospace / Numeric Font Stack:** `'Geist Mono', 'JetBrains Mono', 'Roboto Mono', monospace`

### Typography Scale
* **Display 1 (Hero / Card Headers):** `24px` (`text-2xl`), line-height `32px`, font-weight `700` (`font-bold`), tracking `-0.02em`.
* **Title 2 (Section Headers / Modal Titles):** `18px` (`text-lg`), line-height `24px`, font-weight `600` (`font-semibold`), tracking `-0.01em`.
* **Body Large (Numeric Inputs):** `28px - 32px` (`text-3xl`), line-height `36px`, font-weight `700`, tabular numbers.
* **Body Regular (Standard Content):** `14px` (`text-sm`), line-height `20px`, font-weight `400` or `500`.
* **Caption / Micro-copy (Labels & Subtitles):** `12px` (`text-xs`), line-height `16px`, font-weight `500`, tracking `0.02em`.
* **Badge / Mono Label:** `11px` (`text-[11px]`), line-height `14px`, font-mono, uppercase.

---

## 6. Spacing & Density System

Consistent 4px/8px modular rhythm across all views:

* **`space-1` (4px):** Micro gaps between icons and adjacent text.
* **`space-2` (8px):** Tight gap inside pills, button internals, and badge padding.
* **`space-3` (12px):** Standard gap between stacked form fields or adjacent buttons.
* **`space-4` (16px):** Internal padding for inset input containers (`p-4`).
* **`space-6` (24px):** Internal padding for primary cards (`p-6`) and section gaps.
* **`space-8` (32px):** Generous desktop layout gaps and vertical offsets.

---

## 7. Layout & Responsive Breakpoints

* **Mobile (`< 640px`):** Single-column layout, sticky mobile navigation drawer, full-width cards with `16px` horizontal padding.
* **Tablet (`640px - 1024px`):** Centered layout, max card container `520px` for swap/create, multi-column dashboard grid (2 columns for basket cards).
* **Desktop (`1024px+`):** Centered main stage (`max-w-6xl` or `max-w-7xl`), max card container `480px - 560px` for swap widget, 3-column dashboard grid for active baskets.

---

## 8. Component Specifications

### 8.1 Top Navigation Bar (`Navbar.tsx`)
* **Height:** `64px` desktop / `64px` mobile.
* **Position:** `sticky top-0 z-50`.
* **Visuals:** Transparent with `backdrop-blur-md bg-[#141414]/80 border-b border-[#26262A]`.
* **Brand Logo:** Modern cyclic icon inside an emerald badge with off-white `BasketLoop` wordmark and pill tag `Orbit L2`.
* **Segmented Navigation Tabs:** Pill capsule container (`bg-[#1C1C1E] border border-[#26262A] p-1 rounded-full`). Active tab highlights with `#2A2A30` surface, `#FAFAFA` text, and subtle glow.
* **Wallet Connection:** RainbowKit `ConnectButton` customized with dark theme, compact pill styling, and clean network badge.

### 8.2 Swap & Transaction Card (`/swap`)
* **Card Chassis:** `rounded-2xl bg-[#1C1C1E] border border-[#26262A] p-6 shadow-2xl relative`.
* **Top Controls:** Section title `Swap` alongside an icon-only `Settings` gear button for slippage configuration.
* **Inset Input Containers ("You Pay" & "You Receive"):**
  * Inset panel with `bg-[#141416] border border-[#26262A] rounded-xl p-4 transition-all focus-within:border-[#38BDF8]`.
  * Top row: micro-label `You Pay` / `You Receive` with `Balance: X.XXXX` and clickable `Max` pill button.
  * Middle row: large borderless input with bold tabular font (`32px`) paired with a pill token selector button.
  * Bottom row: approximate USD equivalent or rate preview.
* **Direction Invert Button:** Floating circular button (`36px x 36px`) centered between input panels with `bg-[#242428] border border-[#36363C] rounded-full text-gray-300 hover:text-white hover:border-emerald-500 hover:rotate-180 transition-all duration-300 shadow-md`.
* **Action Button:** Full-width CTA with bold typography, high visual weight (`bg-[#0FB983] hover:bg-[#0da070] text-black font-semibold py-3.5 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-[0.99] transition-all`).

### 8.3 Recurring Basket Creator (`/baskets/create`)
* **Progress Stepper:** Sleek segmented steps bar (Step 1: Allocation & Assets $\rightarrow$ Step 2: Schedule & Budget $\rightarrow$ Step 3: Authorization).
* **Interactive Allocation Sliders:** Multi-token allocation distribution bar with real-time percentage indicators summing to 100%.
* **Token Pickers:** Clean list of curated assets (USDC, USDT, WETH, ARB, LINK, UNI) plus custom ERC-20 contract inspector.
* **Interval Capsule Selector:** Segmented demo mode (10m, 1h) vs standard mode (Daily, Weekly, Monthly) toggle with instant schedule countdown preview.

### 8.4 Baskets Dashboard (`/baskets`)
* **Summary Header:** Metrics row displaying `Total Active Baskets`, `Accumulation Value Processed`, and `Next Due Schedule`.
* **Filter Tabs:** Segmented capsule filter (`All`, `Active`, `Paused`).
* **Basket Cards:**
  * Chassis: `rounded-2xl bg-[#1C1C1E] border border-[#26262A] p-5 hover:border-[#36363C] transition-all group`.
  * Status Pill: Live pulsating status badge (Green for Active, Amber for Paused).
  * Asset Distribution Bar: Miniature colored horizontal bar displaying the asset allocation split (e.g. 50% WETH, 30% ARB, 20% LINK).
  * Timing & Countdown: Live ticking execution countdown clock with keeper relayer readiness badge.
  * Control Actions: Streamlined button group: `Pause` / `Resume`, `Cancel`, and prominent `Instant Buy Now` button.

### 8.5 Activity History (`/history`)
* **Table Chassis:** Clean dark table with `border border-[#26262A] rounded-2xl overflow-hidden bg-[#1C1C1E]`.
* **Rows:** Subdued hover highlights (`hover:bg-[#242428]/50`), monospace timestamps, badge indicators for execution types, and direct Arbiscan / Robinhood Explorer transaction links.

---

## 9. Buttons & Form Controls

* **Primary CTA:**
  * Style: `bg-[#0FB983] hover:bg-[#0da070] text-black font-semibold px-6 py-3.5 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-[0.99] transition-all duration-150`
  * Disabled: `bg-[#242428] text-gray-500 border border-[#2C2C30] cursor-not-allowed shadow-none`
* **Secondary / Outline Button:**
  * Style: `bg-transparent hover:bg-[#242428] text-gray-200 border border-[#36363C] hover:border-gray-400 font-medium px-4 py-2 rounded-xl transition-all`
* **Icon Pill Button:**
  * Style: `p-2 rounded-lg bg-[#242428] border border-[#2C2C30] text-gray-400 hover:text-white hover:border-gray-400 transition-all`
* **Token Selector Trigger:**
  * Style: `flex items-center gap-2 bg-[#242428] hover:bg-[#2E2E34] border border-[#36363C] px-3 py-2 rounded-xl text-white font-semibold text-sm transition-all shadow-sm`

---

## 10. Modals, Dropdowns & Overlays

* **Modal Backdrop:** `fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4`.
* **Modal Card:** `w-full max-w-md bg-[#1C1C1E] border border-[#36363C] rounded-2xl p-6 shadow-2xl relative animate-in fade-in-0 zoom-in-95 duration-200`.
* **Token Search Input:** Recessed input `bg-[#141416] border border-[#26262A] rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:border-emerald-500 outline-none w-full`.
* **Token List Item:** `flex items-center justify-between p-3 rounded-xl hover:bg-[#242428] transition-all cursor-pointer`.

---

## 11. Transaction & Feedback States

* **Loading State:** Spinning dual-ring indicator with informative status caption (`Simulating on-chain transaction...`, `Awaiting wallet confirmation...`).
* **Success Banner:** Emerald tinted notification box with checkmark and transaction explorer link.
* **Error Banner:** Coral/Rose tinted notification box explaining user-friendly error details without crashing.

---

## 12. Implementation Mapping

| Target File | Scope of Visual Redesign |
| :--- | :--- |
| `frontend/tailwind.config.js` | Introduce Stargate-inspired color palette tokens (`#141414`, `#1C1C1E`, `#242428`, `#141416`, `#0FB983`, `#26262A`, `#36363C`), font definitions, and box shadows. |
| `frontend/app/globals.css` | Configure root dark styling, Geist font imports, custom thin scrollbar, and background starfield / glow overlay. |
| `frontend/app/layout.tsx` | Apply Stargate-grade body background, ambient star canvas, container constraints, and clean modern footer. |
| `frontend/components/Navbar.tsx` | Redesign top header with Stargate capsule tabs, glowing active states, and refined wallet button. |
| `frontend/components/TokenSelectModal.tsx` | New reusable modal component for asset selection inspired by Stargate's token picker with search and token badges. |
| `frontend/app/swap/page.tsx` | Redesign instant swap card: inset input panels, centered seam invert button, slippage drawer, and high-impact CTA. |
| `frontend/app/baskets/page.tsx` | Redesign recurring baskets dashboard: summary metrics header, active schedule cards, allocation split bars, and countdown timers. |
| `frontend/app/baskets/create/page.tsx` | Redesign 2-step wizard: allocation distribution sliders, token selectors, interval capsule picker, and execution approval modal. |
| `frontend/app/history/page.tsx` | Redesign activity table with Stargate table styles, monospace timestamps, status badges, and explorer links. |

---

## 13. Functional Invariant Rules

1. **Zero Business Logic Regressions:** All existing Wagmi hooks (`useAccount`, `useReadContract`, `useWriteContract`, `useWaitForTransactionReceipt`), contract ABIs, and transaction parameters remain intact.
2. **Preserve Network & Wallet Connectors:** RainbowKit configuration targeting Robinhood Chain Testnet (Chain ID `46630`), Arbitrum Sepolia (`421614`), and localhost remains fully operational.
3. **No Mock Data Replacement of Working APIs:** Live contract reads for user balances, schedule states, allowances, and DEX quotes remain active.
4. **Accessible Contrast:** Off-white text on dark charcoal surfaces maintains minimum WCAG AA contrast ratio of 4.5:1.
