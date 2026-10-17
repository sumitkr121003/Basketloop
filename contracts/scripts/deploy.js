const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Live faucet directory for public testnets
const NETWORK_FAUCETS = {
  arbitrumSepolia: [
    "https://faucet.quicknode.com/arbitrum/sepolia",
    "https://faucets.chain.link/arbitrum-sepolia",
    "https://www.alchemy.com/faucets/arbitrum-sepolia",
    "https://bridge.arbitrum.io/?destinationChain=arbitrum-sepolia&sourceChain=sepolia",
    "https://learnweb3.io/faucets/arbitrum_sepolia",
    "https://sepolia-faucet.pk910.de/ (Sepolia PoW L1)",
  ],
  robinhoodTestnet: [
    "https://faucet.testnet.chain.robinhood.com",
    "https://explorer.testnet.chain.robinhood.com",
    "https://faucet.trade/robinhood-testnet-eth-faucet",
  ],
};

const NETWORK_EXPLORERS = {
  arbitrumSepolia: "https://sepolia.arbiscan.io",
  robinhoodTestnet: "https://explorer.testnet.chain.robinhood.com",
};

const LIVE_RPCS = {
  arbitrumSepolia: [
    "https://sepolia-rollup.arbitrum.io/rpc (Official)",
    "https://arbitrum-sepolia-rpc.publicnode.com",
    "https://arbitrum-sepolia.blockpi.network/v1/rpc/public",
    "https://arbitrum-sepolia.drpc.org",
  ],
  robinhoodTestnet: [
    "https://rpc.testnet.chain.robinhood.com/rpc (Official)",
  ],
};

