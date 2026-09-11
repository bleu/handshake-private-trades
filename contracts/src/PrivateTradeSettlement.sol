// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import {IPrivateTradeSettlement} from "./interfaces/IPrivateTradeSettlement.sol";

/// @title PrivateTradeSettlement
/// @notice Atomic full-amount private trades with immutable domain-bound order identities.
contract PrivateTradeSettlement is IPrivateTradeSettlement, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;
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
    function settle(Order calldata _order, bytes calldata _signature) external nonReentrant {
        if (
            _order.maker == address(0) || _order.makerToken == address(0) || _order.takerToken == address(0)
                || _order.makerToken == _order.takerToken || _order.makerAmount == 0 || _order.takerAmount == 0
        ) {
            revert PrivateTradeSettlement_InvalidOrder();
        }
        if (
            msg.sender == _order.maker || (_order.restrictedTaker != address(0) && msg.sender != _order.restrictedTaker)
        ) {
            revert PrivateTradeSettlement_WrongCaller();
        }
        // The agreed Unix-second deadline is authoritative on the executing chain, not a randomness source.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp >= _order.expiration) revert PrivateTradeSettlement_OrderExpired();
        bytes32 _id = hashOrder(_order);
        if (_orderStatuses[_id] != Status.Unused) revert PrivateTradeSettlement_OrderUnavailable();
        (address _signer, ECDSA.RecoverError _error,) = ECDSA.tryRecover(_id, _signature);
        if (_error != ECDSA.RecoverError.NoError || _signer == address(0) || _signer != _order.maker) {
            revert PrivateTradeSettlement_InvalidSignature();
        }
        _orderStatuses[_id] = Status.Filled;
        IERC20(_order.makerToken).safeTransferFrom(_order.maker, msg.sender, _order.makerAmount);
        IERC20(_order.takerToken).safeTransferFrom(msg.sender, _order.maker, _order.takerAmount);
        emit OrderFilled(_id, _order.maker, msg.sender);
    }

    /// @inheritdoc IPrivateTradeSettlement
    function cancel(Order calldata _order) external nonReentrant {
        if (_order.maker == address(0) || msg.sender != _order.maker) revert PrivateTradeSettlement_WrongCaller();
        bytes32 _id = hashOrder(_order);
        if (_orderStatuses[_id] != Status.Unused) revert PrivateTradeSettlement_OrderUnavailable();
        _orderStatuses[_id] = Status.Cancelled;
        emit OrderCancelled(_id, _order.maker);
    }
}
