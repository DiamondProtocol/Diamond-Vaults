// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.2;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {BaseStrategy, StrategyParams, VaultAPI} from "../core/BaseStrategy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "hardhat/console.sol";


// Mock File: Strategy.sol

contract MockYnStrategy is BaseStrategy {
	using SafeMath for uint256;

	uint256 public mockHavestProfit;
	uint256 public mockHavestLoss;
	uint256 public mockLiquidatedAmount;
	uint256 public mockLiquidatedLoss;


	constructor(address _vault) public BaseStrategy(_vault) {
	}

	function liquidateAllPositions() internal virtual override returns (uint256 _amountFreed) {
		return 0;
	}
	function adjustPosition(uint256 _debtOutstanding) internal virtual override {}

	function estimatedTotalAssets() public virtual override view returns (uint256) {
		return IERC20(want).balanceOf(address(this));
	}

	function harvest() external virtual override onlyKeepers {
		uint256 profit = mockHavestProfit;
		uint256 loss = mockHavestLoss;
		uint256 debtOutstanding = vault.debtOutstanding(address(this));
		uint256 debtPayment = debtOutstanding;
		debtOutstanding = vault.report(profit, loss, debtPayment);

		// Check if free returns are left, and re-invest them
		adjustPosition(debtOutstanding);

		emit Harvested(profit, loss, debtPayment, debtOutstanding);
		
		// reset to zero in the end
		mockHavestProfit = 0;
		mockHavestLoss = 0;
	}


	function liquidatePosition(uint256 _amountNeeded) internal virtual override returns (uint256 _liquidatedAmount, uint256 _loss) {
		return (mockLiquidatedAmount, mockLiquidatedLoss);
	}

	function prepareReturn(uint256 _debtOutstanding)
		internal
		virtual
		override
		returns (
			uint256 _profit,
			uint256 _loss,
			uint256 _debtPayment
		){
		return (0, 0, 0);
	}

	function protectedTokens() internal view virtual override returns (address[] memory) {
		address[] memory x;
		x[0] = address(0);
		return x;
	}

	// mock setter
	function setHarvestMockData(uint256 _profit, uint256 _loss) external returns(uint256, uint256) {
		mockHavestProfit = _profit;
		mockHavestLoss = _loss;
		return (mockHavestProfit, mockHavestLoss);
	}

	function setLiquidatedMockData(uint256 _amount, uint256 _loss) external returns(uint256, uint256) {
		mockLiquidatedAmount = _amount;
		mockLiquidatedLoss = _loss;
		return (mockLiquidatedAmount, mockLiquidatedLoss);
	}

	// for mock test loss situation
	function burnAsset(uint256 _amount) external {
		SafeERC20.safeTransfer(want, msg.sender, _amount);
	}

}

