// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title DevelopmentToken
/// @notice Ordinary ERC-20 fixture used by automated Solidity and browser tests.
contract DevelopmentToken is ERC20 {
    /// @notice Decimal scale of this local fixture.
    uint8 private immutable _DECIMALS;

    /// @notice Creates fixed supplies for the two deterministic development accounts.
    /// @param _symbol The fixture's ticker and name.
    /// @param _decimals The number of decimal places.
    /// @param _maker The first funded account.
    /// @param _taker The second funded account.
    constructor(string memory _symbol, uint8 _decimals, address _maker, address _taker) ERC20(_symbol, _symbol) {
        _DECIMALS = _decimals;
        _mint(_maker, 1_000_000 * 10 ** uint256(_decimals));
        _mint(_taker, 1_000_000 * 10 ** uint256(_decimals));
    }

    /// @inheritdoc ERC20
    function decimals() public view override returns (uint8) {
        return _DECIMALS;
    }
}
