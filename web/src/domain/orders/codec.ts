import { base64urlnopad } from "@scure/base";
import { bytesToHex, concatHex, hexToBytes, toHex } from "viem";
import { orderSchema } from "./schema.ts";
import type { Order } from "./schema.ts";
import { verifyOrderSignature } from "./identity.ts";
import type { OrderDomain } from "./identity.ts";

export type LinkDeployment = Readonly<{ id: number; domain: OrderDomain }>;
export type SignedOrderLink = Readonly<{
  deploymentId: number;
  order: Order;
  signature: `0x${string}`;
}>;

export async function encodeOrderLink(
  link: SignedOrderLink,
  deployments: readonly LinkDeployment[],
): Promise<string> {
  const { deploymentId, signature } = link;
  const order = orderSchema.parse(link.order);
  const deployment = deployments.find((entry) => entry.id === deploymentId);
  if (!deployment) throw new Error("Unsupported deployment.");
  if (!(await verifyOrderSignature(order, deployment.domain, signature)))
    throw new Error("Invalid maker signature.");
  return base64urlnopad.encode(
    hexToBytes(
      concatHex([
        "0x01",
        toHex(deploymentId, { size: 1 }),
        order.maker,
        order.restrictedTaker,
        order.makerToken,
        order.takerToken,
        toHex(order.makerAmount, { size: 32 }),
        toHex(order.takerAmount, { size: 32 }),
        toHex(order.expiration, { size: 32 }),
        order.salt,
        signature,
      ]),
    ),
  );
}

export async function decodeOrderLink(
  payload: string,
  deployments: readonly LinkDeployment[],
): Promise<SignedOrderLink> {
  if (!/^[A-Za-z0-9_-]{367}$/.test(payload))
    throw new Error("Invalid link bounds or alphabet.");
  const bytes = base64urlnopad.decode(payload);
  if (bytes.length !== 275 || base64urlnopad.encode(bytes) !== payload)
    throw new Error("Noncanonical link.");
  if (bytes[0] !== 1) throw new Error("Unsupported format version.");
  const deploymentId = bytes[1];
  const deployment = deployments.find((entry) => entry.id === deploymentId);
  if (deploymentId === undefined || !deployment)
    throw new Error("Unsupported deployment.");
  let offset = 2;
  const take = (length: number) => {
    const value = bytesToHex(bytes.slice(offset, offset + length));
    offset += length;
    return value;
  };
  const order = orderSchema.parse({
    maker: take(20),
    restrictedTaker: take(20),
    makerToken: take(20),
    takerToken: take(20),
    makerAmount: BigInt(take(32)),
    takerAmount: BigInt(take(32)),
    expiration: BigInt(take(32)),
    salt: take(32),
  });
  const signature = take(65);
  if (!(await verifyOrderSignature(order, deployment.domain, signature)))
    throw new Error("Invalid maker signature.");
  return { deploymentId, order, signature };
}
