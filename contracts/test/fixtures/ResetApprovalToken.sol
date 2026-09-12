// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {DevelopmentToken} from "../../script/DevelopmentToken.sol";

/// @title ResetApprovalToken
/// @notice Fixture rejecting the direct nonzero-to-nonzero approval that v1 deliberately does not work around.
contract ResetApprovalToken is DevelopmentToken {
    /// @notice The token requires resetting an existing allowance before changing it.
    error ResetApprovalToken_ResetRequired();

    /// @notice Funds the two local participants.
    /// @param _maker The first token holder.
    /// @param _taker The second token holder.
    constructor(address _maker, address _taker) DevelopmentToken("RESET", 6, _maker, _taker) {}

    /// @inheritdoc ERC20
    function approve(address _spender, uint256 _value) public override returns (bool _success) {
        if (_value != 0 && allowance(msg.sender, _spender) != 0) revert ResetApprovalToken_ResetRequired();
        return super.approve(_spender, _value);
    }
}
