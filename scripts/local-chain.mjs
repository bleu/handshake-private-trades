import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const url = new URL(process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545");
if (
  url.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
) {
  throw new Error("Local commands require a loopback HTTP RPC URL.");
}
// Use one endpoint for both node startup and all clients.
if (url.hostname === "localhost") url.hostname = "127.0.0.1";
if (!url.port) url.port = "8545";
const rpc = url.toString();
const bindHost = url.hostname.replace(/^\[|\]$/g, "");
const maker = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const taker = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const recordPath = ".scratch/local-chain.json";
const run = (tool, args) =>
  execFileSync(tool, args, { encoding: "utf8" }).trim();
const cast = (...args) => run("cast", [...args, "--rpc-url", rpc]);
const requireLocalChain = () => {
  if (cast("chain-id") !== "31337")
    throw new Error("Expected development chain 31337.");
  if (!cast("rpc", "web3_clientVersion").toLowerCase().includes("anvil")) {
    throw new Error("Expected a local Anvil node.");
  }
};
const action = process.argv[2];
if (action === "start") {
  const child = spawn(
    "anvil",
    [
      "--host",
      bindHost,
      "--port",
      url.port,
      "--chain-id",
      "31337",
      "--accounts",
      "10",
      "--balance",
      "10000",
      "--mnemonic",
      "test test test test test test test test test test test junk",
    ],
    { stdio: "inherit" },
  );
  child.on("error", (error) => {
    throw error;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
} else {
  requireLocalChain();
  if (action === "reset") {
    cast("rpc", "anvil_reset");
    mkdirSync(".scratch", { recursive: true });
    writeFileSync(recordPath, "null\n");
    console.log(
      "Local chain reset. Run npm run local:fixtures to redeploy fixtures.",
    );
  } else if (action === "deploy") {
    const expected = "0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0";
    if (cast("code", expected) === "0x") {
      const nonce = Number(cast("nonce", maker));
      if (nonce === 0)
        run(process.execPath, ["scripts/local-chain.mjs", "fixtures"]);
      if (Number(cast("nonce", maker)) !== 2)
        throw new Error(
          "Unexpected maker nonce: use local:reset then local:deploy. ID 2 cannot be remapped.",
        );
      const result = JSON.parse(
        run("forge", [
          "create",
          "contracts/src/PrivateTradeSettlement.sol:PrivateTradeSettlement",
          "--broadcast",
          "--unlocked",
          "--from",
          maker,
          "--rpc-url",
          rpc,
          "--json",
        ]),
      );
      if (result.deployedTo.toLowerCase() !== expected)
        throw new Error("Unexpected settlement identity.");
    }
    // An existing deployment must still pass the same ABI/domain/connectivity checks.
    run(process.execPath, ["scripts/settlement-smoke.mjs"]);
    console.log("PASS: local deployment ID 2 is available at " + expected);
  } else if (action === "fixtures") {
    const tokens = [];
    for (const [symbol, decimals] of [
      ["DEV6", 6],
      ["DEV18", 18],
    ]) {
      const output = run("forge", [
        "create",
        "contracts/script/DevelopmentToken.sol:DevelopmentToken",
        "--broadcast",
        "--unlocked",
        "--from",
        maker,
        "--rpc-url",
        rpc,
        "--json",
        "--constructor-args",
        symbol,
        String(decimals),
        maker,
        taker,
      ]);
      const result = JSON.parse(output);
      if (!/^0x[0-9a-fA-F]{40}$/.test(result.deployedTo))
        throw new Error("Invalid deployment result.");
      tokens.push({ symbol, decimals, address: result.deployedTo });
    }
    mkdirSync(".scratch", { recursive: true });
    writeFileSync(
      recordPath,
      JSON.stringify({ chainId: 31337, maker, taker, tokens }, null, 2) + "\n",
    );
    console.log("Local token fixtures deployed. Run npm run local:smoke.");
  } else if (action === "smoke") {
    const state = JSON.parse(readFileSync(recordPath, "utf8"));
    if (!state || state.chainId !== 31337 || state.tokens.length !== 2)
      throw new Error("Deploy local fixtures first.");
    for (const account of [maker, taker]) {
      if (BigInt(cast("balance", account)) === 0n)
        throw new Error("Development account has no gas funds.");
    }
    for (const token of state.tokens) {
      if (
        Number(cast("call", token.address, "decimals()(uint8)")) !==
        token.decimals
      )
        throw new Error("Wrong fixture decimals.");
      for (const account of [maker, taker]) {
        const balance = cast(
          "call",
          token.address,
          "balanceOf(address)(uint256)",
          account,
        ).split(" ")[0];
        if (BigInt(balance) !== 1_000_000n * 10n ** BigInt(token.decimals))
          throw new Error("Wrong fixture balance.");
      }
    }
    console.log(
      "PASS: Anvil chain 31337, funded maker/taker, DEV6 and DEV18 balances and decimals.",
    );
  } else {
    throw new Error("Expected start, reset, fixtures, deploy, or smoke.");
  }
}
