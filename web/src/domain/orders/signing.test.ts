import assert from "node:assert/strict";
import { test } from "node:test";
import { signingOrder } from "./index.ts";

await test("a signing snapshot uses request-time duration and fresh identity while retaining its original terms", () => {
  const draft = {
    makerToken: "0x2222222222222222222222222222222222222222",
    takerToken: "0x3333333333333333333333333333333333333333",
    makerAmount: "1.5",
    takerAmount: "2",
    duration: "1 day",
  };
  const maker = "0x1111111111111111111111111111111111111111";
  const snapshot = signingOrder(
    draft,
    maker,
    { maker: 6, taker: 18 },
    100n,
    "0x" + "ab".repeat(32),
  );
  draft.makerAmount = "9";
  assert.equal(snapshot.makerAmount, 1500000n);
  assert.equal(snapshot.expiration, 86500n);
  const fresh = signingOrder(
    draft,
    maker,
    { maker: 6, taker: 18 },
    200n,
    "0x" + "cd".repeat(32),
  );
  assert.equal(fresh.expiration, 86600n);
  assert.equal(fresh.makerAmount, 9000000n);
  assert.notEqual(snapshot.salt, fresh.salt);
});
