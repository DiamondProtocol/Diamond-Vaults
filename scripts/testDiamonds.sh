#!/bin/sh

FORK=true npx hardhat test --network hardhat test/unit-tests/core/DiamondErc4626Vault.ts  
if [ $? -ne 0 ]; then
  echo "== DiamondErc4626Vault.ts unit test failed"
  exit 8
fi