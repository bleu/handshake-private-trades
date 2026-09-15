// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";

import {PrivateTradeSettlement} from "../src/PrivateTradeSettlement.sol";

/// @title DeploySettlement
/// @notice Deploys the immutable settlement on Gnosis using a private CLI environment key.
contract DeploySettlement is Script {
    /// @notice The RPC must select Gnosis before any deployment can be signed.
    error DeploySettlement_WrongChain();

    /// @notice Creates one settlement; Forge broadcasts only when passed --broadcast.
    /// @return _settlement The newly created settlement contract.
    function run() external returns (PrivateTradeSettlement _settlement) {
        if (block.chainid != 100) revert DeploySettlement_WrongChain();

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        _settlement = new PrivateTradeSettlement();
        vm.stopBroadcast();
    }
}
