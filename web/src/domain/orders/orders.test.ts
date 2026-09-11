import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAmount, formatAmount, expirationAtSignature } from "./index.ts";

await test("decimal amounts retain exact base units beyond JavaScript number precision", () => {
  assert.equal(parseAmount("9007199254.740993", 6), 9007199254740993n);
});

await test("amount parsing rejects excess precision, invalid syntax, uint256 overflow, and invalid decimals", () => {
  for (const value of [
    "1.0000001",
    "-1",
    "+1",
    "1e3",
    "",
    ".",
    " 1",
    "1.",
    "1.2.3",
    "Infinity",
  ]) {
    assert.throws(() => parseAmount(value, 6), value);
  }
  assert.throws(() =>
    parseAmount(
      "115792089237316195423570985008687907853269984665640564039457584007913129639936",
      0,
    ),
  );
  for (const decimals of [-1, 256, 1.5, NaN])
    assert.throws(() => parseAmount("1", decimals));
  assert.equal(parseAmount("0", 0), 0n);
  assert.equal(
    parseAmount(
      "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      0,
    ),
    (1n << 256n) - 1n,
  );
});

await test("display preserves base units at zero, ordinary and uint8-max decimals", () => {
  assert.equal(formatAmount(9007199254740993n, 6), "9007199254.740993");
  assert.equal(formatAmount(1000000n, 6), "1");
  assert.equal(formatAmount(0n, 18), "0");
  assert.equal(formatAmount(42n, 0), "42");
  assert.equal(formatAmount(1n, 255), "0." + "0".repeat(254) + "1");
  assert.throws(() => formatAmount(-1n, 6));
  assert.throws(() => formatAmount(1n << 256n, 0));
  assert.throws(() => formatAmount(1n, 256));
});

await test("expiration starts at signature request and preserves the six exact duration choices", () => {
  assert.equal(expirationAtSignature("1 hour", 100n), 3700n);
  assert.equal(expirationAtSignature("1 day", 100n), 86500n);
  assert.equal(expirationAtSignature("1 week", 100n), 604900n);
  assert.equal(expirationAtSignature("1 month", 100n), 2592100n);
  assert.equal(expirationAtSignature("1 year", 100n), 31536100n);
  assert.equal(expirationAtSignature("Unlimited", 100n), (1n << 256n) - 1n);
  assert.throws(() => expirationAtSignature("1 hour", -1n));
  assert.throws(() => expirationAtSignature("1 day", (1n << 256n) - 1n));
});
