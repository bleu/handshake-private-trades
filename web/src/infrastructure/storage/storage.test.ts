import assert from "node:assert/strict";
import { test } from "node:test";
import { createStorageAdapter } from "./index.ts";

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

await test("custom imports survive adapter recreation and remain partitioned by chain, not wallet", () => {
  const backend = new MemoryStorage();
  const storage = createStorageAdapter(() => backend);
  const token = {
    chainId: 100,
    address: "0x1111111111111111111111111111111111111111",
  };
  assert.deepEqual(storage.saveImport(token), { ok: true });
  assert.deepEqual(createStorageAdapter(() => backend).readImports(100), {
    value: [token],
  });
  assert.deepEqual(storage.readImports(31337), { value: [] });
  storage.saveImport(token);
  assert.equal(storage.readImports(100).value.length, 1);
});

await test("failed import writes report failure and malformed records do not erase valid imports", () => {
  const backend = new MemoryStorage();
  const storage = createStorageAdapter(() => backend);
  const token = {
    chainId: 100,
    address: "0x1111111111111111111111111111111111111111",
  };
  storage.saveImport(token);
  backend.setItem("ptl:imports:100:broken", "{");
  assert.deepEqual(storage.readImports(100).value, [token]);
  assert.ok(storage.readImports(100).error);
  const unavailable = createStorageAdapter(() => {
    throw new Error("Denied");
  });
  assert.equal(unavailable.saveImport(token).ok, false);
  assert.ok(unavailable.readImports(100).error);
  assert.deepEqual(storage.readImports(31337).value, []);
});

await test("partial drafts and review stage survive adapter recreation independently for each deployment", () => {
  const backend = new MemoryStorage();
  const storage = createStorageAdapter(() => backend);
  assert.equal(
    storage.saveDraft(2, {
      makerAmount: "1.",
      duration: "Unlimited",
      stage: "review",
    }).ok,
    true,
  );
  const restored = createStorageAdapter(() => backend).readDraft(2);
  assert.ok(restored.value);
  assert.equal(restored.value.draft.makerAmount, "1.");
  assert.equal(restored.value.draft.duration, "Unlimited");
  assert.equal(restored.value.draft.stage, "review");
  assert.equal(restored.value.draft.takerAmount, "");
  assert.deepEqual(storage.readDraft(1), { value: null });
});
await test("completed-draft cleanup preserves a newer draft when another tab edited while signing was outstanding", () => {
  const backend = new MemoryStorage();
  const storage = createStorageAdapter(() => backend);
  const completed = storage.saveDraft(2, { makerAmount: "10" });
  assert.ok(completed.ok);
  storage.saveDraft(2, { makerAmount: "20" });
  assert.equal(storage.clearDraft(2, completed.record.revision).ok, true);
  assert.equal(storage.readDraft(2).value?.draft.makerAmount, "20");
  const current = storage.readDraft(2).value;
  assert.ok(current);
  assert.equal(storage.clearDraft(2, current.revision).ok, true);
  assert.equal(storage.readDraft(2).value, null);
  storage.saveDraft(2, { makerAmount: "30" });
  assert.equal(storage.readDraft(2).value?.draft.makerAmount, "30");
});
await test("corrupt or denied draft storage reports errors without inventing saved terms", () => {
  const backend = new MemoryStorage();
  backend.setItem("ptl:draft:2", '{"version":999}');
  const storage = createStorageAdapter(() => backend);
  assert.equal(storage.readDraft(2).value, null);
  assert.ok(storage.readDraft(2).error);
  const denied = createStorageAdapter(() => {
    throw new Error("Denied");
  });
  assert.equal(denied.saveDraft(2, { makerAmount: "1." }).ok, false);
  assert.ok(denied.readDraft(2).error);
  assert.equal(
    denied.clearDraft(2, "11111111-1111-4111-8111-111111111111").ok,
    false,
  );
});

await test("history records retain their first local save time and legacy dates remain unknown", async (t) => {
  const { privateKeyToAccount } = await import("viem/accounts");
  const { orderSchema, orderTypedData, encodeOrderLink } =
    await import("../../domain/orders/index.ts");
  const account = privateKeyToAccount(
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
  const order = orderSchema.parse({
    maker: account.address,
    restrictedTaker: "0x" + "00".repeat(20),
    makerToken: "0x" + "11".repeat(20),
    takerToken: "0x" + "22".repeat(20),
    makerAmount: 1n,
    takerAmount: 2n,
    expiration: 100n,
    salt: "0x" + "ff".repeat(32),
  });
  const signature = await account.signTypedData(
    orderTypedData(order, deployment.domain),
  );
  const payload = await encodeOrderLink({ order, signature, deploymentId: 1 }, [
    deployment,
  ]);
  const backend = new MemoryStorage();
  const storage = createStorageAdapter(() => backend);
  t.mock.timers.enable({ apis: ["Date"], now: 1700000000000 });
  await storage.saveOrder(payload, account.address, [deployment]);
  t.mock.timers.tick(60000);
  await storage.saveOrder(payload, account.address, [deployment]);
  const read = await storage.readOrders(account.address, 1, [deployment]);
  assert.equal(read.value[0]?.savedAt, 1700000000000);
  const key = backend.key(0);
  assert.ok(key);
  backend.setItem(key, JSON.stringify({ version: 1, payload }));
  await storage.saveOrder(payload, account.address, [deployment]);
  assert.equal(
    (await storage.readOrders(account.address, 1, [deployment])).value[0]
      ?.savedAt,
    undefined,
  );
});
