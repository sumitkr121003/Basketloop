# Engineering Rules & Guidelines — BasketLoop

**Version:** 1.0.0
**Status:** Active Source of Truth
**Target Environment:** EVM (Robinhood Chain Testnet / Arbitrum Sepolia)

---

## 1. Core Engineering Principles

1. **Non-Custodial First:** The smart contract layer must never hold idle user funds. At the conclusion of any transaction, the protocol's balance of all ERC-20 tokens must strictly be zero.
2. **Defensive Validation (Fail Fast):** All inputs—both on-chain and off-chain—must be validated against domain boundaries before modifying state or triggering external interactions.
3. **Atomic Safety:** Multi-token operations must be all-or-nothing. If any single asset swap fails, slips, or reverts, the entire batch must revert to prevent portfolio skew.
4. **Gas Efficiency on L2:** Utilize custom Solidity errors instead of revert strings; pack storage variables where appropriate; minimize unnecessary state writes.
5. **Simplicity Over Abstraction:** Keep smart contract logic monolithic for the MVP. Avoid complex multi-contract delegate calls or upgradeable proxies unless explicitly mandated.

---

## 2. Smart Contract Development Rules (`contracts/`)

### 2.1 Solidity Standards
* **Solidity Compiler:** `^0.8.20`.
* **Dependencies:** Use vetted OpenZeppelin Contracts v5.x (`SafeERC20`, `ReentrancyGuard`, `Ownable`, `Pausable`).
* **Error Handling:** Strictly use `error CustomError()` with parameters instead of `require(condition, "String")`.
* **State Updates:** Strictly follow the **Checks-Effects-Interactions (CEI)** pattern to defend against reentrancy attacks.
* **Math & Decimals:** Never assume 18 decimals for ERC-20 tokens. Handle tokens with 6 decimals (e.g., USDC, USDT) and 18 decimals (e.g., WETH, ARB) dynamically via Basis Points ($10,000 \text{ bps} = 100.00\%$).

### 2.2 Security Invariants
* **Allowance Bounds:** The contract can never pull more than the configured `amountInPerCycle` per recurring period.
* **Interval Lock:** The contract must verify `block.timestamp >= lastExecutedAt + intervalSeconds` before executing any recurring schedule.
* **Direct Token Delivery:** All acquired assets from DEX swaps must be directed straight to `schedule.owner` (or `msg.sender` for instant buys), never remaining in the contract.

---

## 3. Off-Chain Keeper Daemon Rules (`keeper/`)

1. **Simulation Before Broadcast:** The keeper must execute a static call (`eth_call` pre-flight simulation) for every due schedule before broadcasting an on-chain transaction.
2. **Dynamic Gas Buffers:** In EIP-1559 environments, calculate `maxFeePerGas` with a 15% buffer over the current base fee to avoid dropped transactions during block spikes.
3. **Nonce Mutex:** Ensure sequential nonce dispatching using an in-memory lock to prevent conflicting transactions from the keeper address.
4. **Graceful Error Logging:** Do not crash the keeper process on RPC drops or reverting schedules. Log structured JSON errors with exponential backoff retries.

---

## 4. Frontend Application Rules (`frontend/`)

1. **No Speculative Balances:** All wallet balances and allowances must be fetched directly from the blockchain via Wagmi/Viem multicall.
2. **Immediate Error Recovery:** Provide actionable error messages in user-friendly language (e.g., *"Insufficient USDC Balance in Wallet"* instead of *"ERC20: transfer amount exceeds balance"*).
3. **Reactivity:** Listen for smart contract events (`ScheduleCreated`, `ScheduleExecuted`, `SchedulePaused`, `ScheduleCancelled`) to trigger real-time UI revalidation without requiring manual page refreshes.
4. **Privacy:** Zero collection of IP addresses, cookies, or user telemetries.

---

## 5. Testing & Quality Assurance Standards

1. **Test Coverage:** Smart contracts must maintain $\ge 95\%$ line and branch coverage.
2. **Negative Testing:** Every validation rule must have a corresponding test case verifying the exact custom error returned.
3. **Boundary Testing:** Test edge conditions (allocations summing to 9999 bps, 10001 bps, minimum 100 bps, maximum 5 assets, minimum 2 assets).
4. **Deterministic Environments:** Unit tests must run locally against a mock AMM router and mock ERC-20 tokens before deploying to public testnets.
