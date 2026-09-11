// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {DevelopmentToken} from "../../script/DevelopmentToken.sol";

/// @title FeeToken
/// @notice Models a successful ERC-20 transfer that redirects ten percent of the call amount.
contract FeeToken is DevelopmentToken {
    /// @notice Funds both development participants without mint fees.
    /// @param _maker First holder.
    /// @param _taker Second holder.
    constructor(address _maker, address _taker) DevelopmentToken("FEE", 6, _maker, _taker) {}

    /// @inheritdoc ERC20
    function _update(address _from, address _to, uint256 _value) internal override {
        if (_from != address(0) && _to != address(0)) {
            uint256 _fee = _value / 10;
            super._update(_from, address(0xFEE), _fee);
            super._update(_from, _to, _value - _fee);
        } else {
            super._update(_from, _to, _value);
        }
    }
}
