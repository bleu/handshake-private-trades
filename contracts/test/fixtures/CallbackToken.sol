// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {DevelopmentToken} from "../../script/DevelopmentToken.sol";

/// @title CallbackToken
/// @notice ERC-20 fixture exposing the outcome of a transfer-triggered external callback.
contract CallbackToken is DevelopmentToken {
    /// @notice Callback recipient.
    address private _target;
    /// @notice Callback calldata supplied by the test.
    bytes private _callback;
    /// @notice Prevents infinite recursion in an unguarded target.
    bool private _inside;
    /// @notice Whether the callback completed successfully.
    /// @return The callback success flag.
    bool public callbackSucceeded;
    /// @notice Raw return or revert data from the callback.
    /// @return The callback result bytes.
    bytes public callbackResult;

    /// @notice Funds both test participants with callback-capable tokens.
    /// @param _maker First token holder.
    /// @param _taker Second token holder.
    constructor(address _maker, address _taker) DevelopmentToken("CALL", 6, _maker, _taker) {}

    /// @notice Configures the next transfer's adversarial external call.
    /// @param _recipient Callback target.
    /// @param _data Callback calldata.
    function arm(address _recipient, bytes calldata _data) external {
        _target = _recipient;
        _callback = _data;
    }

    /// @inheritdoc ERC20
    function transferFrom(address _from, address _to, uint256 _value) public override returns (bool _success) {
        if (!_inside && _target != address(0)) {
            _inside = true;
            // The fixture intentionally models arbitrary token callbacks at the external-call boundary.
            // solhint-disable-next-line avoid-low-level-calls
            (callbackSucceeded, callbackResult) = _target.call(_callback);
            _inside = false;
        }
        return super.transferFrom(_from, _to, _value);
    }
}
