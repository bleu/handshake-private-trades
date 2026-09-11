// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IPrivateTradeSettlement} from "../src/interfaces/IPrivateTradeSettlement.sol";
import {FeeToken} from "./fixtures/FeeToken.sol";
import {RebasingToken} from "./fixtures/RebasingToken.sol";
import {NoReturnToken} from "./fixtures/NoReturnToken.sol";
import {SettlementFixture} from "./fixtures/SettlementFixture.sol";

/// @title UnusualTokensTest
/// @notice Verifies the agreed transfer-success semantics without balance-delta enforcement.
contract UnusualTokensTest is SettlementFixture {
    /// @notice SafeERC20 accepts a successful transfer that returns no bytes.
    function testNoReturnTransferAccepted() public {
        NoReturnToken _token = new NoReturnToken(_maker, _taker);
        vm.prank(_maker);
        _token.approve(address(_settlement), type(uint256).max);
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.makerToken = address(_token);
        bytes memory _signature = _sign(_terms);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
        assertEq(_token.balanceOf(_taker), 1_000_001_000_000);
        assertEq(uint8(_settlement.orderStatus(_settlement.hashOrder(_terms))), 1);
    }

    /// @notice A successful fee-on-transfer call is accepted even though the taker receives less.

    function testFeeOnTransferUsesSuccessSemantics() public {
        FeeToken _token = new FeeToken(_maker, _taker);
        vm.prank(_maker);
        _token.approve(address(_settlement), type(uint256).max);
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.makerToken = address(_token);
        bytes memory _signature = _sign(_terms);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
        assertEq(_token.balanceOf(_maker), 999_999_000_000);
        assertEq(_token.balanceOf(_taker), 1_000_000_900_000);
        assertEq(_token.balanceOf(address(0xFEE)), 100_000);
        assertEq(uint8(_settlement.orderStatus(_settlement.hashOrder(_terms))), 1);
    }

    /// @notice A transfer-triggered positive rebase does not cause balance-delta rejection.
    function testRebaseDuringTransferUsesSuccessSemantics() public {
        RebasingToken _token = new RebasingToken(_maker, _taker);
        vm.prank(_maker);
        _token.approve(address(_settlement), type(uint256).max);
        IPrivateTradeSettlement.Order memory _terms = _order();
        _terms.makerToken = address(_token);
        bytes memory _signature = _sign(_terms);
        vm.prank(_taker);
        _settlement.settle(_terms, _signature);
        assertEq(_token.balanceOf(_maker), 1_999_998_000_000);
        assertEq(_token.balanceOf(_taker), 2_000_002_000_000);
        assertEq(uint8(_settlement.orderStatus(_settlement.hashOrder(_terms))), 1);
    }
}
