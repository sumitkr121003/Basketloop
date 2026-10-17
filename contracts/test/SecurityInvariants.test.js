const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("BasketLoop Phase 4 — Security Invariant Verification", function () {
  let deployer, keeper, user, attacker;
  let usdc, weth, arb;
  let dexRouter, basketManager;

  const INTERVAL = 600; // 10 minutes
  const BUDGET = ethers.parseUnits("100", 6); // 100 USDC

  beforeEach(async function () {
    [deployer, keeper, user, attacker] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
    arb = await MockERC20.deploy("Arbitrum", "ARB", 18);

    await usdc.waitForDeployment();
    await weth.waitForDeployment();
    await arb.waitForDeployment();

    const MockDEXRouter = await ethers.getContractFactory("MockDEXRouter");
    dexRouter = await MockDEXRouter.deploy();
    await dexRouter.waitForDeployment();

    // Seed Router liquidity
    await weth.mint(await dexRouter.getAddress(), ethers.parseUnits("10000", 18));
    await arb.mint(await dexRouter.getAddress(), ethers.parseUnits("500000", 18));
    await usdc.mint(await dexRouter.getAddress(), ethers.parseUnits("1000000", 6));

    const BasketLoopManager = await ethers.getContractFactory("BasketLoopManager");
    basketManager = await BasketLoopManager.deploy(
      await dexRouter.getAddress(),
      keeper.address,
      deployer.address
    );
    await basketManager.waitForDeployment();

    // User has 5,000 USDC and gives infinite allowance
    await usdc.mint(user.address, ethers.parseUnits("5000", 6));
    await usdc.connect(user).approve(await basketManager.getAddress(), ethers.MaxUint256);

    const assets = [
      { token: await weth.getAddress(), allocationBps: 6000 },
      { token: await arb.getAddress(), allocationBps: 4000 },
    ];
    await basketManager.connect(user).createSchedule("Invariant Test Basket", await usdc.getAddress(), BUDGET, INTERVAL, 100, assets);
  });

  it("Invariant 1 (Pull Limit): Contract must NEVER pull more than amountInPerCycle even with infinite allowance", async function () {
    await time.increase(INTERVAL + 1);

    const userBalanceBefore = await usdc.balanceOf(user.address);
    await basketManager.connect(keeper).executeSchedule(1n);
    const userBalanceAfter = await usdc.balanceOf(user.address);

    // Exactly 100 USDC pulled, not a single wei more
    expect(userBalanceBefore - userBalanceAfter).to.equal(BUDGET);
  });

  it("Invariant 2 (Interval Lock): Cannot execute before interval elapses (prevents replay/drain attacks)", async function () {
    await time.increase(INTERVAL + 1);
    await basketManager.connect(keeper).executeSchedule(1n);

    // Immediate second execution must revert with ScheduleNotDue
    await expect(
      basketManager.connect(keeper).executeSchedule(1n)
    ).to.be.revertedWithCustomError(basketManager, "ScheduleNotDue");
  });

  it("Invariant 3 (Zero Idle Custody): Contract token balances must strictly equal 0 after execution", async function () {
    await time.increase(INTERVAL + 1);
    await basketManager.connect(keeper).executeSchedule(1n);

    expect(await usdc.balanceOf(await basketManager.getAddress())).to.equal(0n);
    expect(await weth.balanceOf(await basketManager.getAddress())).to.equal(0n);
    expect(await arb.balanceOf(await basketManager.getAddress())).to.equal(0n);
  });

  it("Invariant 4 (Atomic Revert): If DEX router fails, transaction reverts and 0 user funds are pulled", async function () {
    await time.increase(INTERVAL + 1);
    await dexRouter.setShouldFailSwaps(true);

    const userBalanceBefore = await usdc.balanceOf(user.address);

    await expect(
      basketManager.connect(keeper).executeSchedule(1n)
    ).to.be.reverted;

    expect(await usdc.balanceOf(user.address)).to.equal(userBalanceBefore);
    expect(await usdc.balanceOf(await basketManager.getAddress())).to.equal(0n);
  });

  it("Invariant 5 (Access Control): Unauthorized entities cannot modify schedules or execute without authorization", async function () {
    await time.increase(INTERVAL + 1);

    // Attacker cannot execute
    await expect(
      basketManager.connect(attacker).executeSchedule(1n)
    ).to.be.revertedWithCustomError(basketManager, "UnauthorizedKeeper")
      .withArgs(attacker.address);

    // Attacker cannot pause
    await expect(
      basketManager.connect(attacker).pauseSchedule(1n)
    ).to.be.revertedWithCustomError(basketManager, "NotScheduleOwner")
      .withArgs(1n, attacker.address);

    // Attacker cannot cancel
    await expect(
      basketManager.connect(attacker).cancelSchedule(1n)
    ).to.be.revertedWithCustomError(basketManager, "NotScheduleOwner")
      .withArgs(1n, attacker.address);
  });
});
