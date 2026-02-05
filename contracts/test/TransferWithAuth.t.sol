// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Fork test validating EIP-3009 transferWithAuthorization on mainnet USDC.
/// This mirrors the on-chain call the x402 facilitator makes during settlement.
contract TransferWithAuthTest is Test {
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    bytes32 constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256(
            "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        );

    uint256 signerKey;
    address signer;
    address recipient;
    address relayer;

    function setUp() public {
        vm.createSelectFork(vm.envString("MAINNET_RPC_URL"));

        signerKey = 0xA11CE;
        signer = vm.addr(signerKey);
        recipient = makeAddr("recipient");
        relayer = makeAddr("relayer");

        deal(USDC, signer, 1_000_000e6);
        deal(relayer, 1 ether);
    }

    function _getDomainSeparator() internal view returns (bytes32) {
        (bool ok, bytes memory data) = USDC.staticcall(
            abi.encodeWithSignature("DOMAIN_SEPARATOR()")
        );
        require(ok, "DOMAIN_SEPARATOR failed");
        return abi.decode(data, (bytes32));
    }

    function _signTransferAuth(
        uint256 privateKey,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
                from,
                to,
                value,
                validAfter,
                validBefore,
                nonce
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", _getDomainSeparator(), structHash)
        );
        (v, r, s) = vm.sign(privateKey, digest);
    }

    function _callTransferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        (bool ok, ) = USDC.call(
            abi.encodeWithSignature(
                "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)",
                from,
                to,
                value,
                validAfter,
                validBefore,
                nonce,
                v,
                r,
                s
            )
        );
        require(ok, "transferWithAuthorization failed");
    }

    function test_transferWithAuth_happyPath() public {
        uint256 amount = 100e6; // 100 USDC
        bytes32 nonce = keccak256("unique-nonce-1");

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            signerKey,
            signer,
            recipient,
            amount,
            0,
            block.timestamp + 900,
            nonce
        );

        uint256 signerBefore = IERC20(USDC).balanceOf(signer);
        uint256 recipientBefore = IERC20(USDC).balanceOf(recipient);

        // Relayer submits the transaction (pays gas, not the signer)
        vm.prank(relayer);
        _callTransferWithAuthorization(
            signer,
            recipient,
            amount,
            0,
            block.timestamp + 900,
            nonce,
            v,
            r,
            s
        );

        assertEq(IERC20(USDC).balanceOf(signer), signerBefore - amount);
        assertEq(IERC20(USDC).balanceOf(recipient), recipientBefore + amount);
    }

    function test_transferWithAuth_revertsExpired() public {
        uint256 amount = 100e6;
        bytes32 nonce = keccak256("unique-nonce-2");
        uint256 validBefore = block.timestamp - 1; // already expired

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            signerKey,
            signer,
            recipient,
            amount,
            0,
            validBefore,
            nonce
        );

        vm.prank(relayer);
        vm.expectRevert();
        _callTransferWithAuthorization(
            signer,
            recipient,
            amount,
            0,
            validBefore,
            nonce,
            v,
            r,
            s
        );
    }

    function test_transferWithAuth_revertsWrongSigner() public {
        uint256 amount = 100e6;
        bytes32 nonce = keccak256("unique-nonce-3");
        uint256 wrongKey = 0xBAD;

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            wrongKey,
            signer, // claims to be signer but signed with wrong key
            recipient,
            amount,
            0,
            block.timestamp + 900,
            nonce
        );

        vm.prank(relayer);
        vm.expectRevert();
        _callTransferWithAuthorization(
            signer,
            recipient,
            amount,
            0,
            block.timestamp + 900,
            nonce,
            v,
            r,
            s
        );
    }

    function test_transferWithAuth_revertsInsufficientBalance() public {
        uint256 amount = 2_000_000e6; // more than signer has
        bytes32 nonce = keccak256("unique-nonce-4");

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            signerKey,
            signer,
            recipient,
            amount,
            0,
            block.timestamp + 900,
            nonce
        );

        vm.prank(relayer);
        vm.expectRevert();
        _callTransferWithAuthorization(
            signer,
            recipient,
            amount,
            0,
            block.timestamp + 900,
            nonce,
            v,
            r,
            s
        );
    }

    function test_transferWithAuth_revertsReplayNonce() public {
        uint256 amount = 50e6;
        bytes32 nonce = keccak256("unique-nonce-5");

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            signerKey,
            signer,
            recipient,
            amount,
            0,
            block.timestamp + 900,
            nonce
        );

        vm.prank(relayer);
        _callTransferWithAuthorization(
            signer,
            recipient,
            amount,
            0,
            block.timestamp + 900,
            nonce,
            v,
            r,
            s
        );

        // Same nonce should revert (replay protection)
        vm.prank(relayer);
        vm.expectRevert();
        _callTransferWithAuthorization(
            signer,
            recipient,
            amount,
            0,
            block.timestamp + 900,
            nonce,
            v,
            r,
            s
        );
    }

    function test_transferWithAuth_anyoneCanRelay() public {
        uint256 amount = 10e6;
        bytes32 nonce = keccak256("unique-nonce-6");

        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(
            signerKey,
            signer,
            recipient,
            amount,
            0,
            block.timestamp + 900,
            nonce
        );

        // A random address can relay this — no access control
        address randomRelayer = makeAddr("random");
        deal(randomRelayer, 1 ether);

        vm.prank(randomRelayer);
        _callTransferWithAuthorization(
            signer,
            recipient,
            amount,
            0,
            block.timestamp + 900,
            nonce,
            v,
            r,
            s
        );

        assertEq(IERC20(USDC).balanceOf(recipient), amount);
    }
}
