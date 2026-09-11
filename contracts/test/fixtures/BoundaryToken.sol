// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title BoundaryToken
/// @notice Ordinary ERC-20 fixture with a configurable full-range supply.
contract BoundaryToken is ERC20 {
    /// @notice Mints the entire supply to one participant.
    /// @param _holder Initial holder.
    /// @param _supply Initial supply, including uint256 max.
    constructor(address _holder, uint256 _supply) ERC20("BOUND", "BOUND") {
        _mint(_holder, _supply);
    }
}
