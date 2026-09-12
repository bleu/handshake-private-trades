import assert from "node:assert/strict";
import { test } from "node:test";
import { settlementReadiness, orderSchema } from "./index.ts";

await test("settlement readiness requires an eligible caller and individual funding with authoritative open status", () => {
  const order = orderSchema.parse({
    maker: "0x1111111111111111111111111111111111111111",
    restrictedTaker: "0x2222222222222222222222222222222222222222",
    makerToken: "0x3333333333333333333333333333333333333333",
    takerToken: "0x4444444444444444444444444444444444444444",
    makerAmount: 50n,
    takerAmount: 20n,
    expiration: 100n,
    salt: "0x" + "ab".repeat(32),
  });
  const input = {
    order,
    caller: order.restrictedTaker,
    status: 0 as const,
    now: 10n,
    makerBalance: 50n,
    makerAllowance: 50n,
    takerBalance: 20n,
    takerAllowance: 20n,
  };
  assert.equal(settlementReadiness(input), undefined);
  assert.equal(
    settlementReadiness({ ...input, caller: order.maker }),
    "The maker cannot accept their own order.",
  );
  assert.equal(
    settlementReadiness({ ...input, caller: order.makerToken }),
    "This order is restricted to another wallet.",
  );
  assert.equal(
    settlementReadiness({ ...input, makerBalance: 49n }),
    "Maker balance is insufficient.",
  );
  assert.equal(
    settlementReadiness({ ...input, takerAllowance: undefined }),
    "Your allowance is unavailable.",
  );
  assert.equal(
    settlementReadiness({ ...input, status: 1 }),
    "Order is filled.",
  );
  assert.equal(
    settlementReadiness({ ...input, status: undefined }),
    "Status unavailable.",
  );
  assert.equal(
    settlementReadiness({ ...input, now: 100n }),
    "Order is expired.",
  );
});
