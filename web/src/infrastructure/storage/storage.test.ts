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
