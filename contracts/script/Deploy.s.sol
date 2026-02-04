// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Facilitator} from "../src/Facilitator.sol";

contract DeployScript is Script {
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        Facilitator facilitator = new Facilitator(USDC);
        console.log("Facilitator deployed at:", address(facilitator));

        vm.stopBroadcast();
    }
}
