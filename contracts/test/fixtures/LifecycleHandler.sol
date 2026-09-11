// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {IPrivateTradeSettlement} from "../../src/interfaces/IPrivateTradeSettlement.sol";
import {PrivateTradeSettlement} from "../../src/PrivateTradeSettlement.sol";
import {DevelopmentToken} from "../../script/DevelopmentToken.sol";

/// @title LifecycleHandler
/// @notice Drives real public calls while tracking an independent eight-order lifecycle model.
contract LifecycleHandler is Test {
    /// @notice Settlement exercised by the stateful sequence.
    PrivateTradeSettlement private immutable _SETTLEMENT;
    /// @notice Ordinary maker-side fixture.
    DevelopmentToken private immutable _MAKER_TOKEN;
    /// @notice Ordinary taker-side fixture.
    DevelopmentToken private immutable _TAKER_TOKEN;
    /// @notice Maker EOA for the fixed development signing key.
    address private immutable _MAKER;
    /// @notice Direct taker EOA.
    address private immutable _TAKER;
    /// @notice Fixed signed deadline shared by the finite model population.
    uint256 private immutable _DEADLINE;
    /// @notice Expected first-success status per independently salted order.
    /// @return The model's Unused, Filled, or Cancelled state.
    uint8[8] public expectedStatus;
    /// @notice Whether any observed call disagreed with the model.
    /// @return True if a contract result violated expected behavior.
    bool public violation;

    /// @notice Binds the driver to already funded and approved public interfaces.
    /// @param _settlement Contract under test.
    /// @param _makerToken Maker-side token.
    /// @param _takerToken Taker-side token.
    /// @param _maker Maker EOA.
    /// @param _taker Taker EOA.
    constructor(
        PrivateTradeSettlement _settlement,
        DevelopmentToken _makerToken,
        DevelopmentToken _takerToken,
        address _maker,
        address _taker
    ) {
        _SETTLEMENT = _settlement;
        _MAKER_TOKEN = _makerToken;
        _TAKER_TOKEN = _takerToken;
        _MAKER = _maker;
        _TAKER = _taker;
        _DEADLINE = block.timestamp + 1 days;
    }

    /// @notice Attempts a fill and verifies success eligibility independently of contract status reads.
    /// @param _seed Chooses one of the model orders.
    function fill(uint256 _seed) external {
        uint256 _index = _seed % 8;
        IPrivateTradeSettlement.Order memory _terms = order(_index);
        // Test oracle intentionally follows the specified chain-time deadline.
        // forge-lint: disable-next-line(block-timestamp)
        bool _eligible = expectedStatus[_index] == 0 && block.timestamp < _DEADLINE
            && _MAKER_TOKEN.allowance(_MAKER, address(_SETTLEMENT)) >= 1_000_000
            && _TAKER_TOKEN.allowance(_TAKER, address(_SETTLEMENT)) >= 2 ether;
        (uint8 _v, bytes32 _r, bytes32 _s) = vm.sign(0xA11CE, _SETTLEMENT.hashOrder(_terms));
        vm.prank(_TAKER);
        try _SETTLEMENT.settle(_terms, abi.encodePacked(_r, _s, _v)) {
            if (!_eligible) violation = true;
            expectedStatus[_index] = 1;
        } catch {
            if (_eligible) violation = true;
        }
    }

    /// @notice Attempts cancellation and enforces first-success terminality.
    /// @param _seed Chooses one of the model orders.
    function cancel(uint256 _seed) external {
        uint256 _index = _seed % 8;
        bool _eligible = expectedStatus[_index] == 0;
        IPrivateTradeSettlement.Order memory _terms = order(_index);
        vm.prank(_MAKER);
        try _SETTLEMENT.cancel(_terms) {
            if (!_eligible) violation = true;
            expectedStatus[_index] = 2;
        } catch {
            if (_eligible) violation = true;
        }
    }

    /// @notice Revokes or restores either participant's public token approval.
    /// @param _makerReady Whether the maker grants allowance.
    /// @param _takerReady Whether the taker grants allowance.
    function approvals(bool _makerReady, bool _takerReady) external {
        vm.prank(_MAKER);
        _MAKER_TOKEN.approve(address(_SETTLEMENT), _makerReady ? type(uint256).max : 0);
        vm.prank(_TAKER);
        _TAKER_TOKEN.approve(address(_SETTLEMENT), _takerReady ? type(uint256).max : 0);
    }

    /// @notice Advances chain time across signed deadlines without altering stored status.
    /// @param _seconds Bounded forward time jump.
    function advanceTime(uint32 _seconds) external {
        vm.warp(block.timestamp + uint256(_seconds % 1 days));
    }

    /// @notice Returns a fixed model order for public identity and outcome checks.
    /// @param _index Order index, bounded to eight independent salts.
    /// @return _terms Fixed signed terms.
    function order(uint256 _index) public view returns (IPrivateTradeSettlement.Order memory _terms) {
        return IPrivateTradeSettlement.Order({
            maker: _MAKER,
            restrictedTaker: _TAKER,
            makerToken: address(_MAKER_TOKEN),
            takerToken: address(_TAKER_TOKEN),
            makerAmount: 1_000_000,
            takerAmount: 2 ether,
            expiration: _DEADLINE,
            salt: bytes32(_index % 8 + 1)
        });
    }
}
