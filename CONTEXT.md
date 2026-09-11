# Private Trades

A private trade exchanges two agreed token amounts between two parties atomically.

## Language

**Order**:
The maker's offer to exchange an exact amount of one token for an exact amount of another, subject to an expiration and an optional counterparty restriction.

**Maker**:
The party creating and signing an order.

**Order identity**:
The identity of one offer, shared by all copies of its signed terms. Separately created offers remain distinct even when their trade terms match; each can be settled or cancelled independently.

**Taker**:
The party accepting an order and supplying the requested asset.

**Trade link**:
A shareable representation of a signed order that lets a recipient review and accept its terms.

**Restricted order**:
An order that only the designated counterparty may accept.

**Unrestricted order**:
An order without a designated counterparty.

**Settlement**:
The atomic exchange of the entire agreed amounts between maker and taker.

**Cancellation**:
The maker's onchain invalidation of an unfilled order. Removing an order from local history is not cancellation.

**Expiration**:
The deadline at or after which an order may no longer settle.
