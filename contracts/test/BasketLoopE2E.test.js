const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("BasketLoop Phase 4 — Full E2E Recurring Lifecycle Test", function () {
  let deployer, keeper, user;
  let usdc, weth, arb, link;
  let dexRouter, basketManager;

  const TEN_MINUTES = 600;
  const BUDGET = ethers.parseUnits("100", 6); // 100 USDC per cycle

  beforeEach(async function () {
    [deployer, keeper, user] = await ethers.getSigners();

    // 1. Deploy Tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
    arb = await MockERC20.deploy("Arbitrum", "ARB", 18);
    link = await MockERC20.deploy("Chainlink", "LINK", 18);

    await usdc.waitForDeployment();
    await weth.waitForDeployment();
    await arb.waitForDeployment();
    await link.waitForDeployment();

    // 2. Deploy Router
    const MockDEXRouter = await ethers.getContractFactory("MockDEXRouter");
    dexRouter = await MockDEXRouter.deploy();
    await dexRouter.waitForDeployment();

    // 3. Seed DEX Liquidity
    await weth.mint(await dexRouter.getAddress(), ethers.parseUnits("10000", 18));
    await arb.mint(await dexRouter.getAddress(), ethers.parseUnits("500000", 18));
    await link.mint(await dexRouter.getAddress(), ethers.parseUnits("100000", 18));
    await usdc.mint(await dexRouter.getAddress(), ethers.parseUnits("1000000", 6));

    // 4. Deploy Protocol
    const BasketLoopManager = await ethers.getContractFactory("BasketLoopManager");
    basketManager = await BasketLoopManager.deploy(
      await dexRouter.getAddress(),
      keeper.address,
      deployer.address
    );
    await basketManager.waitForDeployment();

    // 5. Fund User with 1,000 USDC
    await usdc.mint(user.address, ethers.parseUnits("1000", 6));
  });

  it("should complete a multi-cycle recurring DCA journey with keeper automation", async function () {
    const assets = [
      { token: await weth.getAddress(), allocationBps: 5000 }, // 50%
      { token: await arb.getAddress(), allocationBps: 3000 },  // 30%
      { token: await link.getAddress(), allocationBps: 2000 }, // 20%
    ];

    // --- STEP 1: User Creates 10-Minute Demo Basket ---
    const txCreate = await basketManager.connect(user).createSchedule(
      "DeFi Trio Demo",
      await usdc.getAddress(),
      BUDGET,
      TEN_MINUTES,
      100, // 1% slippage
      assets
    );
    await expect(txCreate).to.emit(basketManager, "ScheduleCreated");

    // Immediately after creation, schedule should NOT be due
    let [executable, reason] = await basketManager.canExecute(1n);
    expect(executable).to.be.false;
    expect(reason).to.equal("Schedule is not due yet");

    // --- STEP 2: Time Advances (Cycle 1 Due) & User Grants Allowance ---
    await time.increase(TEN_MINUTES + 1);

    // Before approval, canExecute reports insufficient allowance
    [executable, reason] = await basketManager.canExecute(1n);
    expect(executable).to.be.false;
    expect(reason).to.equal("Insufficient contract allowance");

    // User approves 500 USDC (5 cycles)
    await usdc.connect(user).approve(await basketManager.getAddress(), ethers.parseUnits("500", 6));

    // Now schedule is fully executable
    [executable, reason] = await basketManager.canExecute(1n);
    expect(executable).to.be.true;
    expect(reason).to.equal("");

    // --- STEP 3: Automated Keeper Execution of Cycle 1 ---
    const userUsdcBefore1 = await usdc.balanceOf(user.address);
    const userWethBefore1 = await weth.balanceOf(user.address);
    const userArbBefore1 = await arb.balanceOf(user.address);
    const userLinkBefore1 = await link.balanceOf(user.address);

    const txExec1 = await basketManager.connect(keeper).executeSchedule(1n);
    await expect(txExec1).to.emit(basketManager, "ScheduleExecuted");

    // Assert User Balance Deltas
    expect(userUsdcBefore1 - (await usdc.balanceOf(user.address))).to.equal(BUDGET);
    expect(await weth.balanceOf(user.address)).to.be.gt(userWethBefore1);
    expect(await arb.balanceOf(user.address)).to.be.gt(userArbBefore1);
    expect(await link.balanceOf(user.address)).to.be.gt(userLinkBefore1);

    // Assert Non-Custodial Zero Idle Balance Invariant
    expect(await usdc.balanceOf(await basketManager.getAddress())).to.equal(0n);
    expect(await weth.balanceOf(await basketManager.getAddress())).to.equal(0n);
    expect(await arb.balanceOf(await basketManager.getAddress())).to.equal(0n);
    expect(await link.balanceOf(await basketManager.getAddress())).to.equal(0n);

    // --- STEP 4: Automated Keeper Execution of Cycle 2 ---
    // Fast forward another 10 minutes
    await time.increase(TEN_MINUTES + 1);

    [executable] = await basketManager.canExecute(1n);
    expect(executable).to.be.true;

    const userWethBefore2 = await weth.balanceOf(user.address);
    await basketManager.connect(keeper).executeSchedule(1n);
    expect(await weth.balanceOf(user.address)).to.be.gt(userWethBefore2);

    // --- STEP 5: User Pauses Automation ---
    await basketManager.connect(user).pauseSchedule(1n);

    await time.increase(TEN_MINUTES + 1);
    [executable, reason] = await basketManager.canExecute(1n);
    expect(executable).to.be.false;
    expect(reason).to.equal("Schedule is not active");

    // Keeper execution attempt must revert
    await expect(
      basketManager.connect(keeper).executeSchedule(1n)
    ).to.be.revertedWithCustomError(basketManager, "ScheduleNotActive");

    // --- STEP 6: User Resumes Schedule & Keeper Executes Cycle 3 ---
    await basketManager.connect(user).resumeSchedule(1n);
    [executable] = await basketManager.canExecute(1n);
    expect(executable).to.be.true;

    await expect(basketManager.connect(keeper).executeSchedule(1n)).to.emit(
      basketManager,
      "ScheduleExecuted"
    );

    // --- STEP 7: One-Click Instant Basket Purchase Coexistence ---
    const instantBudget = ethers.parseUnits("200", 6);
    await usdc.connect(user).approve(await basketManager.getAddress(), ethers.parseUnits("1000", 6));

    const userWethBeforeInstant = await weth.balanceOf(user.address);
    const txInstant = await basketManager.connect(user).executeInstantBasket(
      await usdc.getAddress(),
      instantBudget,
      100,
      assets
    );
    await expect(txInstant).to.emit(basketManager, "InstantBasketExecuted");
    expect(await weth.balanceOf(user.address)).to.be.gt(userWethBeforeInstant);

    // Zero idle balance maintained
    expect(await usdc.balanceOf(await basketManager.getAddress())).to.equal(0n);

    // --- STEP 8: User Cancels Schedule Permanently ---
    await basketManager.connect(user).cancelSchedule(1n);
    const { schedule } = await basketManager.getSchedule(1n);
    expect(schedule.status).to.equal(2); // Cancelled

    // Verification complete
  });
});
