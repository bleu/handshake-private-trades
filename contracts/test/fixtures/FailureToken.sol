// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {DevelopmentToken} from "../../script/DevelopmentToken.sol";

/// @title FailureToken
/// @notice Token that can fail after mutating balances, testing complete transaction rollback.
contract FailureToken is DevelopmentToken {
    /// @notice Whether transfers return false after performing their balance changes.
    bool private _returnFalse;
    /// @notice Whether transfers revert after performing their balance changes.
    bool private _revertTransfer;
    /// @notice Deliberate transfer failure for atomicity tests.
    error FailureToken_TransferRejected();

    /// @notice Funds the two development participants.
    /// @param _maker First token holder.
    /// @param _taker Second token holder.
    constructor(address _maker, address _taker) DevelopmentToken("FAIL", 6, _maker, _taker) {}

    /// @notice Controls observable token behavior for the next transfer attempt.
    /// @param _falseResult Whether transferFrom returns false.
    /// @param _revertResult Whether transferFrom reverts.
    function configure(bool _falseResult, bool _revertResult) external {
        _returnFalse = _falseResult;
        _revertTransfer = _revertResult;
    }

    /// @inheritdoc ERC20
    function transferFrom(address _from, address _to, uint256 _value) public override returns (bool _success) {
        super.transferFrom(_from, _to, _value);
        if (_revertTransfer) revert FailureToken_TransferRejected();
        return !_returnFalse;
    }
}
