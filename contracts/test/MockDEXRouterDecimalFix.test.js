/**
 * MockDEXRouter Decimal Normalisation Regression Tests
 *
 * Root-cause fix: MockDEXRouter previously passed the raw amountIn straight
 * through as amountOut, ignoring the decimal difference between tokenIn and
 * tokenOut.  For 60 USDC (6 dec) → WETH (18 dec) this produced:
 *   amountOut_raw = 60_000_000  →  0.00000000006 WETH  ✗
 *
 * After fix (decimal scalar applied first):
 *   amountOut_raw = 60_000_000 × 10^12 = 60e18  →  60 WETH  ✓
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MockDEXRouter — Decimal Normalisation Regression", function () {
  let dexRouter;
  let usdc, weth, arb, usdt;
  let user;

  beforeEach(async function () {
    [, user] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");

    // 6-decimal funding token (like real USDC)
    usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    usdt = await MockERC20.deploy("Tether USD", "USDT", 6);

    // 18-decimal output tokens
    weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
    arb  = await MockERC20.deploy("Arbitrum", "ARB", 18);

    await Promise.all([
      usdc.waitForDeployment(),
      usdt.waitForDeployment(),
      weth.waitForDeployment(),
      arb.waitForDeployment(),
    ]);

    const MockDEXRouter = await ethers.getContractFactory("MockDEXRouter");
    dexRouter = await MockDEXRouter.deploy();
    await dexRouter.waitForDeployment();

    // Seed the router with deep output-token liquidity
    await weth.mint(await dexRouter.getAddress(), ethers.parseUnits("10000", 18));
    await arb.mint(await dexRouter.getAddress(), ethers.parseUnits("500000", 18));

    // Fund user with USDC
    await usdc.mint(user.address, ethers.parseUnits("10000", 6));
  });

  // ---------------------------------------------------------------------------
  // 1. getAmountsOut — decimal normalisation
  // ---------------------------------------------------------------------------

  it("getAmountsOut: 60 USDC (6 dec) → WETH (18 dec) quotes 60 WETH at 1× rate", async function () {
    const amountIn = ethers.parseUnits("60", 6); // 60_000_000 raw USDC
    const path = [await usdc.getAddress(), await weth.getAddress()];

    const amounts = await dexRouter.getAmountsOut(amountIn, path);

    // Bug produced: 60_000_000 raw WETH = 0.00000000006 WETH
    // Fix produces: 60_000_000_000_000_000_000 raw WETH = 60 WETH
    expect(amounts[1]).to.equal(ethers.parseUnits("60", 18));
  });

  it("getAmountsOut: 40 USDC (6 dec) → ARB (18 dec) quotes 40 ARB at 1× rate", async function () {
    const amountIn = ethers.parseUnits("40", 6);
    const path = [await usdc.getAddress(), await arb.getAddress()];

    const amounts = await dexRouter.getAmountsOut(amountIn, path);

    expect(amounts[1]).to.equal(ethers.parseUnits("40", 18));
  });

  it("getAmountsOut: 18-dec → 18-dec swap unchanged (WETH → ARB, 1× rate)", async function () {
    const amountIn = ethers.parseUnits("5", 18);
    const path = [await weth.getAddress(), await arb.getAddress()];

    const amounts = await dexRouter.getAmountsOut(amountIn, path);

    expect(amounts[1]).to.equal(ethers.parseUnits("5", 18));
  });

  it("getAmountsOut: 6-dec → 6-dec swap unchanged (USDC → USDT, 1× rate)", async function () {
    const amountIn = ethers.parseUnits("100", 6);
    const path = [await usdc.getAddress(), await usdt.getAddress()];

    const amounts = await dexRouter.getAmountsOut(amountIn, path);

    expect(amounts[1]).to.equal(ethers.parseUnits("100", 6));
  });

  // ---------------------------------------------------------------------------
  // 2. swapExactTokensForTokens — actual token delivery
  // ---------------------------------------------------------------------------

  it("swapExactTokensForTokens: 60 USDC → WETH delivers 60 WETH to recipient", async function () {
    const amountIn  = ethers.parseUnits("60", 6);
    const amountOutMin = ethers.parseUnits("59", 18); // 1 WETH slippage tolerance
    const path     = [await usdc.getAddress(), await weth.getAddress()];
    const deadline = Math.floor(Date.now() / 1000) + 300;

    // User approves router
    await usdc.connect(user).approve(await dexRouter.getAddress(), amountIn);

    const balBefore = await weth.balanceOf(user.address);
    await dexRouter.connect(user).swapExactTokensForTokens(
      amountIn, amountOutMin, path, user.address, deadline
    );
    const balAfter = await weth.balanceOf(user.address);

    const received = balAfter - balBefore;
    expect(received).to.equal(ethers.parseUnits("60", 18));
  });

  it("swapExactTokensForTokens: 40 USDC → ARB delivers 40 ARB to recipient", async function () {
    const amountIn     = ethers.parseUnits("40", 6);
    const amountOutMin = ethers.parseUnits("39", 18);
    const path         = [await usdc.getAddress(), await arb.getAddress()];
    const deadline     = Math.floor(Date.now() / 1000) + 300;

    await usdc.connect(user).approve(await dexRouter.getAddress(), amountIn);

    const balBefore = await arb.balanceOf(user.address);
    await dexRouter.connect(user).swapExactTokensForTokens(
      amountIn, amountOutMin, path, user.address, deadline
    );
    const balAfter = await arb.balanceOf(user.address);

    expect(balAfter - balBefore).to.equal(ethers.parseUnits("40", 18));
  });

  it("swapExactTokensForTokens: slippage check fires when output falls below minimum", async function () {
    const amountIn = ethers.parseUnits("60", 6);
    // Demand more than 1× rate output → should revert
    const amountOutMin = ethers.parseUnits("61", 18);
    const path     = [await usdc.getAddress(), await weth.getAddress()];
    const deadline = Math.floor(Date.now() / 1000) + 300;

    await usdc.connect(user).approve(await dexRouter.getAddress(), amountIn);

    await expect(
      dexRouter.connect(user).swapExactTokensForTokens(
        amountIn, amountOutMin, path, user.address, deadline
      )
    ).to.be.revertedWithCustomError(dexRouter, "SlippageExceeded");
  });

  // ---------------------------------------------------------------------------
  // 3. Full BasketLoop basket path: 100 USDC → 60% WETH + 40% ARB
  // ---------------------------------------------------------------------------

  it("Basket path: 100 USDC split 60/40 delivers 60 WETH and 40 ARB", async function () {
    const totalIn  = ethers.parseUnits("100", 6); // 100_000_000 raw USDC
    const legWeth  = (totalIn * 6000n) / 10000n;  // 60_000_000 raw USDC
    const legArb   = (totalIn * 4000n) / 10000n;  // 40_000_000 raw USDC
    const deadline = Math.floor(Date.now() / 1000) + 300;

    await usdc.connect(user).approve(
      await dexRouter.getAddress(),
      totalIn
    );

    // WETH leg
    await dexRouter.connect(user).swapExactTokensForTokens(
      legWeth, 0n,
      [await usdc.getAddress(), await weth.getAddress()],
      user.address, deadline
    );

    // ARB leg
    await dexRouter.connect(user).swapExactTokensForTokens(
      legArb, 0n,
      [await usdc.getAddress(), await arb.getAddress()],
      user.address, deadline
    );

    const wethReceived = await weth.balanceOf(user.address);
    const arbReceived  = await arb.balanceOf(user.address);

    // Both should be human-readable amounts, not dust
    expect(wethReceived).to.equal(ethers.parseUnits("60", 18), "WETH output should be 60, not dust");
    expect(arbReceived).to.equal(ethers.parseUnits("40", 18),  "ARB output should be 40, not dust");
  });
});
