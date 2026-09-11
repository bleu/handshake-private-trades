import assert from "node:assert/strict";
import { test } from "node:test";
import fixture from "../../../../fixtures/order-hashes.json" with { type: "json" };
import { privateKeyToAccount } from "viem/accounts";
import {
  orderSchema,
  orderId,
  orderTypedData,
  verifyOrderSignature,
} from "./index.ts";

const order = {
  ...fixture.order,
  makerAmount: 1234567n,
  takerAmount: 2000000000000000000n,
  expiration: 2000000000n,
};

await test("signed terms validate structural safety without rejecting historical expiration", () => {
  assert.equal(orderSchema.parse({ ...order, expiration: 0n }).expiration, 0n);
  for (const patch of [
    { maker: "0x" + "0".repeat(40) },
    { makerToken: "0x" + "0".repeat(40) },
    { takerToken: "0x" + "0".repeat(40) },
    { makerToken: order.takerToken },
    { makerAmount: 0n },
    { takerAmount: -1n },
    { makerAmount: 1n << 256n },
    { expiration: -1n },
    { expiration: 1n << 256n },
    { salt: "0x01" },
    { restrictedTaker: "0x1234" },
    { maker: order.maker + "\n" },
    { makerAmount: 1 },
    { extra: true },
  ])
    assert.equal(orderSchema.safeParse({ ...order, ...patch }).success, false);
});

await test("order identity matches independently generated Solidity fixtures for every field and domain", () => {
  const domain = {
    ...fixture.domain,
    verifyingContract: fixture.domain.verifyingContract as `0x${string}`,
  };
  assert.equal(orderId(orderSchema.parse(order), domain), fixture.hashes.base);
  for (const field of [
    "maker",
    "restrictedTaker",
    "makerToken",
    "takerToken",
  ] as const) {
    assert.equal(
      orderId(
        orderSchema.parse({
          ...order,
          [field]: "0x0000000000000000000000000000000000000005",
        }),
        domain,
      ),
      fixture.hashes[field],
    );
  }
  for (const field of ["makerAmount", "takerAmount", "expiration"] as const) {
    assert.equal(
      orderId(
        orderSchema.parse({ ...order, [field]: order[field] + 1n }),
        domain,
      ),
      fixture.hashes[field],
    );
  }
  assert.equal(
    orderId(
      orderSchema.parse({ ...order, salt: "0x" + "cd".repeat(32) }),
      domain,
    ),
    fixture.hashes.salt,
  );
  assert.equal(
    orderId(orderSchema.parse(order), { ...domain, name: "Other" }),
    fixture.hashes.domain_name,
  );
  assert.equal(
    orderId(orderSchema.parse(order), { ...domain, version: "2" }),
    fixture.hashes.domain_version,
  );
  assert.equal(
    orderId(orderSchema.parse(order), { ...domain, chainId: 101 }),
    fixture.hashes.domain_chainId,
  );
  assert.equal(
    orderId(orderSchema.parse(order), {
      ...domain,
      verifyingContract: "0x0000000000000000000000000000000000002000",
    }),
    fixture.hashes.domain_verifyingContract,
  );
});

await test("maker signature validation is bound to the terms, domain, and maker", async () => {
  const maker = privateKeyToAccount(
    ("0x" + "0".repeat(60) + "a11c") as `0x${string}`,
  );
  const terms = orderSchema.parse({ ...order, maker: maker.address });
  const domain = {
    ...fixture.domain,
    verifyingContract: fixture.domain.verifyingContract as `0x${string}`,
  };
  const signature = await maker.signTypedData(orderTypedData(terms, domain));
  assert.equal(await verifyOrderSignature(terms, domain, signature), true);
  assert.equal(
    await verifyOrderSignature(
      { ...terms, makerAmount: 1n },
      domain,
      signature,
    ),
    false,
  );
  assert.equal(
    await verifyOrderSignature(terms, { ...domain, chainId: 101 }, signature),
    false,
  );
  assert.equal(
    await verifyOrderSignature(orderSchema.parse(order), domain, signature),
    false,
  );
  for (const invalid of [
    "0x",
    signature.slice(0, -2),
    signature + "00",
    signature + "\n",
    signature.slice(0, -2) + "00",
    signature.slice(0, -2) + "01",
    "0x" + "00".repeat(64) + "1b",
  ]) {
    assert.equal(await verifyOrderSignature(terms, domain, invalid), false);
  }
  const highS = (
    0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n -
    BigInt("0x" + signature.slice(66, 130))
  )
    .toString(16)
    .padStart(64, "0");
  const malleable =
    signature.slice(0, 66) + highS + (signature.endsWith("1b") ? "1c" : "1b");
  assert.equal(await verifyOrderSignature(terms, domain, malleable), false);
});

await test("signature recovery compares against the maker captured in the hashed terms", async () => {
  const signer = privateKeyToAccount(
    "0x000000000000000000000000000000000000000000000000000000000000a11c",
  );
  const mutable = orderSchema.parse(order);
  const domain = {
    ...fixture.domain,
    verifyingContract: fixture.domain.verifyingContract as `0x${string}`,
  };
  const signature = await signer.signTypedData(orderTypedData(mutable, domain));
  assert.equal(await verifyOrderSignature(mutable, domain, signature), false);
  const pending = verifyOrderSignature(mutable, domain, signature);
  mutable.maker = signer.address;
  assert.equal(await pending, false);
  assert.equal(await verifyOrderSignature(mutable, domain, signature), false);
});
