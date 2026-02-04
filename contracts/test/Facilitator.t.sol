// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Facilitator} from "../src/Facilitator.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FacilitatorTest is Test {
    Facilitator public facilitator;

    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    // EIP-712 domain for mainnet USDC (FiatTokenV2_2)
    bytes32 constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    uint256 senderKey;
    address sender;
    address recipient;
    address contractOwner;

    function setUp() public {
        vm.createSelectFork(vm.envString("MAINNET_RPC_URL"));

        contractOwner = address(this);
        facilitator = new Facilitator(USDC);

        senderKey = 0xA11CE;
        sender = vm.addr(senderKey);
        recipient = makeAddr("recipient");

        // Deal USDC to sender (USDC uses slot 9 for balances)
        deal(USDC, sender, 1_000_000e6); // 1M USDC
    }

    function _getUSDCDomainSeparator() internal view returns (bytes32) {
        // Read DOMAIN_SEPARATOR from USDC contract
        (bool success, bytes memory data) = USDC.staticcall(
            abi.encodeWithSignature("DOMAIN_SEPARATOR()")
        );
        require(success, "DOMAIN_SEPARATOR call failed");
        return abi.decode(data, (bytes32));
    }

    function _getNonce(address account) internal view returns (uint256) {
        (bool success, bytes memory data) = USDC.staticcall(
            abi.encodeWithSignature("nonces(address)", account)
        );
        require(success, "nonces call failed");
        return abi.decode(data, (uint256));
    }

    function _signPermit(
        uint256 privateKey,
        address owner_,
        address spender,
        uint256 value,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(PERMIT_TYPEHASH, owner_, spender, value, nonce, deadline)
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", _getUSDCDomainSeparator(), structHash)
        );
        (v, r, s) = vm.sign(privateKey, digest);
    }

    function test_facilitate_happyPath() public {
        uint256 amount = 100e6; // 100 USDC
        uint256 gasFee = 1e6;  // 1 USDC
        uint256 permitValue = amount + gasFee;
        uint256 deadline = block.timestamp + 900;
        uint256 nonce = _getNonce(sender);

        (uint8 v, bytes32 r, bytes32 s) = _signPermit(
            senderKey, sender, address(facilitator), permitValue, nonce, deadline
        );

        uint256 senderBalBefore = IERC20(USDC).balanceOf(sender);
        uint256 recipientBalBefore = IERC20(USDC).balanceOf(recipient);

        facilitator.facilitate(sender, recipient, amount, gasFee, deadline, v, r, s);

        assertEq(IERC20(USDC).balanceOf(sender), senderBalBefore - permitValue);
        assertEq(IERC20(USDC).balanceOf(recipient), recipientBalBefore + amount);
        assertEq(IERC20(USDC).balanceOf(address(facilitator)), gasFee);
    }

    function test_facilitate_revertsZeroAmount() public {
        uint256 gasFee = 1e6;
        uint256 deadline = block.timestamp + 900;
        uint256 nonce = _getNonce(sender);

        (uint8 v, bytes32 r, bytes32 s) = _signPermit(
            senderKey, sender, address(facilitator), gasFee, nonce, deadline
        );

        vm.expectRevert("Zero amount");
        facilitator.facilitate(sender, recipient, 0, gasFee, deadline, v, r, s);
    }

    function test_facilitate_revertsZeroRecipient() public {
        uint256 amount = 100e6;
        uint256 gasFee = 1e6;
        uint256 permitValue = amount + gasFee;
        uint256 deadline = block.timestamp + 900;
        uint256 nonce = _getNonce(sender);

        (uint8 v, bytes32 r, bytes32 s) = _signPermit(
            senderKey, sender, address(facilitator), permitValue, nonce, deadline
        );

        vm.expectRevert("Zero recipient");
        facilitator.facilitate(sender, address(0), amount, gasFee, deadline, v, r, s);
    }

    function test_facilitate_revertsWhenPaused() public {
        facilitator.pause();

        uint256 amount = 100e6;
        uint256 gasFee = 1e6;
        uint256 permitValue = amount + gasFee;
        uint256 deadline = block.timestamp + 900;
        uint256 nonce = _getNonce(sender);

        (uint8 v, bytes32 r, bytes32 s) = _signPermit(
            senderKey, sender, address(facilitator), permitValue, nonce, deadline
        );

        vm.expectRevert();
        facilitator.facilitate(sender, recipient, amount, gasFee, deadline, v, r, s);
    }

    function test_facilitate_revertsInvalidPermit() public {
        uint256 amount = 100e6;
        uint256 gasFee = 1e6;
        uint256 permitValue = amount + gasFee;
        uint256 deadline = block.timestamp + 900;

        // Sign with wrong key
        uint256 wrongKey = 0xBAD;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(
            wrongKey, sender, address(facilitator), permitValue, 0, deadline
        );

        vm.expectRevert();
        facilitator.facilitate(sender, recipient, amount, gasFee, deadline, v, r, s);
    }

    function test_facilitate_revertsInsufficientBalance() public {
        // Sender has 1M USDC, try to send 2M
        uint256 amount = 2_000_000e6;
        uint256 gasFee = 1e6;
        uint256 permitValue = amount + gasFee;
        uint256 deadline = block.timestamp + 900;
        uint256 nonce = _getNonce(sender);

        (uint8 v, bytes32 r, bytes32 s) = _signPermit(
            senderKey, sender, address(facilitator), permitValue, nonce, deadline
        );

        vm.expectRevert();
        facilitator.facilitate(sender, recipient, amount, gasFee, deadline, v, r, s);
    }

    function test_withdraw_onlyOwner() public {
        // First facilitate to get fees in contract
        uint256 amount = 100e6;
        uint256 gasFee = 1e6;
        uint256 deadline = block.timestamp + 900;
        uint256 nonce = _getNonce(sender);

        (uint8 v, bytes32 r, bytes32 s) = _signPermit(
            senderKey, sender, address(facilitator), amount + gasFee, nonce, deadline
        );
        facilitator.facilitate(sender, recipient, amount, gasFee, deadline, v, r, s);

        // Non-owner tries to withdraw
        address notOwner = makeAddr("notOwner");
        vm.prank(notOwner);
        vm.expectRevert();
        facilitator.withdraw(notOwner, gasFee);
    }

    function test_withdraw_happyPath() public {
        // Facilitate to accumulate fees
        uint256 amount = 100e6;
        uint256 gasFee = 5e6;
        uint256 deadline = block.timestamp + 900;
        uint256 nonce = _getNonce(sender);

        (uint8 v, bytes32 r, bytes32 s) = _signPermit(
            senderKey, sender, address(facilitator), amount + gasFee, nonce, deadline
        );
        facilitator.facilitate(sender, recipient, amount, gasFee, deadline, v, r, s);

        assertEq(facilitator.feeBalance(), gasFee);

        address treasury = makeAddr("treasury");
        facilitator.withdraw(treasury, gasFee);

        assertEq(IERC20(USDC).balanceOf(treasury), gasFee);
        assertEq(facilitator.feeBalance(), 0);
    }

    function test_feeBalance_accurate() public {
        assertEq(facilitator.feeBalance(), 0);

        uint256 amount = 50e6;
        uint256 gasFee = 2e6;
        uint256 deadline = block.timestamp + 900;
        uint256 nonce = _getNonce(sender);

        (uint8 v, bytes32 r, bytes32 s) = _signPermit(
            senderKey, sender, address(facilitator), amount + gasFee, nonce, deadline
        );
        facilitator.facilitate(sender, recipient, amount, gasFee, deadline, v, r, s);

        assertEq(facilitator.feeBalance(), gasFee);
    }

    function test_pause_unpause() public {
        assertFalse(facilitator.paused());

        facilitator.pause();
        assertTrue(facilitator.paused());

        facilitator.unpause();
        assertFalse(facilitator.paused());

        // Non-owner cannot pause
        address notOwner = makeAddr("notOwner");
        vm.prank(notOwner);
        vm.expectRevert();
        facilitator.pause();
    }
}
