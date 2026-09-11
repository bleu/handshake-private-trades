// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPrivateTradeSettlement} from "../src/interfaces/IPrivateTradeSettlement.sol";
import {SettlementFixture} from "./fixtures/SettlementFixture.sol";
import {CallbackToken} from "./fixtures/CallbackToken.sol";

/// @title CancellationTest
/// @notice Tests maker cancellation through the public contract lifecycle.
contract CancellationTest is SettlementFixture {
    /// @notice The maker can invalidate an expired, unsigned order without any token funding.
    function testMakerCancelsExpiredUnsignedOrder() public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.expiration = 0;
        _terms.makerAmount = type(uint256).max;
        bytes32 _id = _settlement.hashOrder(_terms);
        vm.expectEmit(true, true, false, true, address(_settlement));
        emit IPrivateTradeSettlement.OrderCancelled(_id, _maker);
        vm.prank(_maker);
        _settlement.cancel(_terms);
        assertEq(uint8(_settlement.orderStatus(_id)), 2);
    }

    /// @notice A taker cannot cancel someone else's unsigned terms.

    function testWrongCallerCannotCancel() public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_WrongCaller.selector);
        vm.prank(_taker);
        _settlement.cancel(_terms);
    }

    /// @notice Cancellation is irreversible and cannot be repeated.
    function testRepeatedCancellationRejected() public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        vm.prank(_maker);
        _settlement.cancel(_terms);
        vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_OrderUnavailable.selector);
        vm.prank(_maker);
        _settlement.cancel(_terms);
    }

    /// @notice Token callbacks cannot cancel a different order even when its maker is the token.
    function testCallbackCannotCancelAnotherOrder() public {
        CallbackToken _token = new CallbackToken(_maker, _taker);
        vm.prank(_maker);
        _token.approve(address(_settlement), type(uint256).max);
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.makerToken = address(_token);
        IPrivateTradeSettlement.Order memory _other = _order();
        _other.maker = address(_token);
        bytes32 _otherId = _settlement.hashOrder(_other);
        _token.arm(address(_settlement), abi.encodeCall(_settlement.cancel, (_other)));
        bytes memory _signature = _sign(_terms);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
        assertFalse(_token.callbackSucceeded());
        assertEq(_token.callbackResult(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector));
        assertEq(uint8(_settlement.orderStatus(_otherId)), 0);
    }

    /// @notice The first successful operation wins either fill/cancel race ordering.
    /// @param _cancelFirst Whether cancellation executes first.
    function testFuzzFillCancelRace(bool _cancelFirst) public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        bytes memory _signature = _sign(_terms);
        if (_cancelFirst) {
            vm.prank(_maker);
            _settlement.cancel(_terms);
            vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_OrderUnavailable.selector);
            vm.prank(_taker);
            _settlement.settle(_terms, _signature);
            assertEq(_makerToken.balanceOf(_maker), 1_000_000_000_000);
            assertEq(uint8(_settlement.orderStatus(_settlement.hashOrder(_terms))), 2);
        } else {
            vm.prank(_taker);
            _settlement.settle(_terms, _signature);
            vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_OrderUnavailable.selector);
            vm.prank(_maker);
            _settlement.cancel(_terms);
            assertEq(_makerToken.balanceOf(_taker), 1_000_001_000_000);
            assertEq(uint8(_settlement.orderStatus(_settlement.hashOrder(_terms))), 1);
        }
    }

    /// @notice Cancellation needs only a nonzero maker and full identity, not valid trade inputs or approvals.
    function testCancellationIgnoresTradeValidityAndAllowance() public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.makerToken = address(0);
        _terms.takerAmount = 0;
        vm.prank(_maker);
        _makerToken.approve(address(_settlement), 0);
        vm.prank(_maker);
        _settlement.cancel(_terms);
        assertEq(uint8(_settlement.orderStatus(_settlement.hashOrder(_terms))), 2);
    }

    /// @notice Even a simulated zero-address caller cannot create a cancellation with a zero maker.
    function testZeroMakerCannotCancel() public {
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.maker = address(0);
        vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_WrongCaller.selector);
        vm.prank(address(0));
        _settlement.cancel(_terms);
    }
}
