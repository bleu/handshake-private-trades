import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";

const run = (command, args) =>
  execFileSync(command, args, { encoding: "utf8" }).trim();
const revision = run("git", ["rev-parse", "HEAD"]);
const dirty = run("git", ["status", "--porcelain"]) !== "";
execFileSync("forge", ["build", "--force", "--build-info"], {
  stdio: "inherit",
});
execFileSync("pnpm", ["run", "abi:check"], { stdio: "inherit" });
const target = "contracts/src/PrivateTradeSettlement.sol";
const name = "PrivateTradeSettlement";
const artifact = JSON.parse(
  readFileSync(`contracts/out/${name}.sol/${name}.json`, "utf8"),
);
const builds = readdirSync("contracts/out/build-info")
  .map((file) =>
    JSON.parse(readFileSync(`contracts/out/build-info/${file}`, "utf8")),
  )
  .filter((build) => build.output?.contracts?.[target]?.[name]);
if (builds.length !== 1)
  throw new Error("Expected one fresh settlement compiler input.");
const build = builds[0];
const compiled = build.output.contracts[target][name];
if (
  `0x${compiled.evm.bytecode.object.replace(/^0x/, "")}` !==
  artifact.bytecode.object
)
  throw new Error("Compiler output does not match the settlement artifact.");
const parent = ".scratch/release-candidates";
mkdirSync(parent, { recursive: true });
const directory = mkdtempSync(`${parent}/${revision.slice(0, 12)}-`);
const files = {
  "artifact.json": JSON.stringify(artifact, null, 2),
  "abi.json": JSON.stringify(artifact.abi, null, 2),
  "metadata.json": artifact.rawMetadata,
  "standard-input.json": JSON.stringify(
    {
      language: build.input.language,
      sources: build.input.sources,
      settings: build.input.settings,
    },
    null,
    2,
  ),
  "creation-bytecode.hex": artifact.bytecode.object,
  "runtime-template.hex": artifact.deployedBytecode.object,
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const checksums = {};
for (const [file, value] of Object.entries(files)) {
  writeFileSync(`${directory}/${file}`, `${value}\n`);
  checksums[file] = sha256(readFileSync(`${directory}/${file}`));
}
const manifest = {
  sourceRevision: revision,
  dirty,
  status: "not deployed; manual compatibility and release approval pending",
  contract: `${target}:${name}`,
  constructorArguments: [],
  compiler: artifact.metadata.compiler.version,
  settings: artifact.metadata.settings,
  node: process.version,
  pnpm: run("pnpm", ["--version"]),
  forge: run("forge", ["--version"]),
  forgeStdRevision: run("git", ["-C", "lib/forge-std", "rev-parse", "HEAD"]),
  pnpmLockSha256: sha256(readFileSync("pnpm-lock.yaml")),
  intendedDeployment: {
    id: 1,
    chainId: 100,
    address: null,
    transactionHash: null,
    verifiedSource: null,
  },
  runtimeNote:
    "Template contains EIP-712 constructor immutable slots; compare deployed runtime using artifact immutableReferences, then independently verify the domain and hashOrder.",
  checksums,
};
writeFileSync(
  `${directory}/manifest.json`,
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `Release bundle: ${directory} (${dirty ? "DIRTY: preparation only" : "clean source"})`,
);
