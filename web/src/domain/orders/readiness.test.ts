import assert from "node:assert/strict";
import { test } from "node:test";
import { approvalPlan, orderSchema } from "./index.ts";
const maker = "0x1111111111111111111111111111111111111111";
const token = "0x2222222222222222222222222222222222222222";
const order = orderSchema.parse({
  maker,
  restrictedTaker: "0x" + "00".repeat(20),
  makerToken: token,
  takerToken: "0x" + "33".repeat(20),
  makerAmount: 80n,
  takerAmount: 1n,
  expiration: 200n,
  salt: "0x" + "ab".repeat(32),
});
const known = {
  order,
  orderId: "0x" + "aa".repeat(32),
  deploymentId: 1,
  status: 0 as const,
};
const input = {
  mode: "creation" as const,
  maker,
  token,
  deploymentId: 1,
  amount: 50n,
  balance: 100n,
  allowance: 0n,
  known: [known],
  now: 100n,
  historyAvailable: true,
};
await test("creation allows an individual 50 with balance100 and existing80 but warns about aggregate130", () => {
  const plan = approvalPlan(input);
  assert.equal(plan.balanceSufficient, true);
  assert.equal(plan.aggregateWarning, true);
  assert.equal(plan.exactTarget, 130n);
  assert.equal(plan.needsApproval, true);
  assert.equal(
    approvalPlan({ ...input, amount: 101n }).balanceSufficient,
    false,
  );
});
await test("approval targets deduplicate scoped open orders and exclude terminal or expired commitments", () => {
  const plan = approvalPlan({
    ...input,
    known: [
      known,
      known,
      { ...known, orderId: "filled", status: 1 },
      { ...known, orderId: "cancelled", status: 2 },
      { ...known, orderId: "expired", order: { ...order, expiration: 100n } },
      { ...known, orderId: "other-deployment", deploymentId: 2 },
      {
        ...known,
        orderId: "other-maker",
        order: { ...order, maker: order.takerToken },
      },
      {
        ...known,
        orderId: "other-token",
        order: { ...order, makerToken: order.takerToken },
      },
    ],
  });
  assert.equal(plan.exactTarget, 130n);
});
await test("acceptance skips approval when the selected amount is covered despite larger aggregate commitments", () => {
  const plan = approvalPlan({ ...input, mode: "acceptance", allowance: 50n });
  assert.equal(plan.exactTarget, 130n);
  assert.equal(plan.needsApproval, false);
  assert.equal(plan.balanceSufficient, true);
  assert.equal(
    approvalPlan({ ...input, mode: "acceptance", allowance: 49n })
      .needsApproval,
    true,
  );
});
await test("repair includes the viewed order once even when absent from local history", () => {
  assert.equal(
    approvalPlan({
      ...input,
      mode: "repair",
      amount: 80n,
      viewed: known,
      known: [],
    }).exactTarget,
    80n,
  );
  assert.equal(
    approvalPlan({ ...input, mode: "repair", amount: 80n, viewed: known })
      .exactTarget,
    80n,
  );
});
await test("unknown statuses or unavailable history disable exact totals without silently omitting commitments", () => {
  const plan = approvalPlan({
    ...input,
    known: [{ ...known, status: undefined }],
  });
  assert.equal(plan.exactTarget, undefined);
  assert.equal(plan.total, undefined);
  assert.equal(plan.aggregateUnavailable, true);
  assert.equal(
    approvalPlan({ ...input, historyAvailable: false }).exactTarget,
    undefined,
  );
  assert.equal(
    approvalPlan({
      ...input,
      mode: "acceptance",
      historyAvailable: false,
      allowance: 50n,
    }).needsApproval,
    false,
  );
});
await test("overflow disables the exact target while maximum remains available and sufficient for creation", () => {
  const max = (1n << 256n) - 1n;
  const plan = approvalPlan({
    ...input,
    known: [{ ...known, order: { ...order, makerAmount: max } }],
    allowance: max,
  });
  assert.equal(plan.total, max + 50n);
  assert.equal(plan.exactTarget, undefined);
  assert.equal(plan.maximumTarget, max);
  assert.equal(plan.needsApproval, false);
});
await test("unavailable history does not block creation with confirmed maximum allowance, but cannot authorize an exact target", () => {
  const max = (1n << 256n) - 1n;
  const plan = approvalPlan({
    ...input,
    historyAvailable: false,
    allowance: max,
  });
  assert.equal(plan.exactTarget, undefined);
  assert.equal(plan.aggregateUnavailable, true);
  assert.equal(plan.needsApproval, false);
  assert.equal(
    approvalPlan({ ...input, historyAvailable: false, allowance: 130n })
      .needsApproval,
    true,
  );
});
