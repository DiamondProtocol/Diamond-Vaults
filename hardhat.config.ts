import '@nomiclabs/hardhat-waffle';
import "@nomiclabs/hardhat-etherscan";
import '@typechain/hardhat';
import "solidity-coverage"
import "hardhat-prettier";
import "hardhat-contract-sizer"
import "@nomiclabs/hardhat-vyper";
import "hardhat-gas-reporter";

import * as fs from 'fs';
import * as dotenv from 'dotenv'

dotenv.config()

const mnemonic = fs.existsSync('.secret')
  ? fs
    .readFileSync('.secret')
    .toString()
    .trim()
  : "test test test test test test test test test test test junk"

const alchemyKey = process.env.ALCHEMY_KEY
const optimismKey = process.env.OPTIMISM_KEY
const etherscanKey = process.env.ETHERSCAN_KEY

let hnetwork = "eth"
if (process.env.HNETWORK) {
  hnetwork = process.env.HNETWORK
}
let hardHatForkingSettings = {}
switch (hnetwork) {
  case 'eth':
    hardHatForkingSettings = {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${alchemyKey}`,
        enabled: process.env.FORK === 'true',
        blockNumber: 13989155,
      }
    }
    break
  case 'opt':
    hardHatForkingSettings = {
      forking: {
        url: `https://opt-mainnet.g.alchemy.com/v2/${optimismKey}`,
        enabled: process.env.FORK === 'true',
        blockNumber: 9086000,
      },
      gasPrice: 10000
    }
    break
  default:
    console.log(`network ${hnetwork} not supported`)
}

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

export default {
  networks: {
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${alchemyKey}`,
      // If there is error, paste the key directly instead of using alchemyKey
      gasPrice: 35000000000,
      accounts: [],
    },
    optimism: {
      url: `https://opt-mainnet.g.alchemy.com/v2/${optimismKey}`,
      // If there is error, paste the key directly instead of using alchemyKey
      // gasPrice: 35000000000,
      accounts: [],
    },
    hardhat: {
      ...hardHatForkingSettings,
      initialBaseFeePerGas: 0,
      // gas: 12000000,
      // blockGasLimit: 0x1fffffffffffff,
      // allowUnlimitedContractSize: true,
    },
    hh: {
      url: `http://0.0.0.0:8545`,
      accounts: {
        mnemonic: mnemonic,
      },
      timeout: 1400000
    },
    ropsten: {
      url: `https://eth-ropsten.alchemyapi.io/v2/${alchemyKey}`,
      accounts: {
        mnemonic: mnemonic,
      },
    },
    kovan: {
      url: `https://eth-kovan.alchemyapi.io/v2/${alchemyKey}`,
      accounts: {
        mnemonic: mnemonic,
      },
    },
  },
  solidity: {
    compilers: [
      {
        version: '0.7.6', 
        settings: {
          optimizer: {
            enabled: true,
            runs: 1
          }
        },
      }
    ],
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5',
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
    only: ['Vault'],
  },
  etherscan: {
    apiKey: etherscanKey
  },
  mocha: {
    timeout: 150000
  },
  gasReporter: {
    enabled: false,
    token: 'ETH',
    gasPrice: 57
  },
  vyper: {
    compilers: [{ version: "0.2.12" }],
  },
};