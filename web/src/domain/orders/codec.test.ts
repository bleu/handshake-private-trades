import assert from "node:assert/strict";
import { test } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import {
  decodeOrderLink,
  encodeOrderLink,
  orderSchema,
  orderTypedData,
} from "./index.ts";

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
const order = orderSchema.parse({
  maker: maker.address,
  restrictedTaker: "0x" + "00".repeat(20),
  makerToken: "0x" + "11".repeat(20),
  takerToken: "0x" + "22".repeat(20),
  makerAmount: 1n,
  takerAmount: (1n << 256n) - 1n,
  expiration: 0n,
  salt: "0x" + "ff".repeat(32),
});

await test("canonical link is exactly 275 bytes and preserves full integer ranges and expired terms", async () => {
  const signature = await maker.signTypedData(
    orderTypedData(order, deployment.domain),
  );
  const payload = await encodeOrderLink({ order, signature, deploymentId: 1 }, [
    deployment,
  ]);
  assert.equal(payload.length, 367);
  const bytes = Buffer.from(payload, "base64url");
  assert.equal(bytes.length, 275);
  assert.equal(bytes.subarray(0, 2).toString("hex"), "0101");
  assert.equal(
    bytes.subarray(2, 22).toString("hex"),
    maker.address.slice(2).toLowerCase(),
  );
  assert.equal(bytes.subarray(22, 42).toString("hex"), "00".repeat(20));
  assert.equal(bytes.subarray(42, 62).toString("hex"), "11".repeat(20));
  assert.equal(bytes.subarray(62, 82).toString("hex"), "22".repeat(20));

  assert.equal(bytes.subarray(82, 114).toString("hex"), "0".repeat(63) + "1");
  assert.equal(bytes.subarray(114, 146).toString("hex"), "ff".repeat(32));
  assert.equal(bytes.subarray(146, 178).toString("hex"), "00".repeat(32));
  assert.equal(bytes.subarray(178, 210).toString("hex"), "ff".repeat(32));
  assert.equal(bytes.subarray(210).toString("hex"), signature.slice(2));
  const decoded = await decodeOrderLink(payload, [deployment]);
  assert.deepEqual(decoded.order, order);
  assert.equal(decoded.signature, signature);
  assert.equal(decoded.deploymentId, 1);
});

await test("decoder rejects noncanonical bounds, unknown headers and deployments before signature checks", async () => {
  const signature = await maker.signTypedData(
    orderTypedData(order, deployment.domain),
  );
  const valid = await encodeOrderLink({ order, signature, deploymentId: 1 }, [
    deployment,
  ]);
  const altered = (index: number, value: number) => {
    const bytes = Buffer.from(valid, "base64url");
    bytes[index] = value;
    return bytes.toString("base64url");
  };
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const final = alphabet.indexOf(valid.at(-1) ?? "");
  for (const malformed of [
    valid.slice(1),
    valid + "A",
    valid + "=",
    "+" + valid.slice(1),
    "/" + valid.slice(1),
    " " + valid.slice(1),
    valid.slice(0, -1) + alphabet.charAt(final + 1),
    altered(0, 0),
    altered(0, 2),
    altered(1, 0),
    altered(1, 3),
  ]) {
    await assert.rejects(async () => decodeOrderLink(malformed, [deployment]));
  }
  await assert.rejects(
    async () => decodeOrderLink(altered(1, 2), [deployment]),
    /Unsupported deployment/,
  );
  await assert.rejects(
    async () => decodeOrderLink(altered(0, 2), []),
    /version/,
  );
});

await test("links reject invalid fields and signatures rather than trusting signed transport bytes", async () => {
  const signature = await maker.signTypedData(
    orderTypedData(order, deployment.domain),
  );
  const payload = await encodeOrderLink({ order, signature, deploymentId: 1 }, [
    deployment,
  ]);
  for (const [start, end] of [
    [2, 22],
    [42, 62],
    [62, 82],
    [82, 114],
    [114, 146],
    [210, 275],
  ] as const) {
    const bytes = Buffer.from(payload, "base64url");
    bytes.fill(0, start, end);
    await assert.rejects(async () =>
      decodeOrderLink(bytes.toString("base64url"), [deployment]),
    );
  }
  const tampered = Buffer.from(payload, "base64url");
  tampered[113] = 2;
  await assert.rejects(
    async () => decodeOrderLink(tampered.toString("base64url"), [deployment]),
    /signature/,
  );
  await assert.rejects(
    async () =>
      encodeOrderLink({ order, signature: "0x00", deploymentId: 1 }, [
        deployment,
      ]),
    /signature/,
  );
  await assert.rejects(
    async () =>
      decodeOrderLink(payload, [
        { ...deployment, domain: { ...deployment.domain, chainId: 101 } },
      ]),
    /signature/,
  );
});

await test("Unlimited and maximum maker amount round-trip only through their configured development identity", async () => {
  const local = { id: 2, domain: { ...deployment.domain, chainId: 31337 } };
  const full = {
    ...order,
    makerAmount: (1n << 256n) - 1n,
    takerAmount: 1n,
    expiration: (1n << 256n) - 1n,
  };
  const signature = await maker.signTypedData(
    orderTypedData(full, local.domain),
  );
  const payload = await encodeOrderLink(
    { order: full, signature, deploymentId: 2 },
    [local],
  );
  assert.deepEqual((await decodeOrderLink(payload, [local])).order, full);
  await assert.rejects(
    () => decodeOrderLink(payload, [deployment]),
    /Unsupported deployment/,
  );
  await assert.rejects(
    () => encodeOrderLink({ order: full, signature, deploymentId: 3 }, [local]),
    /Unsupported deployment/,
  );
});

await test("encoding keeps the verified terms when the caller edits its input during signature recovery", async () => {
  const mutable = { ...order };
  const signature = await maker.signTypedData(
    orderTypedData(mutable, deployment.domain),
  );
  const pending = encodeOrderLink(
    { order: mutable, signature, deploymentId: 1 },
    [deployment],
  );
  mutable.makerAmount = 999n;
  const decoded = await decodeOrderLink(await pending, [deployment]);
  assert.equal(decoded.order.makerAmount, 1n);
});
