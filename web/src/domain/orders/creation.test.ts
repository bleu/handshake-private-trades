import assert from "node:assert/strict";
import { test } from "node:test";
import { creationDraftSchema, validateCreation } from "./index.ts";
const maker = "0x1111111111111111111111111111111111111111";
const draft = {
  makerToken: "0x2222222222222222222222222222222222222222",
  takerToken: "0x3333333333333333333333333333333333333333",
  makerAmount: "1.234567",
  takerAmount: "2.5",
  restrictedTaker: "",
  duration: "1 day",
  stage: "edit",
};
await test("partial creation drafts preserve incomplete strings while complete review terms use exact amounts", () => {
  assert.equal(
    creationDraftSchema.parse({ makerAmount: "1." }).makerAmount,
    "1.",
  );
  const terms = validateCreation(draft, maker, { maker: 6, taker: 18 });
  assert.equal(terms.makerAmount, 1234567n);
  assert.equal(terms.takerAmount, 2500000000000000000n);
  assert.equal(
    terms.restrictedTaker,
    "0x0000000000000000000000000000000000000000",
  );
  assert.equal(terms.duration, "1 day");
});
await test("review rejects identical tokens and a maker's self-restriction, including address casing", () => {
  assert.throws(
    () =>
      validateCreation({ ...draft, takerToken: draft.makerToken }, maker, {
        maker: 6,
        taker: 18,
      }),
    /different/,
  );
  assert.throws(
    () =>
      validateCreation({ ...draft, restrictedTaker: maker }, maker, {
        maker: 6,
        taker: 18,
      }),
    /maker/,
  );
});
await test("review rejects incomplete, zero and excessive-precision amounts while preserving draft input", () => {
  for (const makerAmount of ["", "1.", "0", "1.0000001", "1e2", "-1"]) {
    assert.equal(
      creationDraftSchema.parse({ makerAmount }).makerAmount,
      makerAmount,
    );
    assert.throws(() =>
      validateCreation({ ...draft, makerAmount }, maker, {
        maker: 6,
        taker: 18,
      }),
    );
  }
  assert.equal(creationDraftSchema.parse({}).duration, "1 day");
});
