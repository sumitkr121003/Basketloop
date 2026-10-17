const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

/**
 * LimitOrderManager Deployment Script
 *
 * NOTE: This script is prepared for review. Do NOT deploy without explicit user approval.
 */
async function main() {
  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No deployer account configured. Check DEPLOYER_PRIVATE_KEY.");
  }

  const deployer = signers[0];
  const networkName = hre.network.name;
  const isLocal = networkName === "hardhat" || networkName === "localhost";

  console.log("==================================================");
  console.log("🚀 LimitOrderManager Deployment Script");
  console.log("==================================================");
  console.log("Target Network: ", networkName);
  console.log("Deployer / Owner:", deployer.address);

  const balanceWei = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer Balance:", hre.ethers.formatEther(balanceWei), "ETH");

  const manifestPath = path.join(__dirname, "..", "..", "deployments.json");
  let manifest = {};
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  }

  const contracts = manifest.contracts || {};
  let routerAddress = contracts.MockDEXRouter;
  let wethAddress = contracts.MockWETH;

  if (!routerAddress || !wethAddress) {
    if (isLocal) {
      console.log("\n📦 Setting up local mock router & WETH for test run...");
      const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
      const mWETH = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
      wethAddress = await mWETH.getAddress();

      const MockDEXRouter = await hre.ethers.getContractFactory("MockDEXRouter");
      const router = await MockDEXRouter.deploy();
      routerAddress = await router.getAddress();
    } else {
      throw new Error("MockDEXRouter or MockWETH not found in deployments.json");
    }
  }

  console.log("Active DEX Router:  ", routerAddress);
  console.log("Wrapped Token (WETH):", wethAddress);

  console.log("\nDeploying LimitOrderManager...");
  const LimitOrderManager = await hre.ethers.getContractFactory("LimitOrderManager");
  const limitOrderManager = await LimitOrderManager.deploy(
    routerAddress,
    wethAddress,
    deployer.address
  );
  await limitOrderManager.waitForDeployment();
  const limitOrderAddress = await limitOrderManager.getAddress();

  const deployTx = limitOrderManager.deploymentTransaction();
  const deployTxHash = deployTx ? deployTx.hash : "Unknown";
  console.log("✔ LimitOrderManager deployed at:", limitOrderAddress);
  console.log("✔ Deployment Transaction Hash: ", deployTxHash);
  if (manifest.explorer) {
    console.log("🔗 Explorer URL:                ", `${manifest.explorer}/tx/${deployTxHash}`);
    console.log("🔗 Contract URL:                ", `${manifest.explorer}/address/${limitOrderAddress}`);
  }

  if (!isLocal) {
    manifest.contracts = manifest.contracts || {};
    manifest.contracts.LimitOrderManager = limitOrderAddress;
    manifest.limitOrderManagerDeploymentTx = deployTxHash;
    manifest.limitOrderManagerDeployedAt = new Date().toISOString();
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log("📄 Updated deployments.json with LimitOrderManager address.");
  }

  return { limitOrderAddress, deployTxHash, routerAddress, wethAddress };
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("\n❌ Deployment failed:", error);
      process.exit(1);
    });
}

module.exports = main;
