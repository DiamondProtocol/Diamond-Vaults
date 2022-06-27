import { ethers, network } from "hardhat";
import { BigNumber, utils } from "ethers";
const { expect } = require('chai');
import {
  DiamondErc4626Vault,
  IERC20Detailed,
  MockYnStrategy,
} from "../../../typechain";

describe('DiamondErc4626Vault', function() {
  const usdtAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';
  const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const usdcDecimal = '6';
  const usdcDecimalWei = BigNumber.from('10').pow(usdcDecimal);
  // const wethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const MAXBPS = BigNumber.from("10000");

  let _shadowman: any, owner:any, management:any, feeRecipient:any, depositor1:any,
      depositor2:any, depositor3: any, strategyOwner1:any, strategyOwner2:any, strategyOwner3: any,
      testuser1:any, testuser2:any;
  let usdcSigner;
  let ynVyperContract: DiamondErc4626Vault, vault2Contract: DiamondErc4626Vault, usdcContract: IERC20Detailed; 
  let strategyYContract: MockYnStrategy, strategyV2Contract: MockYnStrategy, strategyVContract: MockYnStrategy;
  this.beforeAll('Set accounts', async () => {
    var accounts : any = await ethers.getSigners();
    [ _shadowman, owner, management, feeRecipient,
      depositor1, depositor2, depositor3,
      strategyOwner1, strategyOwner2, strategyOwner3,
      testuser1, testuser2 ] = accounts;
    const usdcHolderAddress = '0x6262998Ced04146fA42253a5C0AF90CA02dfd2A3';
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [usdcHolderAddress],
    });
    usdcSigner = await ethers.getSigner(
      usdcHolderAddress
    );
    // some some USDC to depositer
    usdcContract = await ethers.getContractAt('IERC20Detailed', usdcAddress) as IERC20Detailed;
    await usdcContract.connect(usdcSigner).transfer(depositor1.address, BigNumber.from(5000).mul(usdcDecimalWei));
    await usdcContract.connect(usdcSigner).transfer(depositor2.address, BigNumber.from(5000).mul(usdcDecimalWei));
  });

  this.beforeAll('deploy vault', async() => {
    // init
    const depositLimit : BigNumber = BigNumber.from(1000).mul(usdcDecimalWei);
    const contractV = await ethers.getContractFactory('DiamondErc4626Vault');
    vault2Contract = await contractV.connect(owner).deploy() as DiamondErc4626Vault;
    await vault2Contract.connect(owner).initialize(usdcAddress, owner.address, management.address, feeRecipient.address, 'DiamondErc4626Vault', 'DE4626');
    await vault2Contract.connect(owner).setDepositLimit(depositLimit);

    // other contract for test
    ynVyperContract = await contractV.connect(owner).deploy() as DiamondErc4626Vault;
    await ynVyperContract.connect(owner).initialize(usdcAddress, owner.address, management.address, feeRecipient.address, 'DiamondErc4626VaultOther', 'DE4626ot');
    await ynVyperContract.connect(owner).setDepositLimit(depositLimit);
  });

  this.beforeAll('deploy strategy', async() => {
    const stContract = await ethers.getContractFactory('MockYnStrategy');
    strategyYContract = await stContract.connect(strategyOwner1).deploy(ynVyperContract.address) as MockYnStrategy;

    const stContract2 = await ethers.getContractFactory('MockYnStrategy');
    strategyVContract = await stContract2.connect(strategyOwner2).deploy(vault2Contract.address) as MockYnStrategy;
    strategyV2Contract = await stContract2.connect(strategyOwner3).deploy(vault2Contract.address) as MockYnStrategy;
  });

  /* ========================================= focus on Withdraw & Depoist Test [START] ============================================= */
  it('deposit some usdc to vaults', async() => {
    // depsoit some usdc to Yearn vyper vault
    const depositAmount = BigNumber.from(100).mul(usdcDecimalWei);
    const maxDepositAmountBeforeDeposit = await vault2Contract.maxDeposit(depositor2.address);

    // depsoit some usdc to DiamondErc4626Vault
    await usdcContract.connect(depositor2).approve(vault2Contract.address, await usdcContract.balanceOf(depositor2.address));
    await vault2Contract.connect(depositor2).deposit(depositAmount, depositor2.address);
    const dep2BalanceOfDiamondErc4626Vault = await vault2Contract.balanceOf(depositor2.address);
    expect(depositAmount).to.be.eq(dep2BalanceOfDiamondErc4626Vault);
    // _totalAssets = (await vault2Contract.totalSupply()).add(await vault2Contract.totalDebt())
    expect((await vault2Contract.totalSupply()).add(await vault2Contract.totalDebt())).to.be.eq(depositAmount);
    // share price = 1 usdc
    expect(await vault2Contract.pricePerShare()).to.be.eq(usdcDecimalWei);
    // test maxDeposit
    const maxDepositAmountAfterDeposit = await vault2Contract.maxDeposit(depositor2.address);
    expect(maxDepositAmountAfterDeposit).to.be.eq(maxDepositAmountBeforeDeposit.sub(depositAmount));

    // deposit over limit
    await expect(vault2Contract.connect(depositor2).deposit(maxDepositAmountAfterDeposit.add(1), depositor2.address)).to.be.reverted;
    // share price = 1 usdc
    expect(await vault2Contract.pricePerShare()).to.be.eq(usdcDecimalWei);
  });

  it('test addStrategy to vault', async () => {
    const debtRatio = 3000; // 30%
    const maxAmountPerHavest =  BigNumber.from(10000).mul(usdcDecimalWei);
    // addStrategy with not owner
    await expect(vault2Contract.connect(depositor2).addStrategy(strategyVContract.address, debtRatio, 0, maxAmountPerHavest, 0)).to.be.reverted;
    // addStrategy with different vault address
    await expect(vault2Contract.connect(owner).addStrategy(strategyYContract.address, debtRatio, 0, maxAmountPerHavest, 0)).to.be.reverted;
    // addStrategy with wrong Havest amount
    await expect(vault2Contract.connect(owner).addStrategy(strategyVContract.address, debtRatio, maxAmountPerHavest, 0, 0)).to.be.reverted;
    // addStrategy with wrong debtRatio
    await expect(vault2Contract.connect(owner).addStrategy(strategyVContract.address, 30000, 0, maxAmountPerHavest, 0)).to.be.reverted;
    // addStrategy in DiamondErc4626Vault
    await vault2Contract.connect(owner).addStrategy(strategyVContract.address, debtRatio, 0, maxAmountPerHavest, 0);
    await vault2Contract.connect(management).addStrategy(strategyV2Contract.address, 0, 0, maxAmountPerHavest, 0);
    expect((await vault2Contract.withdrawalQueue(0)) == strategyVContract.address);
    expect((await vault2Contract.withdrawalQueue(1)) == strategyV2Contract.address);
  });

  it('harvest and report to vault', async () => {
    const usdcBalanceOfDiamondErc4626VaultBeforeReport = await usdcContract.balanceOf(vault2Contract.address);
    const totalSupply = await vault2Contract.totalSupply();
    expect(await vault2Contract.debtOutstanding(strategyVContract.address)).to.be.eq(0);
    // 30% debtRatio of strategy
    const willGive2Strategy = usdcBalanceOfDiamondErc4626VaultBeforeReport.div(100).mul(30);
    // expect(await vault2Contract.creditAvailable(strategyVContract.address)).to.be.eq(willGive2Strategy);

    // harvest on DiamondErc4626Vault
    await strategyVContract.connect(strategyOwner2).harvest();
    expect(await usdcContract.balanceOf(strategyVContract.address)).to.be.eq(BigNumber.from(30).mul(usdcDecimalWei));
    // totalSupply should the same
    expect(await vault2Contract.totalSupply()).to.be.eq(totalSupply);
    const pricePerShare = await vault2Contract.pricePerShare();
    // after harvest share vault should the same
    expect((await vault2Contract.totalSupply()).mul(pricePerShare).div(usdcDecimalWei)).to.be.eq(usdcBalanceOfDiamondErc4626VaultBeforeReport);
    const vaultTotalSupply = await vault2Contract.totalSupply();
    expect(await vault2Contract.maxAvailableShares()).to.be.eq(vaultTotalSupply);
  });

  it('add strategy to withdrawQueue', async () => {
    expect((await vault2Contract.withdrawalQueue(0)) == strategyVContract.address);

    // add strategy not exiting on vault
    await expect(vault2Contract.connect(owner).addStrategyToQueue(strategyYContract.address)).to.be.reverted;

    // reverst becuase already existing. because addStrategy will also add into queue
    await expect(vault2Contract.connect(owner).addStrategyToQueue(strategyVContract.address)).to.be.reverted;
  });

  it('test EIP4626 view functions', async () => {
    const depositLimit = await vault2Contract.depositLimit();
    const maxDepositCal = depositLimit.sub(await vault2Contract.totalAssets());
    const maxDepositCalShareVal = await vault2Contract.convertToShares(maxDepositCal);
    expect(await vault2Contract.maxDeposit(depositor2.address)).to.be.eq(maxDepositCal);
    expect(await vault2Contract.maxMint(depositor2.address)).to.be.eq(
      await vault2Contract.convertToShares(maxDepositCal)
    );
    expect(await vault2Contract.previewDeposit(maxDepositCal.div(2))).to.be.eq(maxDepositCalShareVal.div(2));
    expect(await vault2Contract.previewDeposit(maxDepositCal)).to.be.eq(maxDepositCalShareVal);

    expect(await vault2Contract.previewMint(maxDepositCalShareVal.div(2))).to.be.eq(maxDepositCal.div(2));
    expect(await vault2Contract.previewMint(maxDepositCalShareVal)).to.be.eq(maxDepositCal);

    const usdcBalanceOfVault = await usdcContract.balanceOf(vault2Contract.address);
    const shareOfDepositor2 = await vault2Contract.balanceOf(depositor2.address);
    const shareVauleOfDepositor2 = await vault2Contract.convertToAssets(shareOfDepositor2);
    // console.log(usdcBalanceOfVault, shareOfDepositor2);
    expect(usdcBalanceOfVault).to.be.lt(shareVauleOfDepositor2);
    const shareVauleOfusdcBalanceOfVault= await vault2Contract.convertToShares(usdcBalanceOfVault);
    // revert return 0
    expect(await vault2Contract.previewWithdraw(shareVauleOfDepositor2)).to.be.eq(0);
    expect(await vault2Contract.previewWithdraw(usdcBalanceOfVault.div(2))).to.be.eq(shareVauleOfusdcBalanceOfVault.div(2));
    expect(await vault2Contract.previewWithdraw(usdcBalanceOfVault)).to.be.eq(shareVauleOfusdcBalanceOfVault);
    // revert return 0
    expect(await vault2Contract.previewWithdraw(usdcBalanceOfVault.add(1))).to.be.eq(0);
    
    // revert return 0
    expect(await vault2Contract.previewRedeem(shareOfDepositor2)).to.be.eq(0);
    expect(await vault2Contract.previewRedeem(shareVauleOfusdcBalanceOfVault.div(2))).to.be.eq(usdcBalanceOfVault.div(2));
    expect(await vault2Contract.previewRedeem(shareVauleOfusdcBalanceOfVault)).to.be.eq(usdcBalanceOfVault);
    // revert return 0
    expect(await vault2Contract.previewRedeem(shareVauleOfusdcBalanceOfVault.add(1))).to.be.eq(0);
    
    // another account deposit small amount
    const dpAmount = BigNumber.from(1).mul(usdcDecimalWei);
    await usdcContract.connect(depositor1).approve(vault2Contract.address, dpAmount);
    await vault2Contract.connect(depositor1).deposit(dpAmount, depositor1.address);

    // setEmergencyShutdown on 
    await vault2Contract.connect(owner).setEmergencyShutdown(true);
    expect(await vault2Contract.previewWithdraw(usdcBalanceOfVault)).to.be.eq(0);
    expect(await vault2Contract.previewRedeem(shareVauleOfusdcBalanceOfVault)).to.be.eq(0);
    expect(await vault2Contract.maxWithdraw(depositor2.address)).to.be.eq(0);
    expect(await vault2Contract.maxRedeem(depositor2.address)).to.be.eq(0);
    // setEmergencyShutdown off
    await vault2Contract.connect(owner).setEmergencyShutdown(false);
    expect(await vault2Contract.maxWithdraw(depositor2.address)).to.be.eq(
      await usdcContract.balanceOf(vault2Contract.address)
    );
    expect(await vault2Contract.maxRedeem(depositor2.address)).to.be.eq(
      await vault2Contract.convertToAssets(
        await usdcContract.balanceOf(vault2Contract.address)
      )
    );
    // small amount test
    expect(await vault2Contract.maxWithdraw(depositor1.address)).to.be.eq(
      await vault2Contract.convertToShares(
        await vault2Contract.balanceOf(depositor1.address)
      )
    );
    expect(await vault2Contract.maxRedeem(depositor1.address)).to.be.eq(
      await vault2Contract.convertToAssets(
        await vault2Contract.balanceOf(depositor1.address)
      )
    );
    // withdraw deposit amount of depositor1
    await vault2Contract.connect(depositor1)["withdraw(uint256,address,address)"](dpAmount, depositor1.address, depositor1.address);
  });

  it('test withdraw on DiamondErc4626Vault without withdrawQueue fund', async () => {
    // console.log(await vault2Contract.totalAssets());
    const sharesOfDepo2Before = await vault2Contract.balanceOf(depositor2.address);
    const pricePerShare = await vault2Contract.pricePerShare();
    const maxWithdrawVault = sharesOfDepo2Before.mul(pricePerShare).div(usdcDecimalWei)
    expect(maxWithdrawVault).to.be.eq("100000000");

    const usdcBalanceOfStrategyVContract = await usdcContract.balanceOf(strategyVContract.address);

    // callStatic before real run. over usdcContract fund of vault2Contract. should got revert
    let assetsWantWithdraw = sharesOfDepo2Before.div(100).mul(70);
    await expect(vault2Contract.connect(depositor2).callStatic["withdraw(uint256,address,address)"](assetsWantWithdraw.add(1), depositor2.address, depositor2.address)).to.be.reverted;
    assetsWantWithdraw = await usdcContract.balanceOf(vault2Contract.address);
    await expect(vault2Contract.connect(depositor2).callStatic["withdraw(uint256,address,address)"](assetsWantWithdraw.add(1), depositor2.address, depositor2.address)).to.be.reverted;

    // withdrw all
    await vault2Contract.connect(depositor2)["withdraw(uint256,address,address)"](assetsWantWithdraw, depositor2.address, depositor2.address);
    // usdc fund of strategy should same as before
    expect(await usdcContract.balanceOf(strategyVContract.address)).to.be.eq(usdcBalanceOfStrategyVContract);
    expect(await usdcContract.balanceOf(vault2Contract.address)).to.be.eq(0);

    let sharesOfDepo2After = await vault2Contract.balanceOf(depositor2.address);
    // check total usdc amount of depositor2
    expect(sharesOfDepo2After.add(assetsWantWithdraw)).to.be.eq(sharesOfDepo2Before);

    // deposit withdraw fund back
    await usdcContract.connect(depositor2).approve(vault2Contract.address, assetsWantWithdraw);
    await vault2Contract.connect(depositor2).deposit(assetsWantWithdraw, depositor2.address);
    expect(await usdcContract.balanceOf(vault2Contract.address)).to.be.eq(assetsWantWithdraw);
  });

  it('test withdraw on DiamondErc4626Vault with withdrawQueue fund', async () => {
    const sharesOfDepo2 = await vault2Contract.balanceOf(depositor2.address);
    const pricePerShare = await vault2Contract.pricePerShare();
    const maxWithdrawVaultDepositor2 = sharesOfDepo2.mul(pricePerShare).div(usdcDecimalWei)
    expect(maxWithdrawVaultDepositor2).to.be.eq("100000000");

    const usdcBalanceOfDiamondErc4626VaultContract = await usdcContract.balanceOf(vault2Contract.address);
    // callStatic before real run
    let witdrawVault0 = await vault2Contract.connect(depositor2).callStatic["withdraw(uint256,address,address,uint256)"](maxWithdrawVaultDepositor2.div(100).mul(70), testuser1.address, depositor2.address, 0);
    // becuase strategy's Liquity is 0. so maximum withdraw is 70%
    expect(witdrawVault0.eq(maxWithdrawVaultDepositor2.div(100).mul(70))).to.be.true;
    
    // withdrw 80% of shares
    const shareVaultWorth = maxWithdrawVaultDepositor2.div(100).mul(80);

    // pricePerShare keep 1:1
    expect(await vault2Contract.pricePerShare()).to.be.eq(usdcDecimalWei);

    // // mock set Liquidated amount 8% and Liquidated loss 1%
    const withdrawSupplyAmount = shareVaultWorth.sub(await usdcContract.balanceOf(vault2Contract.address));
    // console.log('shareVaultWorth', shareVaultWorth);
    const withdrawFundFromStrategyLossFund = shareVaultWorth.div(100).mul(1); // loss 1%
    const withdrawFundFromStrategy = withdrawSupplyAmount.sub(withdrawFundFromStrategyLossFund);
    // console.log('withdrawFundFromStrategy', withdrawFundFromStrategy, withdrawFundFromStrategyLossFund);
    await strategyVContract.connect(_shadowman).setLiquidatedMockData(withdrawFundFromStrategy, withdrawFundFromStrategyLossFund);

    // so withdraw will failed. cause of maxLoss
    await expect(vault2Contract.connect(depositor2)["withdraw(uint256,address,address,uint256)"](shareVaultWorth, testuser1.address, depositor2.address, 50)).to.be.reverted; // 0.5%
    // mock loss for test withdraw maxLoss
    await strategyVContract.connect(_shadowman).burnAsset(withdrawFundFromStrategyLossFund);
    const _strategy = (await vault2Contract.strategies(strategyVContract.address));
    const totalLossBeforeStrategy = _strategy.totalLoss;
    // 1% loss accpet. it's successed!
    const vaultDebtRatioBefore = await vault2Contract.debtRatio();
    const vaultTotalDebtBefore = await vault2Contract.totalDebt();
    const totalAssetsBefore = await vault2Contract.totalAssets();
    const totalSupplyBefore = await vault2Contract.totalSupply();
    const tx = await vault2Contract.connect(depositor2)["withdraw(uint256,address,address,uint256)"](shareVaultWorth, testuser1.address, depositor2.address, 100);
    const receipt = await tx.wait();
    const withdrawEvnets : any = receipt.events?.filter((e) => e.event === 'Withdraw').map((e) => e.args);
    let _sender, _recevier, _owner, _assets, _shares;
    [_sender, _recevier, _owner, _assets, _shares] = withdrawEvnets[0];
    expect(_sender).to.be.eq(depositor2.address);
    expect(_recevier).to.be.eq(testuser1.address);
    expect(_owner).to.be.eq(depositor2.address);
    expect(await usdcContract.balanceOf(testuser1.address)).to.be.eq(_assets);
    expect(await vault2Contract.totalAssets()).to.be.eq(totalAssetsBefore.sub(_assets).sub(withdrawFundFromStrategyLossFund));
    expect(await vault2Contract.totalSupply()).to.be.eq(totalSupplyBefore.sub(_shares));

    expect(vaultDebtRatioBefore).to.be.not.eq(await vault2Contract.debtRatio());
    expect(vaultTotalDebtBefore).to.be.not.eq(await vault2Contract.totalDebt());
    expect(
      (await vault2Contract.strategies(strategyVContract.address)).totalLoss.sub(totalLossBeforeStrategy)
    ).to.be.eq(withdrawFundFromStrategyLossFund);
  });

  it('check strategy status after withdraw with maxLoss success', async () => {
    // withdraw all usdc of vault balance
    expect(await usdcContract.balanceOf(vault2Contract.address)).to.be.eq(0);

    const vaultDebtRatio = await vault2Contract.debtRatio();
    const _strategy = (await vault2Contract.strategies(strategyVContract.address));
    expect(await usdcContract.balanceOf(strategyVContract.address)).to.be.eq(_strategy.totalDebt);
    expect(vaultDebtRatio).to.be.eq(_strategy.debtRatio);
  });

  it('harvest and report to vault', async () => {
    const usdcBalanceOfStrategyBeforeReport = await usdcContract.balanceOf(strategyVContract.address);
    const strategis = (await vault2Contract.strategies(strategyVContract.address)).debtRatio;
    const debtOutstandingBeforeHarvest = await vault2Contract.debtOutstanding(strategyVContract.address);
    const debtOutstandingCal = usdcBalanceOfStrategyBeforeReport.mul(MAXBPS.sub(strategis)).div(MAXBPS);
    expect(debtOutstandingCal).to.be.eq(debtOutstandingBeforeHarvest);

    // harvest on DiamondErc4626Vault
    // take fund back to vault by debtratio rate
    await strategyVContract.connect(strategyOwner2).harvest();
    expect(await usdcContract.balanceOf(vault2Contract.address)).to.be.eq(debtOutstandingBeforeHarvest);

    // pricePerShare keep 1:1
    expect(await vault2Contract.pricePerShare()).to.be.eq(usdcDecimalWei);
  });

  it('deposit (mint) more usdc to vaults and do withdraw with many ways', async() => {
    const usdcBalanceOfDepositor1Before = await usdcContract.balanceOf(depositor1.address);
    const usdcBalanceOfVaultBefore = await usdcContract.balanceOf(vault2Contract.address);
    const maxDepositAmount = await vault2Contract.maxDeposit(depositor1.address);
    const maxDepositAmountShares = await vault2Contract.convertToShares(maxDepositAmount);
    
    // approve first
    await usdcContract.connect(depositor1).approve(vault2Contract.address, usdcBalanceOfDepositor1Before);
    // test mint for deposit fund
    await expect(vault2Contract.connect(depositor1).mint(maxDepositAmountShares.add(1), depositor1.address)).to.be.reverted;
    await vault2Contract.connect(depositor1).mint(maxDepositAmountShares, depositor1.address);
    // console.log(await vault2Contract.balanceOf(depositor1.address));

    // approve 50% share for deposit3
    const allowanceAmount = maxDepositAmountShares.div(2);
    await vault2Contract.connect(depositor1).approve(depositor3.address, maxDepositAmountShares.div(2));
    expect(await vault2Contract.connect(depositor3).allowance(depositor1.address, depositor3.address)).to.be.eq(allowanceAmount);

    // test redeem
    await expect(vault2Contract.connect(depositor3).redeem(allowanceAmount.add(1), depositor3.address, depositor1.address)).to.be.reverted;
    await vault2Contract.connect(depositor3).redeem(allowanceAmount, depositor1.address, depositor1.address);
    expect(await vault2Contract.connect(depositor3).allowance(depositor1.address, depositor3.address)).to.be.eq(0);

    // withdraw small share from depositor3. but depositor3 don't have any shares
    await expect(vault2Contract.connect(depositor3).redeem(1, depositor3.address, depositor3.address)).to.be.reverted;
    await expect(vault2Contract.connect(depositor3)['withdraw(uint256,address,address)'](1, depositor3.address, depositor3.address)).to.be.reverted;

    let withdrawAssetsAmount = await vault2Contract.connect(depositor1).balanceOf(depositor1.address);
    // because currently priceShare 1:1
    expect(await vault2Contract.pricePerShare()).to.be.eq(usdcDecimalWei);
    expect(withdrawAssetsAmount).to.be.eq(allowanceAmount);
    // console.log(await usdcContract.balanceOf(depositor1.address));

    await expect(vault2Contract.connect(depositor1)['withdraw(uint256,address,address)'](withdrawAssetsAmount.add(1), depositor1.address, depositor1.address)).to.be.reverted;
    // after withdraw all fund back to depositor1, all status should reset same as before
    await vault2Contract.connect(depositor1)['withdraw(uint256,address,address)'](withdrawAssetsAmount, depositor1.address, depositor1.address);
    expect(await vault2Contract.connect(depositor1).balanceOf(depositor1.address)).to.be.eq(0);
    // console.log(await usdcContract.balanceOf(depositor1.address));
    expect(await usdcContract.balanceOf(depositor1.address)).to.be.eq(usdcBalanceOfDepositor1Before);
    expect(await usdcContract.balanceOf(vault2Contract.address)).to.be.eq(usdcBalanceOfVaultBefore);
    expect(await vault2Contract.maxDeposit(depositor1.address)).to.be.eq(maxDepositAmount);
    expect(await vault2Contract.convertToShares(maxDepositAmount)).to.be.eq(maxDepositAmountShares);
    // pricePerShare keep 1:1
    expect(await vault2Contract.pricePerShare()).to.be.eq(usdcDecimalWei);
  });

  it('test withdraw with many ways with depositor2 and depositor3', async() => {
    const depositor2SharesBalanceOfVaultBefore = await vault2Contract.balanceOf(depositor2.address);
    const adjustAmountOfShare = depositor2SharesBalanceOfVaultBefore.div(2);
    // transfer all shares of depositor2 to depositor3
    expect(await vault2Contract.balanceOf(depositor3.address)).to.be.eq(0);
    await vault2Contract.connect(depositor2).transfer(depositor3.address, adjustAmountOfShare);
    expect(await vault2Contract.balanceOf(depositor3.address)).to.be.eq(await vault2Contract.balanceOf(depositor2.address));
    expect(await vault2Contract.balanceOf(depositor3.address)).to.be.eq(adjustAmountOfShare);
    await vault2Contract.connect(depositor2).approve(depositor3.address, depositor2SharesBalanceOfVaultBefore);
    await expect(vault2Contract.connect(depositor3).transferFrom(depositor2.address, depositor3.address, adjustAmountOfShare.add(1))).to.be.reverted;
    await vault2Contract.connect(depositor3).transferFrom(depositor2.address, depositor3.address, adjustAmountOfShare);
    expect(await vault2Contract.balanceOf(depositor2.address)).to.be.eq(0);
    
    // withdraw fund failed becuase of vault balance not enough for withdraw request
    const usdcBalanceOfVaultBefore = await usdcContract.balanceOf(vault2Contract.address);
    await vault2Contract.connect(depositor3).approve(depositor2.address, depositor2SharesBalanceOfVaultBefore);
    
    // call static for test withdraw
    // successed
    await vault2Contract.connect(depositor2).callStatic['withdraw(uint256,address,address)'](usdcBalanceOfVaultBefore, depositor2.address, depositor3.address);
    await vault2Contract.connect(depositor2).callStatic.redeem(
      await vault2Contract.convertToShares(usdcBalanceOfVaultBefore),
      depositor2.address, depositor3.address);
    // reverted
    await expect(vault2Contract.connect(depositor2)['withdraw(uint256,address,address)'](usdcBalanceOfVaultBefore.add(1), depositor2.address, depositor3.address)).to.be.reverted;
    await expect(vault2Contract.connect(depositor2).redeem(
      await vault2Contract.convertToShares(usdcBalanceOfVaultBefore.add(1)),
      depositor2.address, depositor3.address)).to.be.reverted;
    // withdraw some from vault
    await vault2Contract.connect(depositor2)['withdraw(uint256,address,address)'](
      usdcBalanceOfVaultBefore.div(2),
      depositor2.address, depositor3.address);
    expect(await usdcContract.balanceOf(vault2Contract.address)).to.be.eq(usdcBalanceOfVaultBefore.div(2));

    // withdraw all with withdraw allow maxLoss
    const usdcBalanceOfStrategyVContract = await usdcContract.balanceOf(strategyVContract.address);
    const lossLiquidateAmount = usdcBalanceOfStrategyVContract.div(10000).mul(100); // almost 1% loss
    await strategyVContract.connect(_shadowman).setLiquidatedMockData(
      usdcBalanceOfStrategyVContract.sub(lossLiquidateAmount), // almost 99%
      lossLiquidateAmount,
    )
    const totalAssetsOfVault = await vault2Contract.totalAssets();
    await vault2Contract.connect(depositor2)['withdraw(uint256,address,address,uint256)'](
      totalAssetsOfVault,
      depositor2.address,
      depositor3.address,
      "100" // 1%
    ); // test allowance
    // mock loss for test withdraw maxLoss
    await strategyVContract.connect(_shadowman).burnAsset(lossLiquidateAmount);

    // all equal to 0. clean all!
    expect(await vault2Contract.totalSupply()).to.be.eq(await vault2Contract.totalAssets());
    expect(await vault2Contract.totalAssets()).to.be.eq(await usdcContract.balanceOf(vault2Contract.address));
    expect(await usdcContract.balanceOf(strategyVContract.address)).to.be.eq(0);
    const _strategy = (await vault2Contract.strategies(strategyVContract.address));
    expect(_strategy.totalDebt).to.be.eq(0);
    // pricePerShare keep 1:1
    expect(await vault2Contract.pricePerShare()).to.be.eq(usdcDecimalWei);
  });

  it('increase test coverage for withdraw with loss', async () => {
    // despoit some fund into vault
    const dpAmount = BigNumber.from(900).mul(usdcDecimalWei);
    await usdcContract.connect(depositor1).approve(vault2Contract.address, dpAmount);
    await vault2Contract.connect(depositor1).deposit(dpAmount, depositor1.address);
    const dpAmount2 = BigNumber.from(50).mul(usdcDecimalWei);
    await usdcContract.connect(depositor2).approve(vault2Contract.address, dpAmount2);
    await vault2Contract.connect(depositor2).mint(await vault2Contract.convertToShares(dpAmount2), depositor2.address);

    // do not harvest on strategyVContract. for test need. keep totalDeb 0 on it

    let _strategy = (await vault2Contract.strategies(strategyV2Contract.address));
    const newRatio = MAXBPS.div(100).mul(25); //25%
    await expect(vault2Contract.connect(testuser1).updateStrategyDebtRatio(strategyV2Contract.address, newRatio)).to.be.reverted;
    await vault2Contract.connect(management).updateStrategyDebtRatio(strategyV2Contract.address, newRatio);
    _strategy = (await vault2Contract.strategies(strategyV2Contract.address));
    expect(_strategy.debtRatio).to.be.eq(newRatio);
    await expect(strategyV2Contract.connect(depositor1).harvest()).to.be.reverted;
    expect(
      await usdcContract.balanceOf(strategyV2Contract.address)
    ).to.be.eq(0);
    await strategyV2Contract.connect(strategyOwner3).harvest();
    expect(
      await usdcContract.balanceOf(strategyV2Contract.address)
    ).to.be.eq(
      (await vault2Contract.totalAssets()).div(MAXBPS).mul(newRatio)
    );
    // withdraw max usdc amount of vault for depositer1
    await vault2Contract.connect(depositor1)["withdraw(uint256,address,address)"](
      await vault2Contract.connect(depositor1).maxWithdraw(depositor1.address),
      depositor1.address,
      depositor1.address);
    expect(await usdcContract.balanceOf(vault2Contract.address)).to.be.eq(0);
    
    // withdraw failed because mock strategyVContract.setLiquidatedMockData not set
    // for enter _amountNeeded == 0 block
    await expect(
      vault2Contract.connect(depositor1)["withdraw(uint256,address,address,uint256)"](
        await vault2Contract.convertToShares(
          await vault2Contract.balanceOf(depositor1.address)
        ),
        depositor1.address,
        depositor1.address, 1000) // accpet loss 1%
    ).to.be.reverted;
    
    // withdraw failed because mock strategyVContract.setLiquidatedMockData not set
    // remove strategyV2Contract from Queue,to enter withdraw with maxLoss // _strategy == address(0) block
    await vault2Contract.connect(owner).removeStrategyFromQueue(strategyVContract.address);
    await vault2Contract.connect(owner).removeStrategyFromQueue(strategyV2Contract.address);
    expect(
      await vault2Contract.withdrawalQueue(0)
    ).to.be.eq('0x0000000000000000000000000000000000000000');
    await expect(
      vault2Contract.connect(depositor1)["withdraw(uint256,address,address,uint256)"](
        await vault2Contract.convertToShares(
          await vault2Contract.balanceOf(depositor1.address)
        ),
        depositor1.address,
        depositor1.address, 1000) // accpet loss 1%
    ).to.be.reverted;
    // add back
    await vault2Contract.addStrategyToQueue(strategyVContract.address);
    await vault2Contract.addStrategyToQueue(strategyV2Contract.address);
  });

  it('test insertStrategyToQueue function', async () => {
    let strategyInQueue0 = await vault2Contract.withdrawalQueue(0);
    let strategyInQueue1 = await vault2Contract.withdrawalQueue(1);

    // empty queue
    await vault2Contract.connect(owner).removeStrategyFromQueue(strategyVContract.address);
    await vault2Contract.connect(owner).removeStrategyFromQueue(strategyV2Contract.address);
    // will be auto shift to 0
    await vault2Contract.insertStrategyToQueue(strategyInQueue1, 1);
    expect(await vault2Contract.withdrawalQueue(0)).to.be.eq(strategyInQueue1);
    expect(await vault2Contract.withdrawalQueue(1)).to.be.eq('0x0000000000000000000000000000000000000000');

    // index 0 will be replace and current index shift
    await vault2Contract.insertStrategyToQueue(strategyInQueue0, 0);
    expect(await vault2Contract.withdrawalQueue(0)).to.be.eq(strategyInQueue0);
    expect(await vault2Contract.withdrawalQueue(1)).to.be.eq(strategyInQueue1);
    
    // index 0 will be replace and current index shift and delete duplication
    await vault2Contract.insertStrategyToQueue(strategyInQueue1, 0);
    expect(await vault2Contract.withdrawalQueue(0)).to.be.eq(strategyInQueue1);
    expect(await vault2Contract.withdrawalQueue(1)).to.be.eq(strategyInQueue0);
    expect(await vault2Contract.withdrawalQueue(2)).to.be.eq('0x0000000000000000000000000000000000000000');

    await vault2Contract.insertStrategyToQueue(strategyInQueue0, 7);
    expect(await vault2Contract.withdrawalQueue(0)).to.be.eq(strategyInQueue1);
    expect(await vault2Contract.withdrawalQueue(1)).to.be.eq(strategyInQueue0);
    expect(await vault2Contract.withdrawalQueue(2)).to.be.eq('0x0000000000000000000000000000000000000000');

    // rollback changes
    await vault2Contract.insertStrategyToQueue(strategyInQueue0, 0);
    await vault2Contract.insertStrategyToQueue(strategyInQueue1, 1);
    expect(await vault2Contract.withdrawalQueue(0)).to.be.eq(strategyInQueue0);
    expect(await vault2Contract.withdrawalQueue(1)).to.be.eq(strategyInQueue1);
  })

  it('withdraw all fund on vault', async () => {
    await vault2Contract.connect(owner).updateStrategyDebtRatio(strategyVContract.address, 0);
    await vault2Contract.connect(owner).updateStrategyDebtRatio(strategyV2Contract.address, 0);

    await strategyVContract.connect(owner).harvest();
    await strategyV2Contract.connect(owner).harvest();

    await vault2Contract.connect(depositor1).redeem(await vault2Contract.balanceOf(depositor1.address), depositor1.address, depositor1.address);
    await vault2Contract.connect(depositor2).redeem(await vault2Contract.balanceOf(depositor2.address), depositor2.address, depositor2.address);
    // console.log(await vault2Contract.totalAssets());
    // console.log(await vault2Contract.totalSupply());
    // console.log(await vault2Contract.totalDebt());
  });

  /* ========================================= focus on Withdraw & Depoist Test [END] ============================================= */

  /* ========================================= focus on Report Test [START] ============================================= */
  it('depost some usdc into vault2', async () => {
    const maxDepositAmount = await vault2Contract.maxDeposit(depositor1.address);
    await usdcContract.connect(depositor1).approve(vault2Contract.address, maxDepositAmount);
    // pricePerShare keep 1:1
    await vault2Contract.connect(depositor1).mint(
      maxDepositAmount,
      depositor3.address,
    );
    expect(await vault2Contract.balanceOf(depositor3.address)).to.be.eq(maxDepositAmount);
    expect(await vault2Contract.maxDeposit(depositor1.address)).to.be.eq(0);
  });

  it('call report for distribute fund into strategy', async () => {
    const newRatio = MAXBPS.div(100).mul(30); //30%
    await vault2Contract.connect(owner).updateStrategyDebtRatio(strategyVContract.address, newRatio);
    let _strategy = await vault2Contract.strategies(strategyVContract.address);
    expect(_strategy.debtRatio).to.be.eq(newRatio); // because currently only one strategy
    expect(_strategy.debtRatio).to.be.eq(newRatio);

    expect(await vault2Contract.debtOutstanding(strategyVContract.address)).to.be.eq(0);    
    expect(await vault2Contract.creditAvailable(strategyVContract.address)).to.be.eq(
      (await vault2Contract.totalAssets()).div(MAXBPS).mul(newRatio)
    );
    await strategyVContract.connect(owner).harvest();
    expect((await vault2Contract.totalAssets()).mul("3000").div(MAXBPS)).to.be.eq(await usdcContract.balanceOf(strategyVContract.address));
  });

  it('call report when reduce debtratio', async () => {
    const newRatio = MAXBPS.div(100).mul(25); //25%
    await vault2Contract.connect(owner).updateStrategyDebtRatio(strategyVContract.address, newRatio);
    let _strategy = await vault2Contract.strategies(strategyVContract.address);
    expect(_strategy.debtRatio).to.be.eq(newRatio); // because currently only one strategy
    expect(await vault2Contract.debtRatio()).to.be.eq(newRatio);
    const usdcBalanceOfStrategyVContract = await usdcContract.balanceOf(strategyVContract.address);
    const debtOutStandingBefore = await vault2Contract.debtOutstanding(strategyVContract.address);
    expect(debtOutStandingBefore).to.be.eq(
      (await vault2Contract.totalAssets()).div(MAXBPS).mul(MAXBPS.div(100).mul(5)) // 5%
    );
    expect(await vault2Contract.creditAvailable(strategyVContract.address)).to.be.eq(0);
    await strategyVContract.connect(owner).harvest();
    expect(await usdcContract.balanceOf(strategyVContract.address)).to.be.eq(usdcBalanceOfStrategyVContract.sub(debtOutStandingBefore));
    expect(await vault2Contract.debtOutstanding(strategyVContract.address)).to.be.eq(0);
  });

  it('call report when change debtratio and gain', async () => {
    const newRatio = MAXBPS.div(100).mul(30); //30%
    await vault2Contract.connect(owner).updateStrategyDebtRatio(strategyVContract.address, newRatio);
    // send some usdc act like earn some usdc from yield
    // 10 usdc as profit
    const mockEarnAmount = usdcDecimalWei.mul('10');
    const vaultBalanceOfFeeRecipientBefore = await vault2Contract.balanceOf(feeRecipient.address);
    await usdcContract.connect(depositor2).transfer(strategyVContract.address, mockEarnAmount);
    await strategyVContract.setHarvestMockData(mockEarnAmount, 0);
    expect(await vault2Contract.creditAvailable(strategyVContract.address)).to.be.eq('50000000'); // 25% -> 30%
    expect(await vault2Contract.debtOutstanding(strategyVContract.address)).to.be.eq(0);
    // will take profit back to vault and reduce strategy balance
    await strategyVContract.connect(owner).harvest();
    expect( (await vault2Contract.balanceOf(feeRecipient.address)).sub(vaultBalanceOfFeeRecipientBefore) ).to.be.eq(
      mockEarnAmount.mul(await vault2Contract.performanceFee()).div(MAXBPS)
    );
    // mint share for performanceFee
    expect(await vault2Contract.totalSupply()).to.be.eq('1001000000');
    // will take 10 usdc profit into vault
    expect(await usdcContract.balanceOf(vault2Contract.address)).to.be.eq('710000000');
    // give strategy 30% fund without counting 10 usdc profit
    expect(await usdcContract.balanceOf(strategyVContract.address)).to.be.eq('300000000');
    await strategyVContract.connect(owner).harvest();
    // rebalance by debtatio (with profit)
    expect(await usdcContract.balanceOf(vault2Contract.address)).to.be.eq('707000000');
    expect(await usdcContract.balanceOf(strategyVContract.address)).to.be.eq('303000000');
    // 1000000000 - increase -> 1010000000
    expect(await vault2Contract.pricePerShare()).to.be.eq('1008991'); // 1010000000.0 / 1001000000 = 1.008991
  });

  it('call report when loss', async () => {
    const newRatio = MAXBPS.div(100).mul(25); //25%
    await vault2Contract.connect(owner).updateStrategyDebtRatio(strategyVContract.address, newRatio);
    // send some usdc act like earn some usdc from yield
    // 10 usdc as loss
    const mockLossAmount = usdcDecimalWei.mul('10');
    const vaultBalanceOfFeeRecipientBefore = await vault2Contract.balanceOf(feeRecipient.address);
    // mock loss 10 usdc
    await strategyVContract.connect(_shadowman).burnAsset(mockLossAmount);
    await strategyVContract.setHarvestMockData(0, mockLossAmount);
    expect(await vault2Contract.creditAvailable(strategyVContract.address)).to.be.eq(0);
    expect(await vault2Contract.debtOutstanding(strategyVContract.address)).to.be.eq('50500000'); // 303000000 / 30 * 5 = 50500000
    let _strategy = await vault2Contract.strategies(strategyVContract.address);
    expect(_strategy.debtRatio).to.be.eq('2500'); //25%
    // will take profit back to vault and reduce strategy balance
    await strategyVContract.connect(owner).harvest();
    _strategy = await vault2Contract.strategies(strategyVContract.address);
    expect(_strategy.debtRatio).to.be.eq('2418'); // 303000000 / 2500.0 * (2500 - 2418) = 9938400.0, almost equal 10000000 loss
    // 757500000 + 242500000 = 1000000000
    expect(await usdcContract.balanceOf(vault2Contract.address)).to.be.eq('757500000'); // 707000000 + 50500000
    expect(await usdcContract.balanceOf(strategyVContract.address)).to.be.eq('242500000'); // 303000000 - 50500000
    await strategyVContract.connect(owner).harvest();
    // rebalance by debtatio
    expect(await usdcContract.balanceOf(vault2Contract.address)).to.be.eq('758200000');
    expect(await usdcContract.balanceOf(strategyVContract.address)).to.be.eq('241800000');
    // totalSupply the same
    expect(await vault2Contract.totalSupply()).to.be.eq('1001000000');
    // 1010000000 - reduce -> 1000000000
    expect(await vault2Contract.pricePerShare()).to.be.eq('999000'); // 1000000000.0 / 1001000000 = 0.999
  });

  it('test _assessFees on magagement fee', async () => {
    // test management fee
    // over 7 days
    await network.provider.send("evm_increaseTime", [86400 * 7])
    await network.provider.send("evm_mine")
    let _strategy = await vault2Contract.strategies(strategyVContract.address);
    // send some usdc act like earn some usdc from yield
    // 10 usdc as profit
    const mockEarnAmount = usdcDecimalWei.mul('10');
    const vaultBalanceOfFeeRecipientBefore = await vault2Contract.balanceOf(feeRecipient.address);
    await usdcContract.connect(depositor2).transfer(strategyVContract.address, mockEarnAmount);
    await strategyVContract.setHarvestMockData(mockEarnAmount, 0);
    const feeRecipientSharesBefore = await vault2Contract.balanceOf(feeRecipient.address);
    const tokenPriceBefore = await vault2Contract.pricePerShare();
    const tx = await strategyVContract.connect(owner).harvest();
    const receipt = await tx.wait();
    let block = await ethers.provider.getBlock(receipt.blockNumber);
    let feeRecipientSharesDiff = (await vault2Contract.balanceOf(feeRecipient.address)).sub(feeRecipientSharesBefore);
    // conver share to original assets
    feeRecipientSharesDiff = feeRecipientSharesDiff.mul(tokenPriceBefore).div(usdcDecimalWei);
    // subtract performance fee
    feeRecipientSharesDiff = feeRecipientSharesDiff.sub(1000000);
    // calculate management fee 7 days with 2% fee rate
    const timePassOnSeconds = BigNumber.from(block.timestamp).sub(_strategy.lastReport);
    const tryCalManagementFee = _strategy.totalDebt.mul(timePassOnSeconds).mul(200).div(MAXBPS).div(31536000);
    // < 2 is acceptable to solve decimals convert issue
    expect(feeRecipientSharesDiff.sub(tryCalManagementFee)).to.be.lte(2);
    // rebalance
    await strategyVContract.connect(owner).harvest();
  });

  it('test _assessFees on stragesit performance fee', async () => {
    let _strategy = await vault2Contract.strategies(strategyVContract.address);
    // set 5% performaceFee for strategy
    await vault2Contract.connect(owner).updateStrategyPerformanceFee(strategyVContract.address, 500);
    // send some usdc act like earn some usdc from yield
    // 10 usdc as profit
    const mockEarnAmount = usdcDecimalWei.mul('10');
    const vaultBalanceOfStRecipientBefore = await vault2Contract.balanceOf(strategyVContract.address);
    await usdcContract.connect(depositor2).transfer(strategyVContract.address, mockEarnAmount);
    await strategyVContract.setHarvestMockData(mockEarnAmount, 0);
    const tokenPriceBefore = await vault2Contract.pricePerShare();
    await strategyVContract.connect(owner).harvest();
    const vaultBalanceOfStRecipientAfter = await vault2Contract.balanceOf(strategyVContract.address);
    const receviedPerformanceProfit = vaultBalanceOfStRecipientAfter.sub(vaultBalanceOfStRecipientBefore).mul(tokenPriceBefore).div(usdcDecimalWei);

    const expectPerformanceProfit = mockEarnAmount.div(MAXBPS).mul(500);
    // < 2 is acceptable to solve decimals convert issue
    expect(expectPerformanceProfit.sub(receviedPerformanceProfit)).to.be.lte(2);
    // rebalance
    await strategyVContract.connect(owner).harvest();
  });

  it('test _assessFees on whole profit as rewards', async () => {
    // 96% profit as performanceFee. + 5% strategy performanceFee will over gain amount 
    await vault2Contract.setPerfromanceFee(9600);
    expect(await vault2Contract.performanceFee()).to.be.eq(9600);
    // send some usdc act like earn some usdc from yield
    // 10 usdc as profit
    const mockEarnAmount = usdcDecimalWei.mul('10');
    const vaultBalanceOfStRecipientBefore = await vault2Contract.balanceOf(strategyVContract.address);
    await usdcContract.connect(depositor2).transfer(strategyVContract.address, mockEarnAmount);
    await strategyVContract.setHarvestMockData(mockEarnAmount, 0);
    const feeRecipientSharesBefore = await vault2Contract.balanceOf(feeRecipient.address);
    const tokenPriceBefore = await vault2Contract.pricePerShare();
    await strategyVContract.connect(owner).harvest();
    const vaultBalanceOfStRecipientAfter = await vault2Contract.balanceOf(strategyVContract.address);
    const receviedPerformanceProfitStrategy = vaultBalanceOfStRecipientAfter.sub(vaultBalanceOfStRecipientBefore).mul(tokenPriceBefore).div(usdcDecimalWei);
    const feeRecipientSharesAfter = await vault2Contract.balanceOf(feeRecipient.address);
    const receviedPerformanceProfitVault = feeRecipientSharesAfter.sub(feeRecipientSharesBefore).mul(tokenPriceBefore).div(usdcDecimalWei);

    // 5% performance will take first
    let expectPerformanceProfit = mockEarnAmount.div(MAXBPS).mul(500);
    // < 2 is acceptable to solve decimals convert issue
    expect(mockEarnAmount.div(MAXBPS).mul(500).sub(receviedPerformanceProfitStrategy)).to.be.lte(2);
    // 96% -> 100 - 5 = 95%
    expectPerformanceProfit = mockEarnAmount.div(MAXBPS).mul(9500);
    // < 3 is acceptable to solve decimals convert issue
    expect(mockEarnAmount.div(MAXBPS).mul(9500).sub(receviedPerformanceProfitVault)).to.be.lte(3);

    // reset performance default settings
    // 10%
    await vault2Contract.setPerfromanceFee(1000);
    // 0
    await vault2Contract.connect(owner).updateStrategyPerformanceFee(strategyVContract.address, 0);
    // rebalance
    await strategyVContract.connect(owner).harvest();
  });

  it('test strategyMinDebtPerHarvest / strategyMaxDebtPerHarvest of creditAvailable', async () => {
    let _strategy = await vault2Contract.strategies(strategyVContract.address);
    const totalAsset = await vault2Contract.totalAssets();
    await vault2Contract.updateStrategyMaxDebtPerHarvest(strategyVContract.address, totalAsset.div(MAXBPS).mul(5));
    await vault2Contract.updateStrategyMinDebtPerHarvest(strategyVContract.address, totalAsset.div(MAXBPS).mul(2));

    // less than minHarvest so return 0
    await vault2Contract.updateStrategyDebtRatio(strategyVContract.address, _strategy.debtRatio.add(1));
    expect(await vault2Contract.creditAvailable(strategyVContract.address)).to.be.eq(0);
    // equal minHarvest
    await vault2Contract.updateStrategyDebtRatio(strategyVContract.address, _strategy.debtRatio.add(2));
    expect(await vault2Contract.creditAvailable(strategyVContract.address)).to.be.eq(totalAsset.div(MAXBPS).mul(2));
    // greater than maxHarvest. so repleace creditAvailable to 5% amount
    await vault2Contract.updateStrategyDebtRatio(strategyVContract.address, _strategy.debtRatio.add(6));
    expect(await vault2Contract.creditAvailable(strategyVContract.address)).to.be.eq(totalAsset.div(MAXBPS).mul(5));

    // test emergencyShutdown so return 0
    await vault2Contract.connect(owner).setEmergencyShutdown(true);
    expect(await vault2Contract.creditAvailable(strategyVContract.address)).to.be.eq(0);

    // reset
    await vault2Contract.connect(owner).setEmergencyShutdown(false);
    await vault2Contract.updateStrategyDebtRatio(strategyVContract.address, _strategy.debtRatio); 
    await vault2Contract.updateStrategyMinDebtPerHarvest(strategyVContract.address, _strategy.minDebtPerHarvest);
    await vault2Contract.updateStrategyMaxDebtPerHarvest(strategyVContract.address, _strategy.maxDebtPerHarvest);
  });

  it('test debtOutstanding', async () => {
    let _strategy = await vault2Contract.strategies(strategyVContract.address);
    expect(await vault2Contract.debtOutstanding(strategyVContract.address)).to.be.eq(0);
    const newRatio = MAXBPS.div(100).mul(20); //20% , current is 24.18%
    expect(_strategy.debtRatio != newRatio).to.be.true;
    await expect(vault2Contract.connect(testuser1).updateStrategyDebtRatio(strategyVContract.address, newRatio)).to.be.reverted;
    await vault2Contract.connect(management).updateStrategyDebtRatio(strategyVContract.address, newRatio);
    // show debtOutstanding return amount equal 4.18%
    expect(await vault2Contract.debtOutstanding(strategyVContract.address)).to.be.eq(
      _strategy.totalDebt.sub(
        _strategy.totalDebt.div(_strategy.debtRatio).mul(newRatio)
      )
    );
    // adjsuct balance
    await strategyVContract.connect(strategyOwner2).harvest();
    _strategy = await vault2Contract.strategies(strategyVContract.address);

    await vault2Contract.connect(owner).updateStrategyDebtRatio(strategyVContract.address, 0);
    expect(await vault2Contract.debtOutstanding(strategyVContract.address)).to.be.eq(_strategy.totalDebt);
    // reset
    await vault2Contract.connect(owner).updateStrategyDebtRatio(strategyVContract.address, _strategy.debtRatio);

    await vault2Contract.connect(owner).setEmergencyShutdown(true);
    expect(await vault2Contract.debtOutstanding(strategyVContract.address)).to.be.eq(_strategy.totalDebt);
    

    // will call report. all usdc will send back to vault
    await strategyVContract.connect(strategyOwner2).harvest();
    let _strategy2 = await vault2Contract.strategies(strategyVContract.address);
    expect(_strategy2.totalDebt).to.be.eq(0);

    await vault2Contract.connect(owner).setEmergencyShutdown(false);
    // will call report. avaialbe usdc will send back to strategy
    await strategyVContract.connect(strategyOwner2).harvest();
    _strategy2 = await vault2Contract.strategies(strategyVContract.address);
    expect(_strategy2.totalDebt).to.be.eq(_strategy.totalDebt);
  })

  it('test with lockedProfit and dispenseRate', async () => {
    await vault2Contract.connect(owner).setDispenseRate(6000); // dispense rate 60%
    expect(await vault2Contract.dispenseRate()).to.be.eq(6000);
    // send some usdc act like earn some usdc from yield
    // 10 usdc as profit
    const mockEarnAmount = usdcDecimalWei.mul('10');
    const vaultBalanceOfStRecipientBefore = await vault2Contract.balanceOf(strategyVContract.address);
    await usdcContract.connect(depositor2).transfer(strategyVContract.address, mockEarnAmount);
    await strategyVContract.setHarvestMockData(mockEarnAmount, 0);
    const feeRecipientSharesBefore = await vault2Contract.balanceOf(feeRecipient.address);
    const lockedProfitBefore = await vault2Contract.lockedProfit();
    expect(lockedProfitBefore).to.be.eq(0);
    let tokenPriceBefore = await vault2Contract.pricePerShare();
    await strategyVContract.connect(owner).harvest();
    let tokenPriceAfer = await vault2Contract.pricePerShare();
    expect(tokenPriceBefore).to.be.below(tokenPriceAfer);
    let lockedProfitAfter = await vault2Contract.lockedProfit();
    expect(lockedProfitAfter).to.be.eq(5400000);

    // report
    await strategyVContract.connect(owner).harvest();

    // lockedPorfit 10 and gian 0, loss 20
    await strategyVContract.setHarvestMockData('0', usdcDecimalWei.mul('20'));
    tokenPriceBefore = await vault2Contract.pricePerShare();
    await strategyVContract.connect(owner).harvest();
    tokenPriceAfer = await vault2Contract.pricePerShare();
    expect(tokenPriceAfer).to.be.below(tokenPriceBefore);
    lockedProfitAfter = await vault2Contract.lockedProfit();
    expect(lockedProfitAfter).to.be.eq(0);
  })
  /* ========================================= focus on Report Test [END]] ============================================= */

  /* ========================================= focus on Setter Test [Start]] ============================================= */
  it('actor setter test 1', async () => {
    expect(await vault2Contract.governance()).to.be.eq(owner.address);
    await expect(vault2Contract.connect(testuser1).setGovernance(testuser1.address)).to.be.reverted;
    await vault2Contract.connect(owner).setGovernance(testuser1.address);
    expect(await vault2Contract.governance()).to.be.eq(owner.address);
    await expect(vault2Contract.connect(owner).acceptGovernance()).to.be.reverted;
    expect(await vault2Contract.governance()).to.be.eq(owner.address);
    await vault2Contract.connect(testuser1).acceptGovernance();
    expect(await vault2Contract.governance()).to.be.eq(testuser1.address);

    await expect(vault2Contract.connect(owner).setManagement(testuser1.address)).to.be.reverted;
    expect( await vault2Contract.management() ).to.be.eq(management.address);

    await vault2Contract.connect(testuser1).setManagement(testuser1.address);
    expect( await vault2Contract.management() ).to.be.eq(testuser1.address);

    await expect(vault2Contract.connect(owner).setGuardian(testuser1.address)).to.be.reverted;
    expect( await vault2Contract.guardian() ).to.be.eq("0x0000000000000000000000000000000000000000");

    await vault2Contract.connect(testuser1).setGuardian(testuser2.address);
    expect( await vault2Contract.guardian() ).to.be.eq(testuser2.address);

    await expect(vault2Contract.connect(owner).setGuardian(testuser1.address)).to.be.reverted;
    await vault2Contract.connect(testuser2).setGuardian("0x0000000000000000000000000000000000000000");
    expect( await vault2Contract.guardian() ).to.be.eq("0x0000000000000000000000000000000000000000");

    await expect(vault2Contract.connect(depositor1).setDispenseRate(1000)).to.be.reverted;
    await expect(vault2Contract.connect(testuser1).setDispenseRate(10001)).to.be.reverted;
    await vault2Contract.connect(testuser1).setDispenseRate(1000);
    expect( await vault2Contract.connect(testuser1).dispenseRate() ).to.be.eq(1000);

    // reset 
    await vault2Contract.connect(testuser1).setGovernance(owner.address);
    await vault2Contract.connect(owner).acceptGovernance();
    await vault2Contract.connect(owner).setManagement(management.address);
    await vault2Contract.connect(owner).setDispenseRate(0);
    expect( await vault2Contract.management() ).to.be.eq(management.address);
    expect(await vault2Contract.governance()).to.be.eq(owner.address);
  });

  it('actor setter test 2', async () => {
    await expect(vault2Contract.connect(testuser1).setFeeRecipient(testuser1.address)).to.be.reverted;
    await vault2Contract.connect(owner).setFeeRecipient(testuser1.address);
    expect(await vault2Contract.feeRecipient()).to.be.eq(testuser1.address);
    // reset
    await vault2Contract.connect(owner).setFeeRecipient(feeRecipient.address);
    expect(await vault2Contract.feeRecipient()).to.be.eq(feeRecipient.address);

    let currentVault = await vault2Contract.depositLimit();
    await expect(vault2Contract.connect(testuser1).setDepositLimit(currentVault.add(1))).to.be.reverted;
    await vault2Contract.connect(owner).setDepositLimit(currentVault.add(1));
    await expect(await vault2Contract.depositLimit()).to.be.eq(currentVault.add(1));
    // reset
    await vault2Contract.connect(owner).setDepositLimit(currentVault);
    await expect(await vault2Contract.depositLimit()).to.be.eq(currentVault);

    await expect(vault2Contract.connect(testuser1).setEmergencyShutdown(true)).to.be.reverted;

    currentVault = await vault2Contract.managementFee();
    await expect(vault2Contract.connect(testuser1).setManagementFee(currentVault.add(1))).to.be.reverted;
    await vault2Contract.connect(owner).setManagementFee(currentVault.add(1));
    expect(await vault2Contract.managementFee()).to.be.eq(currentVault.add(1));

    // reset
    await vault2Contract.connect(owner).setManagementFee(currentVault);
    expect(await vault2Contract.managementFee()).to.be.eq(currentVault);

    currentVault = await vault2Contract.performanceFee();
    await expect(vault2Contract.connect(testuser1).setPerfromanceFee(currentVault.add(1))).to.be.reverted;
    await vault2Contract.connect(owner).setPerfromanceFee(currentVault.add(1))
    expect(await vault2Contract.performanceFee()).to.be.eq(currentVault.add(1));

    // reset
    await vault2Contract.connect(owner).setPerfromanceFee(currentVault);
    expect(await vault2Contract.performanceFee()).to.be.eq(currentVault);
  });
  /* ========================================= focus on Setter Test [END]] ============================================= */

  /* ========================================= other Test [Start]] ============================================= */
  it('sweep test', async () => {
    const usdtHolderAddress = '0x5754284f345afc66a98fbb0a0afe71e0f007b949';
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [usdtHolderAddress],
    });
    const usdtSigner = await ethers.getSigner(
      usdtHolderAddress
    );
    // some some USDT to vault contract
    const usdtContract = await ethers.getContractAt('IERC20Detailed', usdtAddress) as IERC20Detailed;
    const dpAmount = BigNumber.from(100).mul(usdcDecimalWei);
    await usdtContract.connect(usdtSigner).transfer(vault2Contract.address, dpAmount);
    
    expect(
      await usdtContract.balanceOf(vault2Contract.address)
    ).to.be.eq(dpAmount);

    await expect(vault2Contract.connect(testuser1).sweep(usdtHolderAddress, dpAmount)).to.be.reverted;
    expect(
      await usdtContract.balanceOf(owner.address)
    ).to.be.eq(0);
    await vault2Contract.connect(owner).sweep(usdtAddress, dpAmount);
    expect(
      await usdtContract.balanceOf(owner.address)
    ).to.be.eq(dpAmount);
  });

  it('test StrateiesStore case1', async() => {
    // test revokeStrategy
    await expect(
      vault2Contract.connect(testuser1).revokeStrategy(strategyVContract.address)
    ).to.be.reverted;
    await vault2Contract.connect(owner).updateStrategyDebtRatio(strategyVContract.address, 5000);
    // DebtRatio not zero
    await expect(
      vault2Contract.connect(owner).revokeStrategy(strategyVContract.address)
    ).to.be.reverted;
    await vault2Contract.connect(owner).updateStrategyDebtRatio(strategyVContract.address, 0);
    await vault2Contract.connect(owner).revokeStrategy(strategyVContract.address);

    let _strategy = await vault2Contract.strategies(strategyVContract.address);
    expect(_strategy.activation).to.be.eq(0);
    expect(_strategy.debtRatio).to.be.eq(0);
    
    expect(await vault2Contract.withdrawalQueue(0)).to.be.eq(strategyVContract.address);
    await expect(
      vault2Contract.connect(testuser1).removeStrategyFromQueue(strategyVContract.address)
    ).to.be.reverted;
    await vault2Contract.connect(management).removeStrategyFromQueue(strategyVContract.address);
    // queue shifted
    expect(await vault2Contract.withdrawalQueue(0)).to.be.eq(strategyV2Contract.address);
    
    // reverted becuase of activation == 0
    await expect(
      vault2Contract.connect(owner).addStrategyToQueue(strategyVContract.address)
    ).to.be.reverted;
    
    // remove strategyV2Contract first to change order
    await expect(
      vault2Contract.connect(testuser1).removeStrategyFromQueue(strategyV2Contract.address)
    ).to.be.reverted;
    await vault2Contract.connect(management).removeStrategyFromQueue(strategyV2Contract.address);
    expect(await vault2Contract.withdrawalQueue(0)).to.be.eq('0x0000000000000000000000000000000000000000');
    expect(await vault2Contract.withdrawalQueue(1)).to.be.eq('0x0000000000000000000000000000000000000000');

    // active strategyVContract
    const tx = await vault2Contract.connect(owner).addStrategy(strategyVContract.address, 2500, 0, BigNumber.from(1000).mul(usdcDecimal), 0);
    const receipt = await tx.wait();
    let block = await ethers.provider.getBlock(receipt.blockNumber);
    _strategy = await vault2Contract.strategies(strategyVContract.address);
    expect(_strategy.activation).to.be.eq(block.timestamp);
    expect(_strategy.debtRatio).to.be.eq(2500);

    // add strategy to queue
    await expect(
      vault2Contract.connect(testuser1).addStrategyToQueue(strategyV2Contract.address)
    ).to.be.reverted;
    await vault2Contract.connect(management).addStrategyToQueue(strategyV2Contract.address);
    expect(await vault2Contract.withdrawalQueue(0)).to.be.eq(strategyVContract.address);
    expect(await vault2Contract.withdrawalQueue(1)).to.be.eq(strategyV2Contract.address);
    expect(await vault2Contract.withdrawalQueue(2)).to.be.eq('0x0000000000000000000000000000000000000000');
  });

  it('test StrateiesStore case2', async() => {
    let _strategy = await vault2Contract.strategies(strategyVContract.address);
    // only vault contract can call
    // await expect(
    //   vault2Contract.connect(owner).updateStrategyLastReport(strategyVContract.address)
    // ).to.be.reverted;
    // await expect(
    //   vault2Contract.connect(owner).updateStrategyTotalDebt(strategyVContract.address, 100)
    // ).to.be.reverted;
    // await expect(
    //   vault2Contract.connect(owner).updateStrategyTotalGain(strategyVContract.address, 100)
    // ).to.be.reverted;
    // await expect(
    //   vault2Contract.connect(owner).updateStrategyTotalLoss(strategyVContract.address, 100)
    // ).to.be.reverted;

    expect(
      (await vault2Contract.strategies(strategyVContract.address)).lastReport
    ).to.be.eq(_strategy.lastReport);
    expect(
      (await vault2Contract.strategies(strategyVContract.address)).totalDebt
    ).to.be.eq(_strategy.totalDebt);
    expect(
      (await vault2Contract.strategies(strategyVContract.address)).totalGain
    ).to.be.eq(_strategy.totalGain);
    expect(
      (await vault2Contract.strategies(strategyVContract.address)).totalLoss
    ).to.be.eq(_strategy.totalLoss);
    

    await expect(
      vault2Contract.connect(testuser1).updateStrategyMinDebtPerHarvest(strategyVContract.address, 10)).to.be.reverted;
    await vault2Contract.connect(owner).updateStrategyMinDebtPerHarvest(strategyVContract.address, 10);
    await expect(
      vault2Contract.connect(testuser1).updateStrategyMaxDebtPerHarvest(strategyVContract.address, 100)).to.be.reverted;
    await vault2Contract.connect(owner).updateStrategyMaxDebtPerHarvest(strategyVContract.address, 100);

    expect(
      (await vault2Contract.strategies(strategyVContract.address)).minDebtPerHarvest
    ).to.be.eq(10);
    expect(
      (await vault2Contract.strategies(strategyVContract.address)).maxDebtPerHarvest
    ).to.be.eq(100);

    // reset
    await vault2Contract.connect(owner).updateStrategyMinDebtPerHarvest(strategyVContract.address, _strategy.minDebtPerHarvest);
    await vault2Contract.connect(owner).updateStrategyMaxDebtPerHarvest(strategyVContract.address, _strategy.maxDebtPerHarvest);
  });
  /* ========================================= other Test [END]] ============================================= */
});
