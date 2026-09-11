// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {IPrivateTradeSettlement} from "../../src/interfaces/IPrivateTradeSettlement.sol";
import {PrivateTradeSettlement} from "../../src/PrivateTradeSettlement.sol";
import {DevelopmentToken} from "../../script/DevelopmentToken.sol";

/// @title SettlementFixture
/// @notice Shared public-interface setup and signed inputs for lifecycle tests.
abstract contract SettlementFixture is Test {
    /// @notice Development-only maker signing key.
    uint256 internal constant _MAKER_KEY = 0xA11CE;
    /// @notice EOA offering maker tokens.
    address internal _maker;
    /// @notice EOA supplying taker tokens.
    address internal _taker;
    /// @notice Settlement under test.
    PrivateTradeSettlement internal _settlement;
    /// @notice Maker-side ordinary ERC-20 fixture.
    DevelopmentToken internal _makerToken;
    /// @notice Taker-side ordinary ERC-20 fixture.
    DevelopmentToken internal _takerToken;

    /// @notice Funds both parties and grants sufficient ordinary allowances.
    function setUp() public virtual {
        _maker = vm.addr(_MAKER_KEY);
        _taker = vm.addr(0xB0B);
        _settlement = new PrivateTradeSettlement();
        _makerToken = new DevelopmentToken("DEV6", 6, _maker, _taker);
        _takerToken = new DevelopmentToken("DEV18", 18, _maker, _taker);
        vm.prank(_maker);
        _makerToken.approve(address(_settlement), type(uint256).max);
        vm.prank(_taker);
        _takerToken.approve(address(_settlement), type(uint256).max);
    }

    /// @notice Builds a currently valid independently salted restricted order.
    /// @return _terms Signed fields for a one-token/two-token exchange.
    function _order() internal view returns (IPrivateTradeSettlement.Order memory _terms) {
        return IPrivateTradeSettlement.Order({
            maker: _maker,
            restrictedTaker: _taker,
            makerToken: address(_makerToken),
            takerToken: address(_takerToken),
            makerAmount: 1_000_000,
            takerAmount: 2 ether,
            expiration: block.timestamp + 1 days,
            salt: bytes32(uint256(1))
        });
    }

    /// @notice Signs only the public complete order digest with the development maker key.
    /// @param _terms Full signed fields.
    /// @return _signature Standard 65-byte ECDSA signature.
    function _sign(IPrivateTradeSettlement.Order memory _terms) internal view returns (bytes memory _signature) {
        (uint8 _v, bytes32 _r, bytes32 _s) = vm.sign(_MAKER_KEY, _settlement.hashOrder(_terms));
        return abi.encodePacked(_r, _s, _v);
    }
}
