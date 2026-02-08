// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

contract CheckDigest is Script {
    bytes32 constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");

    bytes32 constant DOMAIN_SEPARATOR = 0x06c37168a7db5138defc7866392bb87a741f9b3d104deb5094588ce041cae335;

    function run() external pure {
        address from = 0x0D42aa898242f52c8876688605f31E87d81A3e26;
        address to = 0x488d87a9A88a6A878B3E7cf0bEece8984af9518D;
        uint256 value = 1000000;
        uint256 validAfter = 0;
        uint256 validBefore = 1770422000;
        bytes32 nonce = bytes32(uint256(1));

        console.log("from:", from);
        console.log("to:", to);
        console.log("value:", value);
        console.log("validAfter:", validAfter);
        console.log("validBefore:", validBefore);
        console.logBytes32(nonce);

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
        console.log("structHash:");
        console.logBytes32(structHash);

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );
        console.log("digest:");
        console.logBytes32(digest);
    }
}
