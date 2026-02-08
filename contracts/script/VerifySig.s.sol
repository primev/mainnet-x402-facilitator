// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

contract VerifySig is Script {
    function run() external pure {
        bytes32 digest = 0xde36c41a823212bbcc84ec55cee2b6fd7572063079447342d60dd5865e745965;

        // Signature from cast
        uint8 v = 28;
        bytes32 r = 0xf3c573fac1df3e21d2a9db7b24f7cd2cc638f9304893371edf1b6aeeab500b09;
        bytes32 s = 0x12f097739b6ac35d140fe8fb7135455df630de6bd700b284a9eccc2768e1b8d9;

        address recovered = ecrecover(digest, v, r, s);
        console.log("Recovered:", recovered);
        console.log("Expected: 0x0D42aa898242f52c8876688605f31E87d81A3e26");
        console.log("Match:", recovered == 0x0D42aa898242f52c8876688605f31E87d81A3e26);
    }
}
