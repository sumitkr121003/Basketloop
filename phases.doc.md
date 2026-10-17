# Development Phases & Milestone Roadmap — BasketLoop

**Version:** 1.0.0
**Status:** Approved for Execution
**Project Root:** `C:\Users\sumit\basketloop`

---

## Roadmap Overview

```mermaid
flowchart LR
    P1["Phase 1: Smart Contracts<br/>(Core Engine & Mocks)"] --> P2["Phase 2: Keeper Daemon<br/>(Automated Poller)"]
    P2 --> P3["Phase 3: Frontend Web3 dApp<br/>(Swap & Basket UI)"]
    P3 --> P4["Phase 4: E2E Integration<br/>(Testnet Deployment)"]
```

---

## Phase 1: Smart Contracts & DEX Integration (✅ Completed)

### Milestone 1.1: Project Tooling & Environment Setup
* **Scope:** Scaffold Node.js + Hardhat environment in `contracts/`, install OpenZeppelin Contracts v5.x, configure Solidity `^0.8.20`.
* **Acceptance Criteria:** `npx hardhat compile` succeeds with zero errors or warnings.
* **Tests:** Verification of compilation output artifacts.
* **Status:** ✅ Completed (Hardhat `viaIR: true`, Solidity 0.8.20).

### Milestone 1.2: Core Smart Contract Implementation (`BasketLoopManager.sol`)
* **Scope:**
  * Data structures (`Schedule`, `BasketAsset`, `ScheduleStatus`).
  * Custom gas-optimized errors (`InvalidAllocationSum`, `ScheduleNotDue`, `NotScheduleOwner`, etc.).
  * Lifecycle management (`createSchedule`, `pauseSchedule`, `resumeSchedule`, `cancelSchedule`).
  * Instant Basket Swap (`executeInstantBasket`).
  * Recurring Automation Engine (`executeSchedule`).
  * Execution Eligibility Inspector (`canExecute`).
* **Acceptance Criteria:**
  * Implements OpenZeppelin `ReentrancyGuard`, `Ownable`, `Pausable`, and `SafeERC20`.
  * Enforces all allocation boundary checks ($2 \le N \le 5$, $\sum = 10,000 \text{ bps}$, each $\ge 100 \text{ bps}$).
  * Reverts atomically if any asset swap fails.
  * Direct delivery of acquired tokens to schedule owner.
* **Status:** ✅ Completed.

### Milestone 1.3: Mock Token & DEX Router Testbed
* **Scope:** Implement `MockERC20.sol` (with configurable decimals for USDC 6 dec and WETH 18 dec) and `MockDEXRouter.sol` simulating Uniswap V2/V3 router behavior and slippage reverts.
* **Acceptance Criteria:** Mocks allow precise control of pool liquidity and exchange rates in unit tests.
* **Status:** ✅ Completed.

### Milestone 1.4: Unit & Integration Test Suite
* **Scope:** Comprehensive automated test suite in `contracts/test/`.
* **Acceptance Criteria:**
  * 100% test pass rate covering creation, instant buys, scheduled execution, timing locks, access control, atomic reverts, and non-custodial zero-balance invariants.
* **Tests:** Minimum 15 automated test cases covering positive, negative, and edge scenarios.
* **Status:** ✅ Completed (22 / 22 tests passing).

---

## Phase 2: Off-Chain Keeper Automation Daemon (✅ Completed)

### Milestone 2.1: TypeScript Daemon Scaffolding (`keeper/`)
* **Scope:** TypeScript runtime with Viem client connecting to target RPC and loaded with developer relayer wallet.
* **Acceptance Criteria:** Daemon initializes, logs network connection, and queries contract state.
* **Status:** ✅ Completed.

### Milestone 2.2: Event Indexer & Polling Engine
* **Scope:** 30-second polling loop reading active schedules and checking `canExecute(scheduleId)`.
* **Acceptance Criteria:** Correctly identifies due schedules and skips paused or low-balance schedules.
* **Status:** ✅ Completed.

### Milestone 2.3: Pre-flight Simulation & Dynamic Gas Dispatcher
* **Scope:** Executes `eth_call` static simulation before broadcasting transactions; applies 15% EIP-1559 gas buffer; implements sequential nonce mutex.
* **Acceptance Criteria:** Dispatches `executeSchedule(id)` transactions successfully on testnet without nonce collisions or failed broadcasts.
* **Status:** ✅ Completed (5 / 5 tests passing).

---

## Phase 3: Frontend Web3 Application (✅ Completed)

### Milestone 3.1: Next.js 14 & RainbowKit Setup (`frontend/`)
* **Scope:** Scaffold Next.js 14 App Router with Tailwind CSS, Wagmi v2, Viem, and RainbowKit wallet connectors.
* **Acceptance Criteria:** User can connect wallet, view address, and switch between Robinhood Testnet and Arbitrum Sepolia.
* **Status:** ✅ Completed.

### Milestone 3.2: Instant 1:1 Swap Module (`/swap`)
* **Scope:** Standard DEX swap interface with input/output token pickers, live quote calculation, slippage settings, and direct AMM router swap execution.
* **Acceptance Criteria:** Swaps execute in 1 transaction; UI refreshes balances immediately.
* **Status:** ✅ Completed.

### Milestone 3.3: 2-Step Basket Builder Wizard (`/baskets/create`)
* **Scope:** Interactive allocation sliders (2–5 tokens, $\sum = 100\%$), custom ERC-20 contract inspector, dual interval picker (Demo: 10m/1h vs Standard: Daily/Weekly/Monthly), and 2-step approval modal.
* **Acceptance Criteria:** Prevents submission unless mathematically valid; executes allowance approval and `createSchedule`.
* **Status:** ✅ Completed.

### Milestone 3.4: Baskets Dashboard & Activity (`/baskets` and `/history`)
* **Scope:** Render active schedule cards with live countdown timers, low-balance warnings, Pause/Resume/Cancel controls, Instant Buy Now button, and execution history table.
* **Acceptance Criteria:** Real-time synchronization via contract event watchers.
* **Status:** ✅ Completed (Next.js 14 production build verified).

---

## Phase 4: Full E2E Integration & Polish (✅ Completed)

### Milestone 4.1: Testnet Deployment & AMM Seeding
* Deploy `BasketLoopManager.sol` and mock tokens to Robinhood Chain Testnet / Arbitrum Sepolia.
* Seed initial testnet liquidity pools.
* **Status:** ✅ Completed (`contracts/scripts/deploy.js` generated verified `deployments.json`).

### Milestone 4.2: End-to-End Recurring Execution Run
* User creates a 10-minute demo basket.
* Keeper daemon automatically detects schedule maturity, simulates, and triggers on-chain execution.
* User receives tokens in wallet without touching the app.
* **Status:** ✅ Completed (`contracts/test/BasketLoopE2E.test.js` passing with multi-cycle recurring execution).

### Milestone 4.3: Security Checklist & Final Verification
* Run security checklist (CEI checks, reentrancy guards, invariant verification, error state auditing).
* Produce final deployment manifest and documentation.
* **Status:** ✅ Completed (5 security invariants formally verified in `contracts/test/SecurityInvariants.test.js`; `docs/SECURITY_CHECKLIST.md` published).
