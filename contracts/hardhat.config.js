require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Ensure private keys are properly 0x-prefixed 32-byte hex if provided
function getAccounts() {
  const accounts = [];
  const deployerPk = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (deployerPk && deployerPk.trim() !== "") {
    const formatted = deployerPk.trim().startsWith("0x") ? deployerPk.trim() : `0x${deployerPk.trim()}`;
    accounts.push(formatted);
  }
  const keeperPk = process.env.KEEPER_PRIVATE_KEY;
  if (keeperPk && keeperPk.trim() !== "") {
    const formatted = keeperPk.trim().startsWith("0x") ? keeperPk.trim() : `0x${keeperPk.trim()}`;
    accounts.push(formatted);
  }
  return accounts;
}

const accounts = getAccounts();

// Choose default target network:
// 1. If running automated tests ('hardhat test'), default to the ephemeral in-memory 'hardhat' network.
// 2. Otherwise default to DEPLOY_NETWORK / DEFAULT_NETWORK, or 'robinhoodTestnet' for public testnet deployment.
const isTesting = process.argv.some((arg) => arg === "test");
const defaultNetwork = isTesting
  ? "hardhat"
  : (process.env.DEPLOY_NETWORK || process.env.DEFAULT_NETWORK || "robinhoodTestnet");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  defaultNetwork,
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: accounts.length > 0 ? accounts : undefined,
    },
    robinhoodTestnet: {
      url: process.env.ROBINHOOD_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com/rpc",
      chainId: parseInt(process.env.ROBINHOOD_TESTNET_CHAIN_ID || "46630", 10),
      accounts: accounts.length > 0 ? accounts : undefined,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
