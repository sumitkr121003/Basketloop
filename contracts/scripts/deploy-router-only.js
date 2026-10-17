const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No deployer account configured. Check DEPLOYER_PRIVATE_KEY.");
  }

  const deployer = signers[0];
  const networkName = hre.network.name;
  const isLocal = networkName === "hardhat" || networkName === "localhost";

  console.log("==================================================");
  console.log("🔄 BasketLoop Router-Only Upgrade Script (Option B)");
  console.log("==================================================");
  console.log("Target Network: ", networkName);
  console.log("Deployer / Owner:", deployer.address);

  // Check balance
  const balanceWei = await hre.ethers.provider.getBalance(deployer.address);
  const balanceEth = hre.ethers.formatEther(balanceWei);
  console.log("Deployer Balance:", balanceEth, "ETH");

  const manifestPath = path.join(__dirname, "..", "..", "deployments.json");
  let manifest;
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } else {
    throw new Error(`Deployment manifest not found at ${manifestPath}`);
  }

  const contracts = manifest.contracts || {};
  let basketManagerAddress = contracts.BasketLoopManager;
  let usdcAddress = contracts.MockUSDC;
  let usdtAddress = contracts.MockUSDT;
  let wethAddress = contracts.MockWETH;
  let arbAddress = contracts.MockARB;
  let linkAddress = contracts.MockLINK;
  let uniAddress = contracts.MockUNI;

  // In local test environments without pre-deployed contracts, deploy mock manager and tokens
  const managerCode = basketManagerAddress ? await hre.ethers.provider.getCode(basketManagerAddress) : "0x";
  if (isLocal && managerCode === "0x") {
    console.log("\n📦 Setting up local mock environment for test run...");
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const mUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);
    const mUSDT = await MockERC20.deploy("Tether USD", "USDT", 6);
    const mWETH = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
    const mARB = await MockERC20.deploy("Arbitrum", "ARB", 18);
    const mLINK = await MockERC20.deploy("Chainlink", "LINK", 18);
    const mUNI = await MockERC20.deploy("Uniswap", "UNI", 18);

    usdcAddress = await mUSDC.getAddress();
    usdtAddress = await mUSDT.getAddress();
    wethAddress = await mWETH.getAddress();
    arbAddress = await mARB.getAddress();
    linkAddress = await mLINK.getAddress();
    uniAddress = await mUNI.getAddress();

    const MockDEXRouter = await hre.ethers.getContractFactory("MockDEXRouter");
    const initialRouter = await MockDEXRouter.deploy();
    const initialRouterAddress = await initialRouter.getAddress();

    const BasketLoopManager = await hre.ethers.getContractFactory("BasketLoopManager");
    const mgr = await BasketLoopManager.deploy(initialRouterAddress, deployer.address, deployer.address);
    basketManagerAddress = await mgr.getAddress();
  }

  console.log("\nExisting BasketLoopManager:", basketManagerAddress);
  console.log("Current DEX Router:        ", contracts.MockDEXRouter || "None");

  // 1. Deploy the new MockDEXRouter with decimal normalization fix
  console.log("\n🚀 Step 1: Deploying Fixed MockDEXRouter...");
  const MockDEXRouter = await hre.ethers.getContractFactory("MockDEXRouter");
  const newRouter = await MockDEXRouter.deploy();
  await newRouter.waitForDeployment();
  const newRouterAddress = await newRouter.getAddress();
  console.log("✔ New MockDEXRouter deployed at:", newRouterAddress);

  // 2. Seed Liquidity to the New Router
  console.log("\n💧 Step 2: Seeding Liquidity to New MockDEXRouter...");
  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");

  const weth = MockERC20.attach(wethAddress);
  const arb = MockERC20.attach(arbAddress);
  const link = MockERC20.attach(linkAddress);
  const uni = MockERC20.attach(uniAddress);
  const usdc = MockERC20.attach(usdcAddress);
  const usdt = MockERC20.attach(usdtAddress);

  console.log("  • Minting 10,000 WETH to new router...");
  const tx1 = await weth.mint(newRouterAddress, hre.ethers.parseUnits("10000", 18));
  await tx1.wait();

  console.log("  • Minting 500,000 ARB to new router...");
  const tx2 = await arb.mint(newRouterAddress, hre.ethers.parseUnits("500000", 18));
  await tx2.wait();

  console.log("  • Minting 100,000 LINK to new router...");
  const tx3 = await link.mint(newRouterAddress, hre.ethers.parseUnits("100000", 18));
  await tx3.wait();

  console.log("  • Minting 50,000 UNI to new router...");
  const tx4 = await uni.mint(newRouterAddress, hre.ethers.parseUnits("50000", 18));
  await tx4.wait();

  console.log("  • Minting 1,000,000 USDC to new router...");
  const tx5 = await usdc.mint(newRouterAddress, hre.ethers.parseUnits("1000000", 6));
  await tx5.wait();

  console.log("  • Minting 1,000,000 USDT to new router...");
  const tx6 = await usdt.mint(newRouterAddress, hre.ethers.parseUnits("1000000", 6));
  await tx6.wait();
  console.log("✔ New MockDEXRouter seeded with deep liquidity.");

  // 3. Upgrade Router on BasketLoopManager via setDexRouter(address)
  console.log("\n🔗 Step 3: Updating BasketLoopManager.dexRouter...");
  const BasketLoopManager = await hre.ethers.getContractFactory("BasketLoopManager");
  const basketManager = BasketLoopManager.attach(basketManagerAddress);

  const updateTx = await basketManager.setDexRouter(newRouterAddress);
  console.log("  • Transaction sent. Waiting for confirmation...");
  const receipt = await updateTx.wait();
  console.log(`✔ Router updated in block #${receipt.blockNumber}! Transaction hash: ${receipt.hash}`);

  // Verify the update on-chain
  const activeRouterOnManager = await basketManager.dexRouter();
  console.log("✔ Verified on-chain: BasketLoopManager.dexRouter() =", activeRouterOnManager);
  if (activeRouterOnManager.toLowerCase() !== newRouterAddress.toLowerCase()) {
    throw new Error("Verification failed: active router does not match new router address!");
  }

  // 4. Update deployments.json & frontend/lib/contracts.ts (only on live networks)
  const oldRouterAddress = manifest.contracts.MockDEXRouter;
  if (!isLocal) {
    manifest.contracts.MockDEXRouter = newRouterAddress;
    manifest.previousMockDEXRouter = oldRouterAddress;
    manifest.routerUpgradedAt = new Date().toISOString();
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log("\n📄 Updated deployments.json with new router address:", newRouterAddress);

    const contractsTsPath = path.join(__dirname, "..", "..", "frontend", "lib", "contracts.ts");
    if (fs.existsSync(contractsTsPath)) {
      let content = fs.readFileSync(contractsTsPath, "utf-8");
      content = content.replace(
        /dexRouter:\s*"0x[a-fA-F0-9]{40}"/,
        `dexRouter: "${newRouterAddress}"`
      );
      fs.writeFileSync(contractsTsPath, content, "utf-8");
      console.log("📄 Updated frontend/lib/contracts.ts with new router address.");
    }
  } else {
    console.log("\n[Local Dry-Run] Skipped writing deployments.json and frontend/lib/contracts.ts.");
  }

  console.log("\n==================================================");
  console.log("🎉 Option B: Router-Only Upgrade Complete!");
  console.log("==================================================");
  console.log("Old Router:           ", oldRouterAddress);
  console.log("New Router:           ", newRouterAddress);
  console.log("BasketLoopManager:    ", basketManagerAddress);
  console.log("All existing schedules & user configurations are preserved.");

  return {
    oldRouterAddress,
    newRouterAddress,
    basketManagerAddress,
  };
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("\n❌ Upgrade failed:", error);
      process.exit(1);
    });
}

module.exports = main;
