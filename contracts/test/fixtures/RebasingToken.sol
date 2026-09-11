// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {DevelopmentToken} from "../../script/DevelopmentToken.sol";

/// @title RebasingToken
/// @notice Positive-rebase fixture for the complete two-holder test population.
contract RebasingToken is DevelopmentToken {
    /// @notice First member of the fixture's complete holder population.
    address private immutable _FIRST;
    /// @notice Second member of the fixture's complete holder population.
    address private immutable _SECOND;
    /// @notice Whether the one-time positive rebase has happened.
    bool private _rebased;

    /// @notice Funds the fixture's two holders before a transfer-triggered doubling.
    /// @param _maker First holder.
    /// @param _taker Second holder.
    constructor(address _maker, address _taker) DevelopmentToken("REBASE", 6, _maker, _taker) {
        _FIRST = _maker;
        _SECOND = _taker;
    }

    /// @inheritdoc ERC20
    function transferFrom(address _from, address _to, uint256 _value) public override returns (bool _success) {
        _success = super.transferFrom(_from, _to, _value);
        if (!_rebased) {
            _rebased = true;
            _mint(_FIRST, balanceOf(_FIRST));
            _mint(_SECOND, balanceOf(_SECOND));
        }
        return _success;
    }
}
