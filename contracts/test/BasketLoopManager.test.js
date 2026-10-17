const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("BasketLoopManager — Phase 1 Test Suite", function () {
  let owner, keeper, user, stranger;
  let basketManager;
  let dexRouter;
  let usdc, weth, arb, link;

  // Constants
  const TOTAL_BPS = 10000;
  const ONE_WEEK = 7 * 24 * 60 * 60;
  const TEN_MINUTES = 600;

  beforeEach(async function () {
    [owner, keeper, user, stranger] = await ethers.getSigners();

    // 1. Deploy Mock Tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
    arb = await MockERC20.deploy("Arbitrum", "ARB", 18);
    link = await MockERC20.deploy("Chainlink", "LINK", 18);

    await usdc.waitForDeployment();
    await weth.waitForDeployment();
    await arb.waitForDeployment();
    await link.waitForDeployment();

    // 2. Deploy Mock DEX Router
    const MockDEXRouter = await ethers.getContractFactory("MockDEXRouter");
    dexRouter = await MockDEXRouter.deploy();
    await dexRouter.waitForDeployment();

    // Mint liquidity to Router for swaps
    await weth.mint(await dexRouter.getAddress(), ethers.parseUnits("10000", 18));
    await arb.mint(await dexRouter.getAddress(), ethers.parseUnits("500000", 18));
    await link.mint(await dexRouter.getAddress(), ethers.parseUnits("100000", 18));

    // 3. Deploy BasketLoopManager
    const BasketLoopManager = await ethers.getContractFactory("BasketLoopManager");
    basketManager = await BasketLoopManager.deploy(
      await dexRouter.getAddress(),
      keeper.address,
      owner.address
    );
    await basketManager.waitForDeployment();

    // Fund user with USDC
    await usdc.mint(user.address, ethers.parseUnits("5000", 6));
  });

  describe("1. Deployment & Initialization", function () {
    it("should initialize with correct parameters", async function () {
      expect(await basketManager.dexRouter()).to.equal(await dexRouter.getAddress());
      expect(await basketManager.keeperAddress()).to.equal(keeper.address);
      expect(await basketManager.owner()).to.equal(owner.address);
      expect(await basketManager.nextScheduleId()).to.equal(1n);
    });

    it("should revert if initialized with zero address for router or owner", async function () {
      const BasketLoopManager = await ethers.getContractFactory("BasketLoopManager");
      await expect(
        BasketLoopManager.deploy(ethers.ZeroAddress, keeper.address, owner.address)
      ).to.be.revertedWithCustomError(basketManager, "InvalidAddress");

      await expect(
        BasketLoopManager.deploy(await dexRouter.getAddress(), keeper.address, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(basketManager, "OwnableInvalidOwner")
        .withArgs(ethers.ZeroAddress);
    });
  });

  describe("2. Basket Schedule Creation & Boundary Validations", function () {
    it("should successfully create a 3-asset schedule with valid allocations", async function () {
      const assets = [
        { token: await weth.getAddress(), allocationBps: 5000 }, // 50%
        { token: await arb.getAddress(), allocationBps: 3000 },  // 30%
        { token: await link.getAddress(), allocationBps: 2000 }, // 20%
      ];

      const tx = await basketManager.connect(user).createSchedule(
        "DeFi Trio",
        await usdc.getAddress(),
        ethers.parseUnits("100", 6), // 100 USDC
        ONE_WEEK,
        100, // 1% slippage
        assets
      );

      await expect(tx)
        .to.emit(basketManager, "ScheduleCreated")
        .withArgs(
          1n,
          user.address,
          await usdc.getAddress(),
          ethers.parseUnits("100", 6),
          ONE_WEEK,
          100,
          "DeFi Trio"
        );

      const { schedule, assets: storedAssets } = await basketManager.getSchedule(1n);
      expect(schedule.id).to.equal(1n);
      expect(schedule.owner).to.equal(user.address);
      expect(schedule.tokenIn).to.equal(await usdc.getAddress());
      expect(schedule.amountInPerCycle).to.equal(ethers.parseUnits("100", 6));
      expect(schedule.intervalSeconds).to.equal(ONE_WEEK);
      expect(schedule.slippageBps).to.equal(100);
      expect(schedule.status).to.equal(0); // Active
      expect(schedule.name).to.equal("DeFi Trio");
      expect(storedAssets.length).to.equal(3);
    });

    it("should reject creation if allocations do not sum to 10000 bps", async function () {
      const underAssets = [
        { token: await weth.getAddress(), allocationBps: 5000 },
        { token: await arb.getAddress(), allocationBps: 4000 }, // sum = 90%
      ];
      await expect(
        basketManager.connect(user).createSchedule(
          "Under",
          await usdc.getAddress(),
          ethers.parseUnits("100", 6),
          ONE_WEEK,
          100,
          underAssets
        )
      ).to.be.revertedWithCustomError(basketManager, "InvalidAllocationSum")
        .withArgs(9000);

      const overAssets = [
        { token: await weth.getAddress(), allocationBps: 6000 },
        { token: await arb.getAddress(), allocationBps: 5000 }, // sum = 110%
      ];
      await expect(
        basketManager.connect(user).createSchedule(
          "Over",
          await usdc.getAddress(),
          ethers.parseUnits("100", 6),
          ONE_WEEK,
          100,
          overAssets
        )
      ).to.be.revertedWithCustomError(basketManager, "InvalidAllocationSum")
        .withArgs(11000);
    });

    it("should reject creation if asset count is less than 2 or greater than 5", async function () {
      const singleAsset = [{ token: await weth.getAddress(), allocationBps: 10000 }];
      await expect(
        basketManager.connect(user).createSchedule(
          "Single",
          await usdc.getAddress(),
          ethers.parseUnits("100", 6),
          ONE_WEEK,
          100,
          singleAsset
        )
      ).to.be.revertedWithCustomError(basketManager, "InvalidAssetCount")
        .withArgs(1);

      // Deploy 5 mock tokens for the > 5 test
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const t1 = await MockERC20.deploy("T1", "T1", 18);
      const t2 = await MockERC20.deploy("T2", "T2", 18);
      const t3 = await MockERC20.deploy("T3", "T3", 18);
      const t4 = await MockERC20.deploy("T4", "T4", 18);
      const t5 = await MockERC20.deploy("T5", "T5", 18);
      const t6 = await MockERC20.deploy("T6", "T6", 18);

      const sixAssets = [
        { token: await t1.getAddress(), allocationBps: 2000 },
        { token: await t2.getAddress(), allocationBps: 2000 },
        { token: await t3.getAddress(), allocationBps: 2000 },
        { token: await t4.getAddress(), allocationBps: 2000 },
        { token: await t5.getAddress(), allocationBps: 1000 },
        { token: await t6.getAddress(), allocationBps: 1000 },
      ];
      await expect(
        basketManager.connect(user).createSchedule(
          "Six",
          await usdc.getAddress(),
          ethers.parseUnits("100", 6),
          ONE_WEEK,
          100,
          sixAssets
        )
      ).to.be.revertedWithCustomError(basketManager, "InvalidAssetCount")
        .withArgs(6);
    });

    it("should reject creation if any allocation is below 100 bps (1%)", async function () {
      const tinyAsset = [
        { token: await weth.getAddress(), allocationBps: 9950 },
        { token: await arb.getAddress(), allocationBps: 50 }, // 0.5%
      ];
      await expect(
        basketManager.connect(user).createSchedule(
          "Tiny",
          await usdc.getAddress(),
          ethers.parseUnits("100", 6),
          ONE_WEEK,
          100,
          tinyAsset
        )
      ).to.be.revertedWithCustomError(basketManager, "AllocationTooSmall")
        .withArgs(50);
    });

    it("should reject duplicate tokens in the basket", async function () {
      const duplicateAssets = [
        { token: await weth.getAddress(), allocationBps: 5000 },
        { token: await weth.getAddress(), allocationBps: 5000 },
      ];
      await expect(
        basketManager.connect(user).createSchedule(
          "Dup",
          await usdc.getAddress(),
          ethers.parseUnits("100", 6),
          ONE_WEEK,
          100,
          duplicateAssets
        )
      ).to.be.revertedWithCustomError(basketManager, "DuplicateAsset")
        .withArgs(await weth.getAddress());
    });

    it("should reject if target token is the same as the funding token", async function () {
      const selfTokenAssets = [
        { token: await usdc.getAddress(), allocationBps: 5000 },
        { token: await weth.getAddress(), allocationBps: 5000 },
      ];
      await expect(
        basketManager.connect(user).createSchedule(
          "Self",
          await usdc.getAddress(),
          ethers.parseUnits("100", 6),
          ONE_WEEK,
          100,
          selfTokenAssets
        )
      ).to.be.revertedWithCustomError(basketManager, "AssetCannotBeFundingToken");
    });
  });

  describe("3. Execution Pre-flight Checks (canExecute View)", function () {
    beforeEach(async function () {
      const assets = [
        { token: await weth.getAddress(), allocationBps: 6000 },
        { token: await arb.getAddress(), allocationBps: 4000 },
      ];
      await basketManager.connect(user).createSchedule(
        "Bi-Token",
        await usdc.getAddress(),
        ethers.parseUnits("100", 6),
        ONE_WEEK,
        100,
        assets
      );
    });

    it("should return false if schedule interval has not elapsed", async function () {
      const [executable, reason] = await basketManager.canExecute(1n);
      expect(executable).to.be.false;
      expect(reason).to.equal("Schedule is not due yet");
    });

    it("should return false if user has not granted allowance", async function () {
      // Advance time past 1 week
      await time.increase(ONE_WEEK + 1);

      const [executable, reason] = await basketManager.canExecute(1n);
      expect(executable).to.be.false;
      expect(reason).to.equal("Insufficient contract allowance");
    });

    it("should return true when time has passed, allowance granted, and balance sufficient", async function () {
      await time.increase(ONE_WEEK + 1);
      // User grants allowance to contract
      await usdc.connect(user).approve(await basketManager.getAddress(), ethers.parseUnits("1000", 6));

      const [executable, reason] = await basketManager.canExecute(1n);
      expect(executable).to.be.true;
      expect(reason).to.equal("");
    });
  });

  describe("4. Scheduled Execution (executeSchedule)", function () {
    const budget = ethers.parseUnits("100", 6);

    beforeEach(async function () {
      const assets = [
        { token: await weth.getAddress(), allocationBps: 7000 }, // 70%
        { token: await arb.getAddress(), allocationBps: 3000 },  // 30%
      ];
      await basketManager.connect(user).createSchedule(
        "Alpha Basket",
        await usdc.getAddress(),
        budget,
        TEN_MINUTES, // 10 minute demo interval
        100,
        assets
      );

      // Approve spending
      await usdc.connect(user).approve(await basketManager.getAddress(), ethers.parseUnits("1000", 6));
    });

    it("should revert if non-keeper calls executeSchedule", async function () {
      await time.increase(TEN_MINUTES + 1);
      await expect(
        basketManager.connect(stranger).executeSchedule(1n)
      ).to.be.revertedWithCustomError(basketManager, "UnauthorizedKeeper")
        .withArgs(stranger.address);
    });

    it("should revert if called before interval has elapsed", async function () {
      await expect(
        basketManager.connect(keeper).executeSchedule(1n)
      ).to.be.revertedWithCustomError(basketManager, "ScheduleNotDue");
    });

    it("should successfully execute on schedule and deliver tokens to user", async function () {
      await time.increase(TEN_MINUTES + 1);

      const initialUserUsdc = await usdc.balanceOf(user.address);
      const initialUserWeth = await weth.balanceOf(user.address);
      const initialUserArb = await arb.balanceOf(user.address);

      const tx = await basketManager.connect(keeper).executeSchedule(1n);
      await expect(tx).to.emit(basketManager, "ScheduleExecuted");

      // Verify user balances: exactly budget pulled
      const finalUserUsdc = await usdc.balanceOf(user.address);
      expect(initialUserUsdc - finalUserUsdc).to.equal(budget);

      // Verify user received output tokens
      const finalUserWeth = await weth.balanceOf(user.address);
      const finalUserArb = await arb.balanceOf(user.address);
      expect(finalUserWeth).to.be.gt(initialUserWeth);
      expect(finalUserArb).to.be.gt(initialUserArb);

      // Verify contract holds ZERO idle balances (Non-Custodial Invariant)
      expect(await usdc.balanceOf(await basketManager.getAddress())).to.equal(0n);
      expect(await weth.balanceOf(await basketManager.getAddress())).to.equal(0n);
      expect(await arb.balanceOf(await basketManager.getAddress())).to.equal(0n);
    });

    it("should atomically revert entire transaction if DEX swap slips or fails", async function () {
      await time.increase(TEN_MINUTES + 1);

      // Set router to force swap failure
      await dexRouter.setShouldFailSwaps(true);

      const initialUserUsdc = await usdc.balanceOf(user.address);

      await expect(
        basketManager.connect(keeper).executeSchedule(1n)
      ).to.be.reverted;

      // Invariant: zero funds were taken from the user
      expect(await usdc.balanceOf(user.address)).to.equal(initialUserUsdc);
      expect(await usdc.balanceOf(await basketManager.getAddress())).to.equal(0n);
    });
  });

  describe("5. Instant One-Click Basket Purchase (executeInstantBasket)", function () {
    it("should allow a user to buy an entire multi-asset basket immediately on demand", async function () {
      const assets = [
        { token: await weth.getAddress(), allocationBps: 5000 },
        { token: await link.getAddress(), allocationBps: 5000 },
      ];
      const instantAmount = ethers.parseUnits("200", 6);

      // Approve contract
      await usdc.connect(user).approve(await basketManager.getAddress(), instantAmount);

      const initialUserWeth = await weth.balanceOf(user.address);
      const initialUserLink = await link.balanceOf(user.address);

      const tx = await basketManager.connect(user).executeInstantBasket(
        await usdc.getAddress(),
        instantAmount,
        100, // 1% slippage
        assets
      );

      await expect(tx).to.emit(basketManager, "InstantBasketExecuted");

      // Verify tokens delivered to user
      expect(await weth.balanceOf(user.address)).to.be.gt(initialUserWeth);
      expect(await link.balanceOf(user.address)).to.be.gt(initialUserLink);

      // Contract balance invariant
      expect(await usdc.balanceOf(await basketManager.getAddress())).to.equal(0n);
      expect(await weth.balanceOf(await basketManager.getAddress())).to.equal(0n);
      expect(await link.balanceOf(await basketManager.getAddress())).to.equal(0n);
    });
  });

  describe("6. Schedule Lifecycle Controls (Pause, Resume, Cancel)", function () {
    beforeEach(async function () {
      const assets = [
        { token: await weth.getAddress(), allocationBps: 5000 },
        { token: await arb.getAddress(), allocationBps: 5000 },
      ];
      await basketManager.connect(user).createSchedule(
        "Lifecycle Basket",
        await usdc.getAddress(),
        ethers.parseUnits("50", 6),
        ONE_WEEK,
        100,
        assets
      );
    });

    it("should allow owner to pause and prevent execution", async function () {
      await expect(basketManager.connect(user).pauseSchedule(1n))
        .to.emit(basketManager, "SchedulePaused")
        .withArgs(1n, user.address);

      const { schedule } = await basketManager.getSchedule(1n);
      expect(schedule.status).to.equal(1); // Paused

      await time.increase(ONE_WEEK + 1);
      await expect(
        basketManager.connect(keeper).executeSchedule(1n)
      ).to.be.revertedWithCustomError(basketManager, "ScheduleNotActive");
    });

    it("should allow owner to resume paused schedule", async function () {
      await basketManager.connect(user).pauseSchedule(1n);
      await expect(basketManager.connect(user).resumeSchedule(1n))
        .to.emit(basketManager, "ScheduleResumed")
        .withArgs(1n, user.address);

      const { schedule } = await basketManager.getSchedule(1n);
      expect(schedule.status).to.equal(0); // Active
    });

    it("should allow owner to cancel schedule permanently", async function () {
      await expect(basketManager.connect(user).cancelSchedule(1n))
        .to.emit(basketManager, "ScheduleCancelled")
        .withArgs(1n, user.address);

      const { schedule } = await basketManager.getSchedule(1n);
      expect(schedule.status).to.equal(2); // Cancelled

      // Resuming a cancelled schedule must fail
      await expect(
        basketManager.connect(user).resumeSchedule(1n)
      ).to.be.revertedWith("Schedule not paused");
    });

    it("should reject non-owners from modifying schedule lifecycle", async function () {
      await expect(
        basketManager.connect(stranger).pauseSchedule(1n)
      ).to.be.revertedWithCustomError(basketManager, "NotScheduleOwner")
        .withArgs(1n, stranger.address);

      await expect(
        basketManager.connect(stranger).cancelSchedule(1n)
      ).to.be.revertedWithCustomError(basketManager, "NotScheduleOwner")
        .withArgs(1n, stranger.address);
    });
  });

  describe("7. Protocol Administration & Emergency Pause", function () {
    it("should allow owner to update keeper address", async function () {
      await expect(basketManager.connect(owner).setKeeperAddress(stranger.address))
        .to.emit(basketManager, "KeeperUpdated")
        .withArgs(keeper.address, stranger.address);

      expect(await basketManager.keeperAddress()).to.equal(stranger.address);
    });

    it("should allow owner to trigger global protocol pause", async function () {
      await basketManager.connect(owner).pause();

      const assets = [
        { token: await weth.getAddress(), allocationBps: 5000 },
        { token: await arb.getAddress(), allocationBps: 5000 },
      ];

      await expect(
        basketManager.connect(user).createSchedule(
          "Paused Basket",
          await usdc.getAddress(),
          ethers.parseUnits("50", 6),
          ONE_WEEK,
          100,
          assets
        )
      ).to.be.revertedWithCustomError(basketManager, "EnforcedPause");
    });
  });
});
