// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Facilitator is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IERC20Permit public immutable usdcPermit;

    event Facilitated(
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 gasFeeUSDC,
        bytes32 txId
    );

    event Withdrawn(address indexed to, uint256 amount);

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        usdcPermit = IERC20Permit(_usdc);
    }

    function facilitate(
        address sender,
        address recipient,
        uint256 amount,
        uint256 gasFeeUSDC,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external whenNotPaused nonReentrant {
        require(recipient != address(0), "Zero recipient");
        require(amount > 0, "Zero amount");

        uint256 permitValue = amount + gasFeeUSDC;
        usdcPermit.permit(sender, address(this), permitValue, deadline, v, r, s);

        usdc.safeTransferFrom(sender, recipient, amount);
        if (gasFeeUSDC > 0) {
            usdc.safeTransferFrom(sender, address(this), gasFeeUSDC);
        }

        bytes32 txId = keccak256(
            abi.encodePacked(sender, recipient, amount, block.number)
        );
        emit Facilitated(sender, recipient, amount, gasFeeUSDC, txId);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Zero address");
        usdc.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    function feeBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
