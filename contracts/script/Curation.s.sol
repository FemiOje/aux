// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {Curation} from "../src/Curation.sol";

/// Deploy: forge script script/Curation.s.sol --rpc-url $ALCHEMY_MONAD_TESTNET_RPC_URL --account <keystore> --broadcast
contract CurationScript is Script {
    function run() public returns (Curation curation) {
        vm.startBroadcast();
        curation = new Curation();
        vm.stopBroadcast();
    }
}
