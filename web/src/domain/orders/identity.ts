import { hashTypedData, recoverTypedDataAddress } from "viem";
import type { Address } from "viem";
import { orderSchema } from "./schema.ts";
import type { Order } from "./schema.ts";

export type OrderDomain = Readonly<{
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}>;

const types = {
  Order: [
    { name: "maker", type: "address" },
    { name: "restrictedTaker", type: "address" },
    { name: "makerToken", type: "address" },
    { name: "takerToken", type: "address" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "salt", type: "bytes32" },
  ],
} as const;

export function orderTypedData(order: Order, domain: OrderDomain) {
  return {
    domain,
    types,
    primaryType: "Order" as const,
    message: orderSchema.parse(order),
  };
}

export function orderId(order: Order, domain: OrderDomain) {
  return hashTypedData(orderTypedData(order, domain));
}

/** Matches the contract's 65-byte, low-s ECDSA policy; performs no RPC calls. */
export async function verifyOrderSignature(
  order: Order,
  domain: OrderDomain,
  signature: string,
): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return false;
  const s = BigInt("0x" + signature.slice(66, 130));
  const v = Number.parseInt(signature.slice(130), 16);
  if (
    s === 0n ||
    s > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n ||
    (v !== 27 && v !== 28)
  )
    return false;
  try {
    const typedData = orderTypedData(order, domain);
    const signer = await recoverTypedDataAddress({
      ...typedData,
      signature: signature as `0x${string}`,
    });
    return signer.toLowerCase() === typedData.message.maker.toLowerCase();
  } catch {
    return false;
  }
}
