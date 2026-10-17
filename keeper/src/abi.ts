import { parseAbi } from "viem";

export const basketLoopManagerAbi = parseAbi([
  "function nextScheduleId() view returns (uint256)",
  "function schedules(uint256) view returns (uint256 id, address owner, address tokenIn, uint256 amountInPerCycle, uint32 intervalSeconds, uint64 lastExecutedAt, uint16 slippageBps, uint8 status, string name)",
  "function canExecute(uint256 scheduleId) view returns (bool executable, string memory reason)",
  "function executeSchedule(uint256 scheduleId) external",
  "function keeperAddress() view returns (address)",
  "function owner() view returns (address)",
  "event ScheduleCreated(uint256 indexed scheduleId, address indexed owner, address indexed tokenIn, uint256 amountInPerCycle, uint32 intervalSeconds, uint16 slippageBps, string name)",
  "event ScheduleExecuted(uint256 indexed scheduleId, address indexed owner, uint256 amountInProcessed, uint256 timestamp)",
  "event SchedulePaused(uint256 indexed scheduleId, address indexed owner)",
  "event ScheduleResumed(uint256 indexed scheduleId, address indexed owner)",
  "event ScheduleCancelled(uint256 indexed scheduleId, address indexed owner)",
]);

export const limitOrderManagerAbi = parseAbi([
  "function nextOrderId() view returns (uint256)",
  "function dexRouter() view returns (address)",
  "function wrappedNativeToken() view returns (address)",
  "function orders(uint256) view returns (uint256 id, address maker, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint64 createdAt, uint64 expiresAt, uint8 status)",
  "function getOrder(uint256 orderId) view returns ((uint256 id, address maker, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint64 createdAt, uint64 expiresAt, uint8 status))",
  "function getUserOrders(address user) view returns (uint256[])",
  "function getAllOrderIds() view returns (uint256[])",
  "function canExecute(uint256 orderId) view returns (bool executable, string memory reason)",
  "function createOrder(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint64 expiresAt) payable returns (uint256)",
  "function executeOrder(uint256 orderId) returns (uint256 amountOut)",
  "function cancelOrder(uint256 orderId)",
  "function cancelExpiredOrder(uint256 orderId)",
  "function owner() view returns (address)",
  "event OrderCreated(uint256 indexed orderId, address indexed maker, address indexed tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint64 expiresAt)",
  "event OrderExecuted(uint256 indexed orderId, address indexed executor, address indexed maker, uint256 amountIn, uint256 amountOut)",
  "event OrderCancelled(uint256 indexed orderId, address indexed maker)",
  "event OrderExpired(uint256 indexed orderId, address indexed maker)",
]);
