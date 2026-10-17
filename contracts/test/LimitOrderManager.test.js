const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LimitOrderManager — Unit & Security Test Suite", function () {
  let owner, maker, executor, otherUser;
  let usdc, weth, arb;
  let dexRouter, limitManager;

  const RATE_1_TO_1 = 10000; // 1.0x

  beforeEach(async function () {
    [owner, maker, executor, otherUser] = await ethers.getSigners();

    // 1. Deploy Mock Tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
    arb = await MockERC20.deploy("Arbitrum", "ARB", 18);

    // 2. Deploy Mock DEX Router (with decimal fix)
    const MockDEXRouter = await ethers.getContractFactory("MockDEXRouter");
    dexRouter = await MockDEXRouter.deploy();
    await dexRouter.setRateMultiplier(RATE_1_TO_1);

    // 3. Deploy LimitOrderManager
    const LimitOrderManager = await ethers.getContractFactory("LimitOrderManager");
    limitManager = await LimitOrderManager.deploy(
      await dexRouter.getAddress(),
      await weth.getAddress(),
      owner.address
    );

    // 4. Seed liquidity to router
    await weth.mint(await dexRouter.getAddress(), ethers.parseUnits("10000", 18));
    await arb.mint(await dexRouter.getAddress(), ethers.parseUnits("500000", 18));
    await usdc.mint(await dexRouter.getAddress(), ethers.parseUnits("1000000", 6));

    // Fund router with native ETH
    await owner.sendTransaction({
      to: await dexRouter.getAddress(),
      value: ethers.parseEther("50.0"),
    });

    // 5. Fund Maker
    await usdc.mint(maker.address, ethers.parseUnits("10000", 6));
    await weth.mint(maker.address, ethers.parseUnits("10", 18));
  });

  describe("1. Deployment & Configuration", function () {
    it("should initialize with correct parameters", async function () {
      expect(await limitManager.dexRouter()).to.equal(await dexRouter.getAddress());
      expect(await limitManager.wrappedNativeToken()).to.equal(await weth.getAddress());
      expect(await limitManager.owner()).to.equal(owner.address);
      expect(await limitManager.nextOrderId()).to.equal(1n);
    });

    it("should allow owner to update router and wrapped token", async function () {
      await limitManager.setDexRouter(otherUser.address);
      expect(await limitManager.dexRouter()).to.equal(otherUser.address);

      await limitManager.setWrappedToken(otherUser.address);
      expect(await limitManager.wrappedNativeToken()).to.equal(otherUser.address);
    });

    it("should reject non-owner updates", async function () {
      await expect(
        limitManager.connect(maker).setDexRouter(maker.address)
      ).to.be.revertedWithCustomError(limitManager, "OwnableUnauthorizedAccount");
    });
  });

  describe("2. Limit Order Creation & Escrow", function () {
    it("should escrow ERC-20 tokens when creating an order", async function () {
      const amountIn = ethers.parseUnits("100", 6); // 100 USDC
      const minAmountOut = ethers.parseUnits("100", 18); // 100 WETH

      await usdc.connect(maker).approve(await limitManager.getAddress(), amountIn);

      const tx = await limitManager.connect(maker).createOrder(
        await usdc.getAddress(),
        await weth.getAddress(),
        amountIn,
        minAmountOut,
        0 // GTC
      );

      await expect(tx)
        .to.emit(limitManager, "OrderCreated")
        .withArgs(1n, maker.address, await usdc.getAddress(), await weth.getAddress(), amountIn, minAmountOut, 0n);

      // Verify contract holds the escrowed tokens
      expect(await usdc.balanceOf(await limitManager.getAddress())).to.equal(amountIn);

      // Verify order record
      const order = await limitManager.getOrder(1n);
      expect(order.maker).to.equal(maker.address);
      expect(order.amountIn).to.equal(amountIn);
      expect(order.minAmountOut).to.equal(minAmountOut);
      expect(order.status).to.equal(0); // Open
    });

    it("should escrow Native ETH when creating an ETH order", async function () {
      const amountIn = ethers.parseEther("1.0");
      const minAmountOut = ethers.parseUnits("1", 6); // 1 USDC

      const tx = await limitManager.connect(maker).createOrder(
        ethers.ZeroAddress,
        await usdc.getAddress(),
        amountIn,
        minAmountOut,
        0,
        { value: amountIn }
      );

      await expect(tx).to.emit(limitManager, "OrderCreated");
      expect(await ethers.provider.getBalance(await limitManager.getAddress())).to.equal(amountIn);

      const order = await limitManager.getOrder(1n);
      expect(order.tokenIn).to.equal(ethers.ZeroAddress);
      expect(order.amountIn).to.equal(amountIn);
    });

    it("should reject order if tokenIn equals tokenOut", async function () {
      await expect(
        limitManager.connect(maker).createOrder(
          await usdc.getAddress(),
          await usdc.getAddress(),
          100n,
          100n,
          0
        )
      ).to.be.revertedWithCustomError(limitManager, "SameToken");
    });

    it("should reject order with zero amount", async function () {
      await expect(
        limitManager.connect(maker).createOrder(
          await usdc.getAddress(),
          await weth.getAddress(),
          0n,
          100n,
          0
        )
      ).to.be.revertedWithCustomError(limitManager, "InvalidAmount");
    });
  });

  describe("3. Order Execution & Direct Delivery", function () {
    it("should execute order when price condition is met and deliver output to maker", async function () {
      const amountIn = ethers.parseUnits("100", 6); // 100 USDC
      const minAmountOut = ethers.parseUnits("100", 18); // 100 WETH (at 1:1 rate)

      await usdc.connect(maker).approve(await limitManager.getAddress(), amountIn);
      await limitManager.connect(maker).createOrder(
        await usdc.getAddress(),
        await weth.getAddress(),
        amountIn,
        minAmountOut,
        0
      );

      const initialMakerWeth = await weth.balanceOf(maker.address);

      // Executor triggers execution
      const tx = await limitManager.connect(executor).executeOrder(1n);
      await expect(tx)
        .to.emit(limitManager, "OrderExecuted")
        .withArgs(1n, executor.address, maker.address, amountIn, minAmountOut);

      // Verify maker received WETH
      const finalMakerWeth = await weth.balanceOf(maker.address);
      expect(finalMakerWeth - initialMakerWeth).to.equal(minAmountOut);

      // Verify order status is Filled
      const order = await limitManager.getOrder(1n);
      expect(order.status).to.equal(1); // Filled

      // Contract should hold 0 USDC now
      expect(await usdc.balanceOf(await limitManager.getAddress())).to.equal(0n);
    });

    it("should revert if DEX output falls below minAmountOut (PriceConditionNotMet)", async function () {
      const amountIn = ethers.parseUnits("100", 6);
      // Demand 150 WETH for 100 USDC when router rate is 1:1 (delivers 100 WETH)
      const minAmountOut = ethers.parseUnits("150", 18);

      await usdc.connect(maker).approve(await limitManager.getAddress(), amountIn);
      await limitManager.connect(maker).createOrder(
        await usdc.getAddress(),
        await weth.getAddress(),
        amountIn,
        minAmountOut,
        0
      );

      await expect(
        limitManager.connect(executor).executeOrder(1n)
      ).to.be.revertedWithCustomError(limitManager, "PriceConditionNotMet");

      // Verify order remains Open
      const order = await limitManager.getOrder(1n);
      expect(order.status).to.equal(0); // Open
    });

    it("should prevent double execution of already filled orders", async function () {
      const amountIn = ethers.parseUnits("50", 6);
      const minAmountOut = ethers.parseUnits("50", 18);

      await usdc.connect(maker).approve(await limitManager.getAddress(), amountIn);
      await limitManager.connect(maker).createOrder(
        await usdc.getAddress(),
        await weth.getAddress(),
        amountIn,
        minAmountOut,
        0
      );

      await limitManager.connect(executor).executeOrder(1n);

      // Attempt second execution
      await expect(
        limitManager.connect(executor).executeOrder(1n)
      ).to.be.revertedWithCustomError(limitManager, "OrderNotOpen");
    });

    it("should execute Native ETH -> ERC-20 limit order and deliver tokens directly to maker", async function () {
      const ethAmountIn = ethers.parseEther("2.0");
      // 2 ETH (18 dec) -> 2 USDC (6 dec) at 1:1 rate
      const minAmountOut = ethers.parseUnits("2", 6);

      await limitManager.connect(maker).createOrder(
        ethers.ZeroAddress,
        await usdc.getAddress(),
        ethAmountIn,
        minAmountOut,
        0,
        { value: ethAmountIn }
      );

      const initialMakerUsdc = await usdc.balanceOf(maker.address);
      const initialContractEth = await ethers.provider.getBalance(await limitManager.getAddress());
      expect(initialContractEth).to.equal(ethAmountIn);

      // Executor executes the order
      const tx = await limitManager.connect(executor).executeOrder(1n);
      await expect(tx)
        .to.emit(limitManager, "OrderExecuted")
        .withArgs(1n, executor.address, maker.address, ethAmountIn, minAmountOut);

      // Verify maker received USDC
      const finalMakerUsdc = await usdc.balanceOf(maker.address);
      expect(finalMakerUsdc - initialMakerUsdc).to.equal(minAmountOut);

      // Contract should hold 0 ETH now
      expect(await ethers.provider.getBalance(await limitManager.getAddress())).to.equal(0n);

      const order = await limitManager.getOrder(1n);
      expect(order.status).to.equal(1); // Filled
    });

    it("should execute ERC-20 -> Native ETH limit order and deliver ETH directly to maker", async function () {
      const usdcAmountIn = ethers.parseUnits("3", 6);
      // 3 USDC (6 dec) -> 3 ETH (18 dec) at 1:1 rate
      const minAmountOut = ethers.parseEther("3.0");

      await usdc.connect(maker).approve(await limitManager.getAddress(), usdcAmountIn);
      await limitManager.connect(maker).createOrder(
        await usdc.getAddress(),
        ethers.ZeroAddress,
        usdcAmountIn,
        minAmountOut,
        0
      );

      const initialMakerEth = await ethers.provider.getBalance(maker.address);

      // Executor triggers execution (executor pays the gas)
      const tx = await limitManager.connect(executor).executeOrder(1n);
      await expect(tx)
        .to.emit(limitManager, "OrderExecuted")
        .withArgs(1n, executor.address, maker.address, usdcAmountIn, minAmountOut);

      // Verify maker received exact ETH with 0 gas deduction
      const finalMakerEth = await ethers.provider.getBalance(maker.address);
      expect(finalMakerEth - initialMakerEth).to.equal(minAmountOut);

      // Contract USDC balance is now 0
      expect(await usdc.balanceOf(await limitManager.getAddress())).to.equal(0n);

      const order = await limitManager.getOrder(1n);
      expect(order.status).to.equal(1); // Filled
    });
  });

  describe("4. Cancellation & Escrow Refunds", function () {
    it("should allow maker to cancel order and receive 100% refund of escrowed tokens", async function () {
      const amountIn = ethers.parseUnits("200", 6);
      await usdc.connect(maker).approve(await limitManager.getAddress(), amountIn);
      await limitManager.connect(maker).createOrder(
        await usdc.getAddress(),
        await weth.getAddress(),
        amountIn,
        ethers.parseUnits("200", 18),
        0
      );

      const preCancelBalance = await usdc.balanceOf(maker.address);

      await expect(limitManager.connect(maker).cancelOrder(1n))
        .to.emit(limitManager, "OrderCancelled")
        .withArgs(1n, maker.address);

      const postCancelBalance = await usdc.balanceOf(maker.address);
      expect(postCancelBalance - preCancelBalance).to.equal(amountIn);

      const order = await limitManager.getOrder(1n);
      expect(order.status).to.equal(2); // Cancelled
    });

    it("should refund Native ETH when maker cancels an ETH order", async function () {
      const amountIn = ethers.parseEther("2.0");
      await limitManager.connect(maker).createOrder(
        ethers.ZeroAddress,
        await usdc.getAddress(),
        amountIn,
        ethers.parseUnits("2", 6),
        0,
        { value: amountIn }
      );

      const preBalance = await ethers.provider.getBalance(maker.address);
      const tx = await limitManager.connect(maker).cancelOrder(1n);
      const receipt = await tx.wait();
      const gasSpent = receipt.gasUsed * receipt.gasPrice;

      const postBalance = await ethers.provider.getBalance(maker.address);
      expect(postBalance + gasSpent - preBalance).to.equal(amountIn);
    });

    it("should reject cancellation by non-maker accounts", async function () {
      const amountIn = ethers.parseUnits("50", 6);
      await usdc.connect(maker).approve(await limitManager.getAddress(), amountIn);
      await limitManager.connect(maker).createOrder(
        await usdc.getAddress(),
        await weth.getAddress(),
        amountIn,
        ethers.parseUnits("50", 18),
        0
      );

      await expect(
        limitManager.connect(otherUser).cancelOrder(1n)
      ).to.be.revertedWithCustomError(limitManager, "NotOrderMaker");
    });
  });

  describe("5. Expiry Management", function () {
    it("should reject execution of expired orders", async function () {
      const block = await ethers.provider.getBlock("latest");
      const expiresAt = block.timestamp + 60; // 60 seconds

      const amountIn = ethers.parseUnits("100", 6);
      await usdc.connect(maker).approve(await limitManager.getAddress(), amountIn);
      await limitManager.connect(maker).createOrder(
        await usdc.getAddress(),
        await weth.getAddress(),
        amountIn,
        ethers.parseUnits("100", 18),
        expiresAt
      );

      // Fast-forward time past expiry
      await ethers.provider.send("evm_increaseTime", [120]);
      await ethers.provider.send("evm_mine");

      await expect(
        limitManager.connect(executor).executeOrder(1n)
      ).to.be.revertedWithCustomError(limitManager, "OrderHasExpired");
    });

    it("should allow anyone to trigger refund on an expired order via cancelExpiredOrder", async function () {
      const block = await ethers.provider.getBlock("latest");
      const expiresAt = block.timestamp + 60;

      const amountIn = ethers.parseUnits("100", 6);
      await usdc.connect(maker).approve(await limitManager.getAddress(), amountIn);
      await limitManager.connect(maker).createOrder(
        await usdc.getAddress(),
        await weth.getAddress(),
        amountIn,
        ethers.parseUnits("100", 18),
        expiresAt
      );

      await ethers.provider.send("evm_increaseTime", [120]);
      await ethers.provider.send("evm_mine");

      const preBalance = await usdc.balanceOf(maker.address);

      // Executor/keeper clears expired order and refunds maker
      await expect(limitManager.connect(executor).cancelExpiredOrder(1n))
        .to.emit(limitManager, "OrderExpired")
        .withArgs(1n, maker.address);

      const postBalance = await usdc.balanceOf(maker.address);
      expect(postBalance - preBalance).to.equal(amountIn);

      const order = await limitManager.getOrder(1n);
      expect(order.status).to.equal(3); // Expired
    });
  });

  describe("6. canExecute View Pre-flight Check", function () {
    it("should return true when market quote meets minAmountOut", async function () {
      const amountIn = ethers.parseUnits("100", 6);
      await usdc.connect(maker).approve(await limitManager.getAddress(), amountIn);
      await limitManager.connect(maker).createOrder(
        await usdc.getAddress(),
        await weth.getAddress(),
        amountIn,
        ethers.parseUnits("100", 18), // 100 WETH matches 1:1 rate
        0
      );

      const [executable, reason] = await limitManager.canExecute(1n);
      expect(executable).to.be.true;
      expect(reason).to.equal("");
    });

    it("should return false when target price is higher than current market rate", async function () {
      const amountIn = ethers.parseUnits("100", 6);
      await usdc.connect(maker).approve(await limitManager.getAddress(), amountIn);
      await limitManager.connect(maker).createOrder(
        await usdc.getAddress(),
        await weth.getAddress(),
        amountIn,
        ethers.parseUnits("200", 18), // Wants 200 WETH, router gives 100
        0
      );

      const [executable, reason] = await limitManager.canExecute(1n);
      expect(executable).to.be.false;
      expect(reason).to.equal("Target price condition not met");
    });
  });
});
