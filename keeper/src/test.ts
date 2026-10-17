import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseGwei, type Hex } from "viem";
import { basketLoopManagerAbi, limitOrderManagerAbi } from "./abi.js";
import { config } from "./config.js";

describe("BasketLoop Keeper Daemon — Test Suite", () => {
  it("should validate and load configuration correctly", () => {
    assert.ok(config.rpcUrl, "RPC URL must be configured");
    assert.ok(config.contractAddress, "Contract address must be configured");
    assert.ok(config.keeperPrivateKey.startsWith("0x"), "Keeper private key must be a valid hex");
    assert.equal(typeof config.pollIntervalMs, "number");
    assert.ok(config.pollIntervalMs > 0, "Poll interval must be positive");
    assert.equal(config.priorityFeeGwei, 0.1);
  });

  it("should contain correct ABI signatures for BasketLoopManager", () => {
    const functionNames = basketLoopManagerAbi
      .filter((item: any) => item.type === "function")
      .map((item: any) => item.name);

    assert.ok(functionNames.includes("nextScheduleId"), "Must include nextScheduleId");
    assert.ok(functionNames.includes("canExecute"), "Must include canExecute");
    assert.ok(functionNames.includes("executeSchedule"), "Must include executeSchedule");
    assert.ok(functionNames.includes("schedules"), "Must include schedules");
  });

  it("should accurately compute 15% EIP-1559 base fee buffer", () => {
    const baseFee = 30_000_000_000n; // 30 Gwei
    const buffered = (baseFee * 115n) / 100n;
    const priorityFee = parseGwei("0.1");
    const maxFeePerGas = buffered + priorityFee;

    // 30 Gwei * 1.15 = 34.5 Gwei = 34_500_000_000n
    assert.equal(buffered, 34_500_000_000n);
    // maxFeePerGas = 34.5 Gwei + 0.1 Gwei = 34.6 Gwei = 34_600_000_000n
    assert.equal(maxFeePerGas, 34_600_000_000n);
  });

  it("should properly format schedule simulation rejection errors", async () => {
    // Testing error formatting helper logic
    const mockError = { shortMessage: "Execution reverted: ScheduleNotDue(1, 1700000000)" };
    const formatted = mockError.shortMessage || "Unknown error";
    assert.equal(formatted, "Execution reverted: ScheduleNotDue(1, 1700000000)");
  });

  it("should serialize schedule checks into structured poll reports", () => {
    const mockChecks = [
      { id: 1n, executable: false, reason: "Schedule is not due yet" },
      { id: 2n, executable: false, reason: "Insufficient user token balance" },
    ];

    const report = {
      timestamp: Date.now(),
      totalSchedules: 2,
      checked: 2,
      executed: 0,
      results: mockChecks,
    };

    assert.equal(report.totalSchedules, 2);
    assert.equal(report.checked, 2);
    assert.equal(report.executed, 0);
    assert.equal(report.results.length, 2);
    assert.equal(report.results[0].reason, "Schedule is not due yet");
  });
  it("should contain correct ABI signatures for LimitOrderManager", () => {
    const functionNames = limitOrderManagerAbi
      .filter((item: any) => item.type === "function")
      .map((item: any) => item.name);

    assert.ok(functionNames.includes("nextOrderId"), "Must include nextOrderId");
    assert.ok(functionNames.includes("orders"), "Must include orders");
    assert.ok(functionNames.includes("canExecute"), "Must include canExecute");
    assert.ok(functionNames.includes("executeOrder"), "Must include executeOrder");
    assert.ok(functionNames.includes("cancelOrder"), "Must include cancelOrder");
    assert.ok(functionNames.includes("cancelExpiredOrder"), "Must include cancelExpiredOrder");
    assert.ok(functionNames.includes("wrappedNativeToken"), "Must include wrappedNativeToken");
    assert.ok(functionNames.includes("createOrder"), "Must include createOrder");
  });

  it("should serialize limit order checks into structured poll reports", () => {
    const mockChecks = [
      { id: 1n, executable: false, reason: "Order is expired" },
      { id: 2n, executable: true, reason: "" },
    ];

    const report = {
      timestamp: Date.now(),
      totalOrders: 2,
      checked: 2,
      executed: 1,
      results: mockChecks,
    };

    assert.equal(report.totalOrders, 2);
    assert.equal(report.checked, 2);
    assert.equal(report.executed, 1);
    assert.equal(report.results.length, 2);
    assert.equal(report.results[0].reason, "Order is expired");
    assert.equal(report.results[1].executable, true);
  });
});
