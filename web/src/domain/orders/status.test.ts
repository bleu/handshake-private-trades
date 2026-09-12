import assert from "node:assert/strict";
import { test } from "node:test";
import { tradeStatus, MAX_UINT256 } from "./index.ts";

await test("authoritative terminal status precedes expiration, while unavailable state never claims open or expired", () => {
  assert.equal(tradeStatus(1, 10n, 20n), "Filled");
  assert.equal(tradeStatus(2, 10n, 20n), "Cancelled");
  assert.equal(tradeStatus(0, 10n, 10n), "Expired");
  assert.equal(tradeStatus(0, MAX_UINT256, 20n), "Open");
  assert.equal(tradeStatus(undefined, 10n, 20n), "Status unavailable");
});
