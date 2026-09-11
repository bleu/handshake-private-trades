import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

for (const [name, overrides, succeeds] of [
  ["public missing address", {}, false],
  [
    "public zero address",
    {
      NEXT_PUBLIC_GNOSIS_SETTLEMENT_ADDRESS:
        "0x0000000000000000000000000000000000000000",
    },
    false,
  ],
  [
    "public malformed address",
    { NEXT_PUBLIC_GNOSIS_SETTLEMENT_ADDRESS: "invalid" },
    false,
  ],
  [
    "public Anvil",
    {
      NEXT_PUBLIC_ENABLE_ANVIL: "true",
      NEXT_PUBLIC_GNOSIS_SETTLEMENT_ADDRESS:
        "0x0000000000000000000000000000000000001000",
    },
    false,
  ],
  [
    "public synthetic configuration",
    {
      NEXT_PUBLIC_GNOSIS_SETTLEMENT_ADDRESS:
        "0x0000000000000000000000000000000000001000",
    },
    true,
  ],
  [
    "development Anvil",
    { NODE_ENV: "development", NEXT_PUBLIC_ENABLE_ANVIL: "true" },
    true,
  ],
]) {
  const result = spawnSync(
    process.execPath,
    ["web/src/config/deployments.ts"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_PUBLIC_ENABLE_ANVIL: "false",
        NEXT_PUBLIC_GNOSIS_SETTLEMENT_ADDRESS: "",
        ...overrides,
      },
    },
  );
  assert.equal(
    result.status === 0,
    succeeds,
    `${name}: unexpected configuration startup outcome`,
  );
  console.log(`PASS: ${name}`);
}
