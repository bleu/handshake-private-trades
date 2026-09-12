import { randomBytes } from "node:crypto";
import { zeroAddress } from "viem";
import { createDeploymentRegistry } from "../src/config/deployments";
import {
  encodeOrderLink,
  orderTypedData,
  orderId,
  type Order,
} from "../src/domain/orders";
import { deployToken, localWallet, maker } from "./local-token";

export const tradeRegistry = createDeploymentRegistry({
  enableAnvil: true,
  publicBuild: false,
});
export async function tradeFixture(overrides: Partial<Order> = {}) {
  const deployment = tradeRegistry[0];
  if (!deployment) throw new Error("Missing local deployment");
  const order: Order = {
    maker,
    restrictedTaker: zeroAddress,
    makerToken: await deployToken(),
    takerToken: await deployToken(),
    makerAmount: 50000000n,
    takerAmount: 2000000n,
    expiration: BigInt(Math.floor(Date.now() / 1000)) + 3600n,
    salt: `0x${randomBytes(32).toString("hex")}`,
    ...overrides,
  };
  const signature = await localWallet.signTypedData({
    ...orderTypedData(order, deployment.domain),
    account: order.maker,
  });
  const signed = { order, signature, deploymentId: 2 };
  const payload = await encodeOrderLink(signed, tradeRegistry);
  return { signed, payload, deployment, id: orderId(order, deployment.domain) };
}
