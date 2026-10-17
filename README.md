# BasketLoop

> **Non-Custodial Instant Token Swaps & Recurring Crypto Basket DCA on Robinhood Chain**

BasketLoop is a decentralized finance application designed for Robinhood Chain (Arbitrum Orbit L2) that provides two core capabilities:
1. **Instant Token Swaps (DEX):** Trade directly between tokens in a single fast, gas-efficient transaction.
2. **Basket DCA (Recurring Portfolios):** Automate recurring multi-asset crypto purchases (up to 5 assets per basket) with custom allocations while maintaining 100% self-custody with zero idle contract deposits.

---

## 📁 Repository Structure

```text
basketloop/
├── PRD.md                  # Comprehensive Product Requirements Document (V1.0)
├── ARCHITECTURE.md         # Technical Architecture & Smart Contract Design
├── README.md               # Project overview and directory guide
├── docs/                   # Architecture, threat model, and technical specifications
├── contracts/              # Solidity smart contracts (BasketLoopManager, interfaces, mocks)
├── keeper/                 # Automated background execution bot daemon (TypeScript/Viem)
└── frontend/               # Next.js 14 Web3 application (Tailwind, Wagmi, RainbowKit)
```

---

## 📄 Core Documentation
* **Product Requirements Document:** [PRD.md](./PRD.md)
  * Complete 26-section specification covering Instant Swaps, Basket DCA, user personas, functional requirements, acceptance criteria, security invariants, and 4-week MVP milestones.
* **Technical Architecture Document:** [ARCHITECTURE.md](./ARCHITECTURE.md)
  * System topology, smart contract interfaces (`BasketLoopManager.sol`), keeper daemon mechanics, decimal normalization, and security threat model.

---

## 🚀 Key Specifications at a Glance
* **Target Network:** Robinhood Chain Testnet (Arbitrum Orbit L2) / Fallback: Arbitrum Sepolia
* **Gas Token:** Testnet ETH (Recurring execution transactions subsidized by developer keeper bot)
* **Instant Swaps:** Direct AMM swaps (`swapExactTokensForTokens` / `swapExactETHForTokens`)
* **Instant Basket Buy:** 1-click batch purchase of an entire multi-token basket on demand
* **Recurring Basket DCA:** Non-custodial automated pulls via keeper bot and `BasketLoopManager.sol`
* **Funding Currencies:** USDC, USDT, WETH (Fixed-token recurring budget per cycle)
* **Basket Constraints:** 2 to 5 assets per basket; allocations sum to 100% ($\ge 1\%$ per asset)
* **Safety Invariant:** 100% atomic revert if any token swap fails or exceeds slippage limits
* **Supported Intervals:**
  * Demo: `Every 10 Minutes`, `Every 1 Hour`
  * Production: `Daily`, `Weekly`, `Monthly`
