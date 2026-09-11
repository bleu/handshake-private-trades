// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Vm} from "forge-std/Vm.sol";

import {DevelopmentToken} from "../script/DevelopmentToken.sol";
import {IPrivateTradeSettlement} from "../src/interfaces/IPrivateTradeSettlement.sol";
import {BoundaryToken} from "./fixtures/BoundaryToken.sol";
import {CallbackToken} from "./fixtures/CallbackToken.sol";
import {SettlementFixture} from "./fixtures/SettlementFixture.sol";

/// @title AdversarialLifecycleTest
/// @notice Exercises full-range transfers, competing calls, recovery, and callback isolation.
contract AdversarialLifecycleTest is SettlementFixture {
    /// @notice Full uint256 transfer amounts and expiration do not overflow settlement arithmetic.
    function testFullUint256AmountsSettle() public {
        BoundaryToken _offered = new BoundaryToken(_maker, type(uint256).max);
        BoundaryToken _requested = new BoundaryToken(_taker, type(uint256).max);
        vm.prank(_maker);
        _offered.approve(address(_settlement), type(uint256).max);
        vm.prank(_taker);
        _requested.approve(address(_settlement), type(uint256).max);
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.makerToken = address(_offered);
        _terms.takerToken = address(_requested);
        _terms.makerAmount = type(uint256).max;
        _terms.takerAmount = type(uint256).max;
        _terms.expiration = type(uint256).max;
        _terms.salt = bytes32(type(uint256).max);
        bytes memory _signature = _sign(_terms);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
        assertEq(_offered.balanceOf(_taker), type(uint256).max);
        assertEq(_requested.balanceOf(_maker), type(uint256).max);
        assertEq(_offered.balanceOf(_maker), 0);
        assertEq(_requested.balanceOf(_taker), 0);
    }

    /// @notice Either competing taker can win, but only the first successful fill exchanges assets.

    /// @param _competitorFirst Whether the second funded taker executes first.
    function testFuzzBothCompetingFillOrderings(bool _competitorFirst) public {
        address _competitor = address(0xCAFE);
        vm.prank(_taker);
        assertTrue(_takerToken.transfer(_competitor, 2 ether));
        vm.prank(_competitor);
        _takerToken.approve(address(_settlement), 2 ether);
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.restrictedTaker = address(0);
        bytes memory _signature = _sign(_terms);
        vm.prank(_competitorFirst ? _competitor : _taker);
        _settlement.settle(_terms, _signature);
        vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_OrderUnavailable.selector);
        vm.prank(_competitorFirst ? _taker : _competitor);
        _settlement.settle(_terms, _signature);
        assertEq(_makerToken.balanceOf(_maker), 999_999_000_000);
        assertEq(_makerToken.balanceOf(_competitor), _competitorFirst ? 1_000_000 : 0);
        assertEq(_makerToken.balanceOf(_taker), _competitorFirst ? 1_000_000_000_000 : 1_000_001_000_000);
    }

    /// @notice Restoring either participant's funding or approval permits retry without partial changes.
    /// @param _makerSide Whether the shortfall belongs to the maker.
    /// @param _balanceShortfall Whether balance rather than allowance is missing.
    function testFuzzRestoreFundingOrAllowance(bool _makerSide, bool _balanceShortfall) public {
        DevelopmentToken _token = _makerSide ? _makerToken : _takerToken;
        address _holder = _makerSide ? _maker : _taker;
        uint256 _balance = _token.balanceOf(_holder);
        vm.prank(_holder);
        if (_balanceShortfall) assertTrue(_token.transfer(address(0xDEAD), _balance));
        else _token.approve(address(_settlement), 0);
        uint256[4] memory _before = [
            _makerToken.balanceOf(_maker),
            _makerToken.balanceOf(_taker),
            _takerToken.balanceOf(_maker),
            _takerToken.balanceOf(_taker)
        ];
        IPrivateTradeSettlement.Order memory _terms = _order();
        bytes memory _signature = _sign(_terms);
        vm.recordLogs();
        vm.expectRevert();
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
        Vm.Log[] memory _logs = vm.getRecordedLogs();
        for (uint256 _i; _i < _logs.length; ++_i) {
            assertNotEq(_logs[_i].emitter, address(_settlement));
        }
        assertEq(_makerToken.balanceOf(_maker), _before[0]);
        assertEq(_makerToken.balanceOf(_taker), _before[1]);
        assertEq(_takerToken.balanceOf(_maker), _before[2]);
        assertEq(_takerToken.balanceOf(_taker), _before[3]);
        assertEq(uint8(_settlement.orderStatus(_settlement.hashOrder(_terms))), 0);
        if (_balanceShortfall) {
            vm.prank(address(0xDEAD));
            assertTrue(_token.transfer(_holder, _balance));
        } else {
            vm.prank(_holder);
            _token.approve(address(_settlement), _makerSide ? 1_000_000 : 2 ether);
        }
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
        assertEq(uint8(_settlement.orderStatus(_settlement.hashOrder(_terms))), 1);
    }

    /// @notice A callback cannot consume a separately valid, funded order.
    function testCallbackCannotFillAnotherEligibleOrder() public {
        CallbackToken _token = new CallbackToken(_maker, _taker);
        vm.prank(_maker);
        _token.approve(address(_settlement), type(uint256).max);
        vm.prank(_taker);
        assertTrue(_takerToken.transfer(address(_token), 2 ether));
        vm.prank(address(_token));
        _takerToken.approve(address(_settlement), 2 ether);
        IPrivateTradeSettlement.Order memory _other = _order();
        _other.restrictedTaker = address(_token);
        _other.salt = bytes32(uint256(99));
        bytes memory _otherSignature = _sign(_other);
        _token.arm(address(_settlement), abi.encodeCall(_settlement.settle, (_other, _otherSignature)));
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.makerToken = address(_token);
        bytes memory _signature = _sign(_terms);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
        assertFalse(_token.callbackSucceeded());
        assertEq(_token.callbackResult(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector));
        assertEq(uint8(_settlement.orderStatus(_settlement.hashOrder(_other))), 0);
        assertEq(_makerToken.balanceOf(_maker), 1_000_000_000_000);
        // The same order can settle normally after the callback returns.
        vm.prank(address(_token));
        _settlement.settle(_other, _otherSignature);
        assertEq(uint8(_settlement.orderStatus(_settlement.hashOrder(_other))), 1);
    }

    /// @notice Token code observes Filled before any external transfer completes.
    function testOrderConsumedBeforeTokenCallback() public {
        CallbackToken _token = new CallbackToken(_maker, _taker);
        vm.prank(_maker);
        _token.approve(address(_settlement), type(uint256).max);
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.makerToken = address(_token);
        bytes32 _id = _settlement.hashOrder(_terms);
        _token.arm(address(_settlement), abi.encodeCall(_settlement.orderStatus, (_id)));
        bytes memory _signature = _sign(_terms);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
        assertTrue(_token.callbackSucceeded());
        assertEq(_token.callbackResult(), abi.encode(IPrivateTradeSettlement.Status.Filled));
    }

    /// @notice The current order also rejects cancellation reentry during its own transfer.

    function testCallbackCannotCancelCurrentOrder() public {
        CallbackToken _token = new CallbackToken(_maker, _taker);
        vm.prank(_maker);
        _token.approve(address(_settlement), type(uint256).max);
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.makerToken = address(_token);
        _token.arm(address(_settlement), abi.encodeCall(_settlement.cancel, (_terms)));
        bytes memory _signature = _sign(_terms);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
        assertFalse(_token.callbackSucceeded());
        assertEq(_token.callbackResult(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector));
        assertEq(uint8(_settlement.orderStatus(_settlement.hashOrder(_terms))), 1);
    }
}
