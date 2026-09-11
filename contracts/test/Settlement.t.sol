// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Test} from "forge-std/Test.sol";

import {IPrivateTradeSettlement} from "../src/interfaces/IPrivateTradeSettlement.sol";
import {PrivateTradeSettlement} from "../src/PrivateTradeSettlement.sol";
import {DevelopmentToken} from "../script/DevelopmentToken.sol";
import {CallbackToken} from "./fixtures/CallbackToken.sol";
import {FailureToken} from "./fixtures/FailureToken.sol";

/// @title SettlementTest
/// @notice Exercises exchanges through public settlement and token interfaces.
contract SettlementTest is Test {
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

    /// @notice A valid restricted fill exchanges both full signed amounts and consumes its identity.
    function testRestrictedOrderExchangesBothAmounts() public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        bytes memory _signature = _sign(_terms);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
        assertEq(_makerToken.balanceOf(_maker), 999_999_000_000);
        assertEq(_makerToken.balanceOf(_taker), 1_000_001_000_000);
        assertEq(_takerToken.balanceOf(_maker), 1_000_002 ether);
        assertEq(_takerToken.balanceOf(_taker), 999_998 ether);
        assertEq(uint8(_settlement.orderStatus(_settlement.hashOrder(_terms))), 1);
    }

    /// @notice A signature unrelated to the maker cannot transfer tokens.
    function testWrongMakerSignatureRejected() public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        (uint8 _v, bytes32 _r, bytes32 _s) = vm.sign(0xBAD, _settlement.hashOrder(_terms));
        vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_InvalidSignature.selector);
        vm.prank(_taker);
        _settlement.settle(_terms, abi.encodePacked(_r, _s, _v));
    }

    /// @notice A restricted order cannot be accepted by a different token-funded caller.
    function testRestrictedOrderRejectsWrongCaller() public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.restrictedTaker = address(0xCAFE);
        bytes memory _signature = _sign(_terms);
        vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_WrongCaller.selector);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
    }

    /// @notice Zero transfer amounts cannot consume a signed order.
    function testZeroAmountRejected() public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.makerAmount = 0;
        bytes memory _signature = _sign(_terms);
        vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_InvalidOrder.selector);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
    }

    /// @notice The same signed identity cannot exchange assets twice.
    function testFilledOrderRejectsReplay() public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        bytes memory _signature = _sign(_terms);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
        vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_OrderUnavailable.selector);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
    }

    /// @notice Settlement rejects the exact expiration second.
    function testExpirationEqualityRejected() public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        bytes memory _signature = _sign(_terms);
        vm.warp(_terms.expiration);
        vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_OrderExpired.selector);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
    }

    /// @notice A successful fill emits exactly the agreed indexed lifecycle identity and parties.
    function testSuccessfulFillEmitsOrderFilled() public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        bytes memory _signature = _sign(_terms);
        vm.expectEmit(true, true, true, true, address(_settlement));
        emit IPrivateTradeSettlement.OrderFilled(_settlement.hashOrder(_terms), _maker, _taker);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
    }

    /// @notice A token callback cannot enter settlement while a transfer is in progress.
    function testTokenCallbackCannotReenterSettlement() public {
        CallbackToken _token = new CallbackToken(_maker, _taker);
        vm.prank(_maker);
        _token.approve(address(_settlement), type(uint256).max);
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.makerToken = address(_token);
        bytes memory _signature = _sign(_terms);
        _token.arm(address(_settlement), abi.encodeCall(_settlement.settle, (_terms, _signature)));
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
        assertFalse(_token.callbackSucceeded());
        assertEq(_token.callbackResult(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector));
        assertEq(uint8(_settlement.orderStatus(_settlement.hashOrder(_terms))), 1);
    }

    /// @notice Both first/second transfer failures roll back balances and identity, permitting retry.
    /// @param _first Whether the failing token is the first transfer.
    /// @param _reverts Whether the token reverts rather than returning false.
    function testFuzzFailedTransferRollsBackAndCanRetry(bool _first, bool _reverts) public {
        FailureToken _token = new FailureToken(_maker, _taker);
        IPrivateTradeSettlement.Order memory _terms = _order();
        if (_first) {
            _terms.makerToken = address(_token);
        } else {
            _terms.takerToken = address(_token);
            _terms.takerAmount = 2_000_000;
        }
        vm.prank(_first ? _maker : _taker);
        _token.approve(address(_settlement), type(uint256).max);
        bytes memory _signature = _sign(_terms);
        _token.configure(!_reverts, _reverts);
        vm.expectRevert();
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
        assertEq(_token.balanceOf(_maker), 1_000_000_000_000);
        assertEq(_token.balanceOf(_taker), 1_000_000_000_000);
        assertEq(_makerToken.balanceOf(_maker), 1_000_000_000_000);
        assertEq(_makerToken.balanceOf(_taker), 1_000_000_000_000);
        assertEq(_takerToken.balanceOf(_maker), 1_000_000 ether);
        assertEq(_takerToken.balanceOf(_taker), 1_000_000 ether);
        assertEq(uint8(_settlement.orderStatus(_settlement.hashOrder(_terms))), 0);
        _token.configure(false, false);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
        assertEq(uint8(_settlement.orderStatus(_settlement.hashOrder(_terms))), 1);
    }

    /// @notice Unrestricted orders accept any eligible direct caller before their deadline.
    function testUnrestrictedFillJustBeforeExpiration() public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.restrictedTaker = address(0);
        bytes memory _signature = _sign(_terms);
        vm.warp(_terms.expiration - 1);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
        assertEq(_makerToken.balanceOf(_taker), 1_000_001_000_000);
    }

    /// @notice An unlimited order remains executable at a distant timestamp.
    function testUnlimitedExpiration() public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.expiration = type(uint256).max;
        bytes memory _signature = _sign(_terms);
        vm.warp(type(uint64).max);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
        assertEq(uint8(_settlement.orderStatus(_settlement.hashOrder(_terms))), 1);
    }

    /// @notice Makers cannot execute their own offer even when unrestricted.
    function testMakerCannotSelfSettle() public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.restrictedTaker = address(0);
        bytes memory _signature = _sign(_terms);
        vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_WrongCaller.selector);
        vm.prank(_maker);
        _settlement.settle(_terms, _signature);
    }

    /// @notice Every structurally invalid order is rejected before token interaction.
    function testInvalidOrderFieldsRejected() public {
        for (uint256 _i; _i < 6; ++_i) {
            IPrivateTradeSettlement.Order memory _terms = _order();
            if (_i == 0) _terms.maker = address(0);
            else if (_i == 1) _terms.makerToken = address(0);
            else if (_i == 2) _terms.takerToken = address(0);
            else if (_i == 3) _terms.takerToken = _terms.makerToken;
            else if (_i == 4) _terms.makerAmount = 0;
            else _terms.takerAmount = 0;
            bytes memory _signature = _sign(_terms);
            vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_InvalidOrder.selector);
            vm.prank(_taker);
            _settlement.settle(_terms, _signature);
        }
    }

    /// @notice None of the eight signed members can be changed under the original signature.
    function testEverySignedFieldTamperingRejected() public {
        bytes memory _signature = _sign(_order());
        for (uint256 _i; _i < 8; ++_i) {
            IPrivateTradeSettlement.Order memory _terms = _order();
            if (_i == 0) _terms.maker = address(5);
            else if (_i == 1) _terms.restrictedTaker = address(0);
            else if (_i == 2) _terms.makerToken = address(5);
            else if (_i == 3) _terms.takerToken = address(5);
            else if (_i == 4) ++_terms.makerAmount;
            else if (_i == 5) ++_terms.takerAmount;
            else if (_i == 6) ++_terms.expiration;
            else _terms.salt = bytes32(uint256(2));
            vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_InvalidSignature.selector);
            vm.prank(_taker);
            _settlement.settle(_terms, _signature);
        }
    }

    /// @notice Other chains and deployments cannot authorize this settlement.
    function testWrongChainAndContractSignaturesRejected() public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        uint256 _originalChain = block.chainid;
        vm.chainId(_originalChain + 1);
        bytes memory _wrongChain = _sign(_terms);
        vm.chainId(_originalChain);
        vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_InvalidSignature.selector);
        vm.prank(_taker);
        _settlement.settle(_terms, _wrongChain);
        PrivateTradeSettlement _other = new PrivateTradeSettlement();
        (uint8 _v, bytes32 _r, bytes32 _s) = vm.sign(_MAKER_KEY, _other.hashOrder(_terms));
        vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_InvalidSignature.selector);
        vm.prank(_taker);
        _settlement.settle(_terms, abi.encodePacked(_r, _s, _v));
    }

    /// @notice Malformed, compact, invalid-v, and high-s signatures are rejected.
    function testMalformedSignaturesRejected() public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        bytes[4] memory _signatures;
        _signatures[0] = hex"";
        _signatures[1] = new bytes(64);
        _signatures[2] = _sign(_terms);
        _signatures[2][64] = bytes1(uint8(0));
        _signatures[3] = abi.encodePacked(bytes32(uint256(1)), bytes32(type(uint256).max), uint8(27));
        for (uint256 _i; _i < 4; ++_i) {
            vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_InvalidSignature.selector);
            vm.prank(_taker);
            _settlement.settle(_terms, _signatures[_i]);
        }
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
