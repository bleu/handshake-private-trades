// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IPrivateTradeSettlement} from "../src/interfaces/IPrivateTradeSettlement.sol";
import {LifecycleHandler} from "./fixtures/LifecycleHandler.sol";
import {SettlementFixture} from "./fixtures/SettlementFixture.sol";

/// @title LifecycleInvariantTest
/// @notice Stateful public-operation sequences preserve terminal status and ordinary-token conservation.
contract LifecycleInvariantTest is SettlementFixture {
    /// @notice Public-operation driver and independent lifecycle model.
    LifecycleHandler private _handler;

    /// @inheritdoc SettlementFixture
    function setUp() public override {
        super.setUp();
        _handler = new LifecycleHandler(_settlement, _makerToken, _takerToken, _maker, _taker);
        bytes4[] memory _selectors = new bytes4[](4);
        _selectors[0] = LifecycleHandler.fill.selector;
        _selectors[1] = LifecycleHandler.cancel.selector;
        _selectors[2] = LifecycleHandler.approvals.selector;
        _selectors[3] = LifecycleHandler.advanceTime.selector;
        targetSelector(FuzzSelector({addr: address(_handler), selectors: _selectors}));
        targetContract(address(_handler));
    }

    /// @notice Every identity agrees with the independent first-success lifecycle model.
    function invariantLifecycleIsTerminalAndAtomic() public view {
        assertFalse(_handler.violation());
        uint256 _fills;
        for (uint256 _i; _i < 8; ++_i) {
            IPrivateTradeSettlement.Order memory _terms = _handler.order(_i);
            uint8 _expected = _handler.expectedStatus(_i);
            assertEq(uint8(_settlement.orderStatus(_settlement.hashOrder(_terms))), _expected);
            if (_expected == 1) ++_fills;
        }
        assertEq(_makerToken.balanceOf(_maker), 1_000_000_000_000 - _fills * 1_000_000);
        assertEq(_makerToken.balanceOf(_taker), 1_000_000_000_000 + _fills * 1_000_000);
        assertEq(_takerToken.balanceOf(_maker), 1_000_000 ether + _fills * 2 ether);
        assertEq(_takerToken.balanceOf(_taker), 1_000_000 ether - _fills * 2 ether);
    }
}
