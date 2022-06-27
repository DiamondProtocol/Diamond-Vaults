// SPDX-License-Identifier: MIT
pragma solidity >=0.7.2;

interface IStrategy {
    function want() external view returns (address);
    function vault() external view returns (address);
    function isActive() external view returns (bool);
    function delegatedAssets() external view returns (uint256);
    function estimatedTotalAssets() external view returns (uint256);
    function withdraw(uint256) external returns (uint256);
    function migrate(address) external;
}