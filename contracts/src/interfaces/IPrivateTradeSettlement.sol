// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title IPrivateTradeSettlement
/// @notice Immutable full-amount private order settlement and individual cancellation.
interface IPrivateTradeSettlement {
    /// @notice Exact EIP-712 signed order schema. Field names and ordering determine identity.
    /// @param maker The token owner offering the maker amount.
    /// @param restrictedTaker The only eligible taker, or zero for unrestricted orders.
    /// @param makerToken The ERC-20 offered by the maker.
    /// @param takerToken The ERC-20 requested from the taker.
    /// @param makerAmount The maker transfer amount in integer base units.
    /// @param takerAmount The taker transfer amount in integer base units.
    /// @param expiration Unix seconds at or after which settlement is forbidden.
    /// @param salt Independently generated identity salt.
    struct Order {
        address maker;
        address restrictedTaker;
        address makerToken;
        address takerToken;
        uint256 makerAmount;
        uint256 takerAmount;
        uint256 expiration;
        bytes32 salt;
    }

    /// @notice Stored lifecycle only; unused does not establish existence or executability.
    /// @param Unused Neither filled nor cancelled.
    /// @param Filled Both token transfer calls completed successfully.
    /// @param Cancelled The maker irreversibly invalidated this identity.
    enum Status {
        Unused,
        Filled,
        Cancelled
    }

    /// @notice The order fields cannot describe a valid exchange.
    error PrivateTradeSettlement_InvalidOrder();
    /// @notice The supplied signature does not authenticate the maker.
    error PrivateTradeSettlement_InvalidSignature();
    /// @notice The caller is not eligible for this operation.
    error PrivateTradeSettlement_WrongCaller();
    /// @notice A terminal order cannot be filled or cancelled again.
    error PrivateTradeSettlement_OrderUnavailable();
    /// @notice The order's settlement deadline has been reached.
    error PrivateTradeSettlement_OrderExpired();
    /// @notice This development skeleton does not yet enable the requested write.
    error PrivateTradeSettlement_NotImplemented();

    /// @notice Emitted after both transfer calls succeed.
    /// @param orderId The complete domain-bound order identity.
    /// @param maker The maker who paid maker tokens.
    /// @param taker The caller who paid taker tokens.
    event OrderFilled(bytes32 indexed orderId, address indexed maker, address indexed taker);
    /// @notice Emitted when the maker invalidates an unused identity.
    /// @param orderId The complete domain-bound order identity.
    /// @param maker The maker who cancelled.
    event OrderCancelled(bytes32 indexed orderId, address indexed maker);

    /// @notice Computes the complete EIP-712 digest without asserting validity or registration.
    /// @param _order The full signed order fields.
    /// @return _orderId The identity bound to this chain and contract.
    function hashOrder(Order calldata _order) external view returns (bytes32 _orderId);

    /// @notice Reads stored lifecycle status, independent of expiration and funding.
    /// @param _orderId The complete EIP-712 digest.
    /// @return _status Unused, Filled, or Cancelled.
    function orderStatus(bytes32 _orderId) external view returns (Status _status);

    /// @notice Exchanges both full amounts with the caller as the taker.
    /// @param _order The full order fields.
    /// @param _signature Standard 65-byte maker ECDSA signature.
    function settle(Order calldata _order, bytes calldata _signature) external;

    /// @notice Allows only the maker to invalidate an unused order, without a signature.
    /// @param _order The full order fields, even if expired or not yet signed.
    function cancel(Order calldata _order) external;
}
