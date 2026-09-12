import assert from "node:assert/strict";
import { test } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { createStorageAdapter } from "./index.ts";
import {
  encodeOrderLink,
  orderTypedData,
  orderSchema,
} from "../../domain/orders/index.ts";

const maker = privateKeyToAccount(
  "0x000000000000000000000000000000000000000000000000000000000000a11c",
);
const deployment = {
  id: 1,
  domain: {
    name: "Private Trade Links",
    version: "1",
    chainId: 100,
    verifyingContract: "0x0000000000000000000000000000000000001000" as const,
  },
};
const registry = [deployment];
const order = orderSchema.parse({
  maker: maker.address,
  restrictedTaker: "0x" + "00".repeat(20),
  makerToken: "0x" + "11".repeat(20),
  takerToken: "0x" + "22".repeat(20),
  makerAmount: 1234567n,
  takerAmount: 2000000000000000000n,
  expiration: 0n,
  salt: "0x" + "ab".repeat(32),
});
async function payload(salt = order.salt) {
  const terms = { ...order, salt };
  return encodeOrderLink(
    {
      order: terms,
      signature: await maker.signTypedData(
        orderTypedData(terms, deployment.domain),
      ),
      deploymentId: 1,
    },
    registry,
  );
}
class MemoryStorage {
  values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}
await test("maker history restores verified expired links and deduplicates by deployment and order identity", async () => {
  const backend = new MemoryStorage();
  const storage = createStorageAdapter(() => backend);
  const link = await payload();
  const saved = await storage.saveOrder(link, maker.address, registry);
  assert.equal(saved.ok, true);
  assert.equal(saved.url, `/trade#${link}`);
  await storage.saveOrder(link, maker.address, registry);
  const restored = await createStorageAdapter(() => backend).readOrders(
    maker.address,
    1,
    registry,
  );
  assert.equal(restored.value.length, 1);
  assert.ok(restored.value[0]);
  assert.deepEqual(restored.value[0].signed.order, order);
  assert.equal(restored.value[0].payload, link);
});
await test("restoring a link never writes taker history or accepts an invalid signed payload", async () => {
  const backend = new MemoryStorage();
  const storage = createStorageAdapter(() => backend);
  const link = await payload();
  const taker = "0x3333333333333333333333333333333333333333";
  await assert.rejects(() => storage.saveOrder(link, taker, registry), /maker/);
  await assert.rejects(() =>
    storage.saveOrder(link.slice(1), maker.address, registry),
  );
  assert.equal((await storage.readOrders(taker, 1, registry)).value.length, 0);
  assert.equal(
    (await storage.readOrders(maker.address, 1, registry)).value.length,
    0,
  );
});
await test("concurrent tabs preserve distinct orders while corrupt and mismatched records are isolated", async () => {
  const backend = new MemoryStorage();
  const first = createStorageAdapter(() => backend);
  const second = createStorageAdapter(() => backend);
  const links = await Promise.all([payload(), payload(`0x${"cd".repeat(32)}`)]);
  await Promise.all(
    links.map((link, index) =>
      (index === 0 ? first : second).saveOrder(link, maker.address, registry),
    ),
  );
  const prefix = `ptl:history:1:${maker.address.toLowerCase()}:`;
  backend.setItem(prefix + "bad", "{");
  backend.setItem(
    prefix + "wrong-id",
    JSON.stringify({ version: 1, payload: links[0] }),
  );
  const result = await first.readOrders(maker.address, 1, registry);
  assert.equal(result.value.length, 2);
  assert.deepEqual(
    new Set(result.value.map((entry) => entry.payload)),
    new Set(links),
  );
  assert.ok(result.error);
  assert.equal(
    (await second.readOrders(maker.address, 2, registry)).value.length,
    0,
  );
});

await test("storage denial retains a verified shareable link and reports failure without claiming persistence", async () => {
  const storage = createStorageAdapter(() => {
    throw new Error("Denied");
  });
  const link = await payload();
  const result = await storage.saveOrder(link, maker.address, registry);
  assert.equal(result.ok, false);
  assert.ok(result.error);
  assert.equal(result.url, `/trade#${link}`);
  assert.deepEqual(result.entry.signed.order, order);
  assert.ok((await storage.readOrders(maker.address, 1, registry)).error);
});
