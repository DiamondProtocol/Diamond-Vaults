// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

abstract contract ERC4626 is ERC20Upgradeable {

  /*///////////////////////////////////////////////////////////////
                                EVENTS
  //////////////////////////////////////////////////////////////*/

  event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares);

  event Withdraw(
    address indexed caller,
    address indexed receiver,
    address indexed owner,
    uint256 assets,
    uint256 shares
  );

  /*///////////////////////////////////////////////////////////////
                      DEPOSIT/WITHDRAWAL LOGIC
  //////////////////////////////////////////////////////////////*/

  function deposit(uint256 assets, address receiver) public virtual returns (uint256 shares) {}

  function mint(uint256 shares, address receiver) public virtual returns (uint256 assets) {}

  function withdraw(uint256 assets, address receiver, address owner) public virtual returns (uint256 shares) {}

  function redeem( uint256 shares, address receiver, address owner ) public virtual returns (uint256 assets) {}

  /*///////////////////////////////////////////////////////////////
                          ACCOUNTING LOGIC
  //////////////////////////////////////////////////////////////*/

  function totalAssets() public view virtual returns (uint256);

  function convertToShares(uint256 assets) public view virtual returns (uint256) {}

  function convertToAssets(uint256 shares) public view virtual returns (uint256) {}

  function previewDeposit(uint256 assets) public view virtual returns (uint256) {}

  function previewMint(uint256 shares) public view virtual returns (uint256) {}

  function previewWithdraw(uint256 assets) public view virtual returns (uint256) {}

  function previewRedeem(uint256 shares) public view virtual returns (uint256) {}

  /*///////////////////////////////////////////////////////////////
                    DEPOSIT/WITHDRAWAL LIMIT LOGIC
  //////////////////////////////////////////////////////////////*/

  function maxDeposit(address receiver) public view virtual returns (uint256) {}
  function maxMint(address receiver) public view virtual returns (uint256) {}
  function maxWithdraw(address owner) public view virtual returns (uint256) {}
  function maxRedeem(address owner) public view virtual returns (uint256) {}

  /*///////////////////////////////////////////////////////////////
                        INTERNAL HOOKS LOGIC
  //////////////////////////////////////////////////////////////*/

  function beforeWithdraw(uint256 assets, uint256 shares) internal virtual {}
  function afterDeposit(uint256 assets, uint256 shares) internal virtual {}
}