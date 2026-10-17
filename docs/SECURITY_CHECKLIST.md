# Security Checklist & Invariant Verification — BasketLoop

**Version:** 1.0.0
**Status:** Verified & Passed
**Last Audited:** October 16, 2026
**Auditor:** Protocol Engineering & Security

---

## 1. Executive Summary

This document records the formal security verification and invariant audit for **BasketLoop** on EVM / Orbit L2. All automated tests in `contracts/test/SecurityInvariants.test.js` and `contracts/test/BasketLoopE2E.test.js` pass with 100% compliance.

---

## 2. Invariant Verification Matrix

| Invariant | Security Objective | Verification Mechanism | Status |
| :--- | :--- | :--- | :--- |
| **Invariant 1: Pull Limit** | Contract must never transfer more than `amountInPerCycle` per cycle, even if user granted an infinite ERC-20 allowance. | Tested with `ethers.MaxUint256` allowance; asserted exact balance delta equals `amountInPerCycle`. | ✅ **PASSED** |
| **Invariant 2: Interval Lock** | Disallows executing a schedule before `lastExecutedAt + intervalSeconds` has matured, preventing replay and drain attacks. | Fast-forward tested; immediate subsequent execution reverts with `ScheduleNotDue(id, nextDue)`. | ✅ **PASSED** |
| **Invariant 3: Zero Idle Custody** | Protocol must hold zero user funds between executions. At transaction completion, contract token balances are strictly zero. | Token balances of `BasketLoopManager` for all funding and output tokens asserted to be `0` before and after calls. | ✅ **PASSED** |
| **Invariant 4: Atomic Revert** | Multi-token operations are all-or-nothing. If any single DEX swap fails or slips, the entire batch reverts; zero user funds are deducted. | Simulated DEX router failure with `shouldFailSwaps = true`; user balance remained 100% untouched. | ✅ **PASSED** |
| **Invariant 5: Access Control** | Only the schedule owner can pause, resume, or cancel a schedule. Only authorized keeper or contract owner can trigger `executeSchedule`. | Attacker transactions attempted; reverted with `NotScheduleOwner` and `UnauthorizedKeeper`. | ✅ **PASSED** |

---

## 3. Code Security Best Practices

### 3.1 Checks-Effects-Interactions (CEI) Compliance
* State changes (such as `schedule.lastExecutedAt = block.timestamp` and `schedule.status = Paused`) occur strictly before external token transfers or external DEX router invocations.

### 3.2 Reentrancy Protection
* All external state-changing entrypoints (`executeSchedule`, `executeInstantBasket`) inherit OpenZeppelin's `ReentrancyGuard` and apply the `nonReentrant` modifier.

### 3.3 Safe Token Transfers
* All ERC-20 transfers, `transferFrom` calls, and approvals use OpenZeppelin `SafeERC20` (`safeTransfer`, `safeTransferFrom`, `forceApprove`) to ensure compatibility with non-standard tokens (such as USDT lacking return values).

### 3.4 Allocation Domain Boundaries
* Inputs validated upon schedule creation:
  * Minimum 2 assets, maximum 5 assets.
  * Sum of allocations strictly equals `10000` basis points ($100.00\%$).
  * Minimum allocation per asset is `100` basis points ($1.00\%$).
  * No duplicate token addresses.
  * Target tokens cannot equal the funding token.

---

## 4. Test Matrix Summary

* **Unit & Lifecycle Tests:** 22 passing tests (`contracts/test/BasketLoopManager.test.js`)
* **Security Invariant Tests:** 5 passing tests (`contracts/test/SecurityInvariants.test.js`)
* **Full E2E Recurring Tests:** 1 passing multi-cycle simulation (`contracts/test/BasketLoopE2E.test.js`)
* **Total Contract Tests:** 28 passing tests (0 failures).