async function main() {
  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    const targetNet = hre.network.name;
    const faucetsList = NETWORK_FAUCETS[targetNet] || [];
    console.error(`\n❌ Error: No deployer account configured for network '${targetNet}'.`);
    console.log(`Please define DEPLOYER_PRIVATE_KEY in contracts/.env or your environment.`);
    if (faucetsList.length > 0) {
      console.log(`\nOnce configured, get testnet gas ETH from:`);
      faucetsList.forEach((f) => console.log(`   🔗 ${f}`));
    }
    throw new Error(
      `No deployer account configured for network '${targetNet}'.\n` +
      `Please provide DEPLOYER_PRIVATE_KEY in contracts/.env or hardhat.config.js.`
    );
  }

  const deployer = signers[0];
  const keeperSigner = signers.length > 1 ? signers[1] : null;
  const testUserSigner = signers.length > 2 ? signers[2] : null;

  const keeperAddress =
    process.env.KEEPER_ADDRESS ||
    (keeperSigner ? keeperSigner.address : deployer.address);

  const testRecipient =
    process.env.TEST_USER_ADDRESS ||
    (testUserSigner ? testUserSigner.address : deployer.address);

  const networkName = hre.network.name;
  const chainId = hre.network.config.chainId || (await hre.ethers.provider.getNetwork()).chainId;
  const rpcUrl = hre.network.config.url || "in-process / hardhat";
  const explorerUrl = NETWORK_EXPLORERS[networkName];
  const faucets = NETWORK_FAUCETS[networkName] || [];

  console.log("==================================================");
  console.log("🚀 BasketLoop Public Testnet Deployment Script");
  console.log("==================================================");
  console.log("Target Network:", networkName);
  console.log("Chain ID:      ", chainId.toString());
  console.log("RPC URL:       ", rpcUrl);
  if (explorerUrl) {
    console.log("Block Explorer:", explorerUrl);
  }
  console.log("Deployer:      ", deployer.address);
  console.log("Keeper Address:", keeperAddress);
  console.log("Test Recipient:", testRecipient);

  // Check network block number & connection health
  try {
    const blockNumber = await hre.ethers.provider.getBlockNumber();
    console.log("Latest Block:  ", blockNumber.toString());
  } catch (err) {
    console.warn("⚠️  Could not fetch latest block from RPC:", err.message);
  }

  // Check deployer ETH balance
  const balanceWei = await hre.ethers.provider.getBalance(deployer.address);
  const balanceEth = hre.ethers.formatEther(balanceWei);
  console.log(`Native Balance: ${balanceEth} ETH`);

  if (networkName !== "hardhat" && networkName !== "localhost") {
    if (balanceWei === 0n || parseFloat(balanceEth) < 0.001) {
      console.error(`\n❌ Error: Deployer ${deployer.address} has insufficient ETH (${balanceEth} ETH) on ${networkName}!`);
      console.log("\nTo deploy BasketLoop smart contracts, please fund this account with at least ~0.005 testnet gas ETH.");
      console.log("\nLive Testnet Faucets & Bridges:");
      faucets.forEach((f) => console.log(`   🔗 ${f}`));
      console.log("\nAlternate Live RPCs (if current RPC is slow or congested):");
      (LIVE_RPCS[networkName] || []).forEach((r) => console.log(`   🌐 ${r}`));
      throw new Error(`Insufficient funds: ${deployer.address} requires testnet gas ETH on ${networkName}.`);
    } else if (parseFloat(balanceEth) < 0.005) {
      console.warn(`\n⚠️  Warning: Low deployer balance (${balanceEth} ETH). Deployment may run out of gas if fee spikes occur.`);
      if (faucets.length > 0) {
        console.log("Live faucets for additional gas:");
        faucets.forEach((f) => console.log(`   🔗 ${f}`));
      }
    }
  }

  // 1. Deploy Mock Tokens
  console.log("\n📦 Deploying Mock ERC-20 Tokens...");
  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");

  const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("✔ MockUSDC deployed at:", usdcAddress);

  const usdt = await MockERC20.deploy("Tether USD", "USDT", 6);
  await usdt.waitForDeployment();
  const usdtAddress = await usdt.getAddress();
  console.log("✔ MockUSDT deployed at:", usdtAddress);

  const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
  await weth.waitForDeployment();
  const wethAddress = await weth.getAddress();
  console.log("✔ MockWETH deployed at:", wethAddress);

  const arb = await MockERC20.deploy("Arbitrum", "ARB", 18);
  await arb.waitForDeployment();
  const arbAddress = await arb.getAddress();
  console.log("✔ MockARB deployed at:", arbAddress);

  const link = await MockERC20.deploy("Chainlink", "LINK", 18);
  await link.waitForDeployment();
  const linkAddress = await link.getAddress();
  console.log("✔ MockLINK deployed at:", linkAddress);

  const uni = await MockERC20.deploy("Uniswap", "UNI", 18);
  await uni.waitForDeployment();
  const uniAddress = await uni.getAddress();
  console.log("✔ MockUNI deployed at:", uniAddress);

  // 2. Deploy Mock DEX Router
  console.log("\n🔄 Deploying Mock DEX Router...");
  const MockDEXRouter = await hre.ethers.getContractFactory("MockDEXRouter");
  const dexRouter = await MockDEXRouter.deploy();
  await dexRouter.waitForDeployment();
  const dexRouterAddress = await dexRouter.getAddress();
  console.log("✔ MockDEXRouter deployed at:", dexRouterAddress);

  // 3. Deploy BasketLoopManager
  console.log("\n🧺 Deploying BasketLoopManager...");
  const BasketLoopManager = await hre.ethers.getContractFactory("BasketLoopManager");
  const basketManager = await BasketLoopManager.deploy(
    dexRouterAddress,
    keeperAddress,
    deployer.address
  );
  await basketManager.waitForDeployment();
  const basketManagerAddress = await basketManager.getAddress();
  console.log("✔ BasketLoopManager deployed at:", basketManagerAddress);

  // 4. Seed DEX Liquidity Pools
  console.log("\n💧 Seeding Mock DEX Router Liquidity Pools...");
  const tx1 = await weth.mint(dexRouterAddress, hre.ethers.parseUnits("10000", 18));
  await tx1.wait();
  const tx2 = await arb.mint(dexRouterAddress, hre.ethers.parseUnits("500000", 18));
  await tx2.wait();
  const tx3 = await link.mint(dexRouterAddress, hre.ethers.parseUnits("100000", 18));
  await tx3.wait();
  const tx4 = await uni.mint(dexRouterAddress, hre.ethers.parseUnits("50000", 18));
  await tx4.wait();
  const tx5 = await usdc.mint(dexRouterAddress, hre.ethers.parseUnits("1000000", 6));
  await tx5.wait();
  const tx6 = await usdt.mint(dexRouterAddress, hre.ethers.parseUnits("1000000", 6));
  await tx6.wait();
  console.log("✔ DEX Router seeded with deep multi-token liquidity.");

  // 5. Fund Test Recipient (Deployer or user wallet)
  console.log(`\n💳 Minting Test Tokens to ${testRecipient}...`);
  const m1 = await usdc.mint(testRecipient, hre.ethers.parseUnits("10000", 6));
  await m1.wait();
  const m2 = await usdt.mint(testRecipient, hre.ethers.parseUnits("10000", 6));
  await m2.wait();
  const m3 = await weth.mint(testRecipient, hre.ethers.parseUnits("10", 18));
  await m3.wait();
  const m4 = await arb.mint(testRecipient, hre.ethers.parseUnits("500", 18));
  await m4.wait();
  console.log("✔ Recipient funded with 10,000 USDC, 10,000 USDT, 10 WETH, 500 ARB.");

  // 6. Write Deployment Manifest
  const manifest = {
    network: networkName,
    chainId: Number(chainId),
    deployedAt: new Date().toISOString(),
    rpcUrl: rpcUrl,
    explorer: explorerUrl || null,
    faucets: faucets,
    alternateRpcs: LIVE_RPCS[networkName] || [],
    deployer: deployer.address,
    keeperWallet: keeperAddress,
    contracts: {
      BasketLoopManager: basketManagerAddress,
      MockDEXRouter: dexRouterAddress,
      MockUSDC: usdcAddress,
      MockUSDT: usdtAddress,
      MockWETH: wethAddress,
      MockARB: arbAddress,
      MockLINK: linkAddress,
      MockUNI: uniAddress,
    },
  };

  const manifestPath = path.join(__dirname, "..", "..", "deployments.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log("\n📄 Deployment manifest generated at:", manifestPath);

  console.log("\n==================================================");
  console.log("🎉 Testnet Deployment & Seeding Completed Successfully!");
  console.log("==================================================");
  if (explorerUrl) {
    console.log(`\n🔍 View on Block Explorer:`);
    console.log(`   BasketLoopManager: ${explorerUrl}/address/${basketManagerAddress}`);
    console.log(`   MockDEXRouter:     ${explorerUrl}/address/${dexRouterAddress}`);
  }
  console.log("\n📋 Environment Setup Suggestions:");
  console.log(`keeper/.env:`);
  console.log(`  RPC_URL=${rpcUrl}`);
  console.log(`  BASKET_LOOP_MANAGER_ADDRESS=${basketManagerAddress}`);
  console.log(`  KEEPER_PRIVATE_KEY=<your_keeper_private_key>`);
  console.log(`\nfrontend/lib/contracts.ts:`);
  console.log(`  basketLoopManager: "${basketManagerAddress}"`);
  console.log(`  dexRouter: "${dexRouterAddress}"`);

  return manifest;
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = main;
