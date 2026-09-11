// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {IPrivateTradeSettlement} from "../src/interfaces/IPrivateTradeSettlement.sol";
import {PrivateTradeSettlement} from "../src/PrivateTradeSettlement.sol";

/// @title HashOrderTest
/// @notice Verifies signed identities through the public settlement interface.
contract HashOrderTest is Test {
    /// @notice Settlement code running at the fixture's deployment address.
    PrivateTradeSettlement internal _settlement;

    /// @notice Sets the chain and deployment to the independent reference domain.
    function setUp() public {
        vm.chainId(100);
        PrivateTradeSettlement _source = new PrivateTradeSettlement();
        vm.etch(address(0x1000), address(_source).code);
        _settlement = PrivateTradeSettlement(address(0x1000));
    }

    /// @notice The complete domain-bound hash matches an independently generated EIP-712 digest.
    function testReferenceOrderIdentity() public view {
        assertEq(_settlement.hashOrder(_order()), _expected("base"));
    }

    /// @notice Every signed member changes identity and matches its independent digest.
    function testEverySignedFieldIsBound() public view {
        string[8] memory _keys = [
            "maker", "restrictedTaker", "makerToken", "takerToken", "makerAmount", "takerAmount", "expiration", "salt"
        ];
        for (uint256 _i; _i < 8; ++_i) {
            IPrivateTradeSettlement.Order memory _changed = _order();
            if (_i == 0) _changed.maker = address(5);
            else if (_i == 1) _changed.restrictedTaker = address(5);
            else if (_i == 2) _changed.makerToken = address(5);
            else if (_i == 3) _changed.takerToken = address(5);
            else if (_i == 4) ++_changed.makerAmount;
            else if (_i == 5) ++_changed.takerAmount;
            else if (_i == 6) ++_changed.expiration;
            else _changed.salt = 0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd;
            assertEq(_settlement.hashOrder(_changed), _expected(_keys[_i]));
            assertNotEq(_settlement.hashOrder(_changed), _expected("base"));
        }
    }

    /// @notice The executing chain and contract address are independently bound.
    function testChainAndContractDomainVariations() public {
        vm.chainId(101);
        assertEq(_settlement.hashOrder(_order()), _expected("domain_chainId"));
        vm.chainId(100);
        vm.etch(address(0x2000), address(_settlement).code);
        assertEq(PrivateTradeSettlement(address(0x2000)).hashOrder(_order()), _expected("domain_verifyingContract"));
    }

    /// @notice The immutable domain identifies name/version and rejects alternate identities.
    function testImmutableDomainNameAndVersion() public view {
        (bytes1 _fields, string memory _name, string memory _version, uint256 _chainId, address _contract,,) =
            _settlement.eip712Domain();
        assertEq(_fields, hex"0f");
        assertEq(_name, "Private Trade Links");
        assertEq(_version, "1");
        assertEq(_chainId, 100);
        assertEq(_contract, address(_settlement));
        assertNotEq(_settlement.hashOrder(_order()), _expected("domain_name"));
        assertNotEq(_settlement.hashOrder(_order()), _expected("domain_version"));
    }

    /// @notice Hashing registers nothing and unfinished cancellation cannot consume orders.
    function testSkeletonLeavesOrdersUnusedAndRejectsWrites() public {
        bytes32 _id = _settlement.hashOrder(_order());
        assertEq(uint8(_settlement.orderStatus(_id)), 0);
        vm.expectRevert(IPrivateTradeSettlement.PrivateTradeSettlement_NotImplemented.selector);
        _settlement.cancel(_order());
        assertEq(uint8(_settlement.orderStatus(_id)), 0);
    }

    /// @notice Reads a known digest from the shared fixture.
    /// @param _key Fixture variation name.
    /// @return _digest Independently generated expected digest.
    function _expected(string memory _key) internal view returns (bytes32 _digest) {
        return vm.parseJsonBytes32(vm.readFile("fixtures/order-hashes.json"), string.concat(".hashes.", _key));
    }

    /// @notice Supplies the canonical order terms used by the fixture.
    /// @return _result The unsigned order fields.
    function _order() internal pure returns (IPrivateTradeSettlement.Order memory _result) {
        return IPrivateTradeSettlement.Order({
            maker: address(1),
            restrictedTaker: address(2),
            makerToken: address(3),
            takerToken: address(4),
            makerAmount: 1_234_567,
            takerAmount: 2_000_000_000_000_000_000,
            expiration: 2_000_000_000,
            salt: 0xabababababababababababababababababababababababababababababababab
        });
    }
}
