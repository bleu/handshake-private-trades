import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createPublicClient, http } from "viem";
import { orderId, orderSchema } from "../web/src/domain/orders/index.ts";
import { createDeploymentRegistry } from "../web/src/config/deployments.ts";

const url = new URL(process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545");
assert(
  url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
  "Local RPC required",
);
if (url.hostname === "localhost") url.hostname = "127.0.0.1";
if (!url.port) url.port = "8545";
const [deployment] = createDeploymentRegistry({
  enableAnvil: true,
  publicBuild: false,
});
const client = createPublicClient({ transport: http(url.toString()) });
assert.equal(await client.getChainId(), deployment.chainId);
const code = await client.getCode({ address: deployment.address });
assert(code && code !== "0x", "Settlement is not deployed");
execFileSync("forge", ["build"], { stdio: "inherit" });
const artifact = JSON.parse(
  readFileSync(
    "contracts/out/PrivateTradeSettlement.sol/PrivateTradeSettlement.json",
    "utf8",
  ),
);
// Compare compiled runtime, excluding only Solidity's constructor-set immutable slots.
const actual = Buffer.from(code.slice(2), "hex");
const expected = Buffer.from(
  artifact.deployedBytecode.object.replace(/^0x/, ""),
  "hex",
);
for (const references of Object.values(
  artifact.deployedBytecode.immutableReferences,
)) {
  for (const { start, length } of references) {
    actual.fill(0, start, start + length);
    expected.fill(0, start, start + length);
  }
}
assert.deepEqual(
  actual,
  expected,
  "Local address contains different compiled code; never remap a deployment ID",
);
const call = (functionName, args) =>
  client.readContract({ ...deployment, functionName, args });
const domain = await call("eip712Domain", []);
assert.equal(domain[1], deployment.domain.name);
assert.equal(domain[2], deployment.domain.version);
assert.equal(domain[3], BigInt(deployment.chainId));
assert.equal(domain[4].toLowerCase(), deployment.address.toLowerCase());
const fixture = JSON.parse(readFileSync("fixtures/order-hashes.json", "utf8"));
const order = {
  ...fixture.order,
  makerAmount: BigInt(fixture.order.makerAmount),
  takerAmount: BigInt(fixture.order.takerAmount),
  expiration: BigInt(fixture.order.expiration),
};
assert.equal(
  await call("hashOrder", [order]),
  orderId(orderSchema.parse(order), deployment.domain),
);
console.log(
  "PASS: compiled code, chain, fixed address, EIP-712 domain and hashOrder parity.",
);
