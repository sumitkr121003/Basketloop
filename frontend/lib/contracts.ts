import { parseAbi } from "viem";

export const DEFAULT_CONTRACTS = {
  basketLoopManager: "0xdb6E99b366a34b12c4F538F88aB819a8b0793C54" as `0x${string}`,
  dexRouter: "0x9edFD679838685527dba927B30Ac5E705C722D47" as `0x${string}`,
  limitOrderManager: ((process.env.NEXT_PUBLIC_LIMIT_ORDER_MANAGER_ADDRESS as string) ||
    "0x9894dD389A88F8D49df99432051e5ef966dCc04E") as `0x${string}`,
};

export const basketLoopManagerAbi = parseAbi([
  "function nextScheduleId() view returns (uint256)",
  "function schedules(uint256) view returns (uint256 id, address owner, address tokenIn, uint256 amountInPerCycle, uint32 intervalSeconds, uint64 lastExecutedAt, uint16 slippageBps, uint8 status, string name)",
  "function getSchedule(uint256 scheduleId) view returns ((uint256 id, address owner, address tokenIn, uint256 amountInPerCycle, uint32 intervalSeconds, uint64 lastExecutedAt, uint16 slippageBps, uint8 status, string name) schedule, (address token, uint16 allocationBps)[] assets)",
  "function getUserSchedules(address user) view returns (uint256[])",
  "function canExecute(uint256 scheduleId) view returns (bool executable, string memory reason)",
  "function createSchedule(string name, address tokenIn, uint256 amountInPerCycle, uint32 intervalSeconds, uint16 slippageBps, (address token, uint16 allocationBps)[] assets) returns (uint256)",
  "function executeInstantBasket(address tokenIn, uint256 amountIn, uint16 slippageBps, (address token, uint16 allocationBps)[] assets)",
  "function pauseSchedule(uint256 scheduleId)",
  "function resumeSchedule(uint256 scheduleId)",
  "function cancelSchedule(uint256 scheduleId)",
  "event ScheduleCreated(uint256 indexed scheduleId, address indexed owner, address indexed tokenIn, uint256 amountInPerCycle, uint32 intervalSeconds, uint16 slippageBps, string name)",
  "event ScheduleExecuted(uint256 indexed scheduleId, address indexed owner, uint256 amountInProcessed, uint256 timestamp)",
  "event InstantBasketExecuted(address indexed user, address indexed tokenIn, uint256 amountIn, uint256 timestamp)",
  "event SchedulePaused(uint256 indexed scheduleId, address indexed owner)",
  "event ScheduleResumed(uint256 indexed scheduleId, address indexed owner)",
  "event ScheduleCancelled(uint256 indexed scheduleId, address indexed owner)",
]);

export const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
]);

export const dexRouterAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])",
  "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[])",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])",
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
  "event OrderCreated(uint256 indexed orderId, address indexed maker, address indexed tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint64 expiresAt)",
  "event OrderExecuted(uint256 indexed orderId, address indexed executor, address indexed maker, uint256 amountIn, uint256 amountOut)",
  "event OrderCancelled(uint256 indexed orderId, address indexed maker)",
  "event OrderExpired(uint256 indexed orderId, address indexed maker)",
]);
