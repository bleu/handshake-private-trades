// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {DevelopmentToken} from "../../script/DevelopmentToken.sol";

/// @title NoReturnToken
/// @notice Models deployed ERC-20 implementations whose transferFrom returns no data.
contract NoReturnToken is DevelopmentToken {
    /// @notice Funds both development participants.
    /// @param _maker First holder.
    /// @param _taker Second holder.
    constructor(address _maker, address _taker) DevelopmentToken("NONE", 6, _maker, _taker) {}

    /// @inheritdoc ERC20
    function transferFrom(address _from, address _to, uint256 _value) public override returns (bool _success) {
        _success = super.transferFrom(_from, _to, _value);
        // Model the external ABI of legacy tokens: successful call with exactly zero return bytes.
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") { return(0, 0) }
    }
}
