import { execFileSync } from "node:child_process";
// Explicit non-deployment fixture, for compilation only. Never publish this output.
console.log(
  "Building with a synthetic Gnosis address for verification only. Do not publish this output.",
);
execFileSync("npm", ["run", "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_ENABLE_ANVIL: "false",
    NEXT_PUBLIC_GNOSIS_SETTLEMENT_ADDRESS:
      "0x0000000000000000000000000000000000001000",
  },
});
