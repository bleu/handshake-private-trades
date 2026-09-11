// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import {IPrivateTradeSettlement} from "./interfaces/IPrivateTradeSettlement.sol";

/// @title PrivateTradeSettlement
/// @notice Immutable domain-bound private order identities; writes remain disabled in this skeleton.
contract PrivateTradeSettlement is IPrivateTradeSettlement, EIP712 {
    /// @notice Exact schema identifier shared with every frontend order consumer.
    bytes32 internal constant _ORDER_TYPEHASH = keccak256(
        "Order(address maker,address restrictedTaker,address makerToken,address takerToken,uint256 makerAmount,uint256 takerAmount,uint256 expiration,bytes32 salt)"
    );

    /// @notice Terminal state for each domain-bound order identity.
    mapping(bytes32 _orderId => Status _status) internal _orderStatuses;

    /// @notice Binds signatures to Private Trade Links version 1 and this deployment.
    constructor() EIP712("Private Trade Links", "1") {}

    /// @inheritdoc IPrivateTradeSettlement
    function hashOrder(Order calldata _order) public view returns (bytes32 _orderId) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    _ORDER_TYPEHASH,
                    _order.maker,
                    _order.restrictedTaker,
                    _order.makerToken,
                    _order.takerToken,
                    _order.makerAmount,
                    _order.takerAmount,
                    _order.expiration,
                    _order.salt
                )
            )
        );
    }

    /// @inheritdoc IPrivateTradeSettlement
    function orderStatus(bytes32 _orderId) external view returns (Status _status) {
        return _orderStatuses[_orderId];
    }

    /// @inheritdoc IPrivateTradeSettlement
    function settle(Order calldata, bytes calldata) external pure {
        revert PrivateTradeSettlement_NotImplemented();
    }

    /// @inheritdoc IPrivateTradeSettlement
    function cancel(Order calldata) external pure {
        revert PrivateTradeSettlement_NotImplemented();
    }
}
