import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Playwright owns this disposable chain. Never connect to an existing node.
const cwd = fileURLToPath(new URL("../", import.meta.url));
const rpc = "http://127.0.0.1:8545";
const maker = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const taker = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const execute = promisify(execFile);
const run = async (tool, args) =>
  (await execute(tool, args, { cwd })).stdout.trim();
const cast = (...args) => run("cast", [...args, "--rpc-url", rpc]);
const node = spawn(
  "anvil",
  [
    "--host",
    "127.0.0.1",
    "--port",
    "8545",
    "--chain-id",
    "31337",
    "--accounts",
    "10",
    "--balance",
    "10000",
    "--mnemonic",
    "test test test test test test test test test test test junk",
  ],
  { cwd, stdio: ["ignore", "pipe", "inherit"] },
);
let stopping = false;
const stop = () => {
  stopping = true;
  node.kill("SIGTERM");
};
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
node.on("exit", (code) => {
  if (!stopping) process.exitCode = code || 1;
});

try {
  // Wait for this child's bind, not a response from somebody else's RPC server.
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Anvil startup timed out")),
      30_000,
    );
    let output = "";
    const onOutput = (chunk) => {
      output += chunk.toString();
      if (output.includes("Listening on 127.0.0.1:8545")) {
        clearTimeout(timeout);
        node.stdout.off("data", onOutput);
        node.stdout.resume();
        resolve();
      }
    };
    node.stdout.on("data", onOutput);
    node.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    node.once("exit", (code) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Anvil exited before setup (code ${code}); port 8545 must be free`,
        ),
      );
    });
  });
  assert.equal(await cast("chain-id"), "31337");
  assert.match(
    (await cast("rpc", "web3_clientVersion")).toLowerCase(),
    /anvil/,
  );
  assert.equal(await cast("nonce", maker), "0");
  const deploy = async (contract, args = []) =>
    JSON.parse(
      await run("forge", [
        "create",
        contract,
        "--broadcast",
        "--unlocked",
        "--from",
        maker,
        "--rpc-url",
        rpc,
        "--json",
        ...args,
      ]),
    ).deployedTo;
  for (const [symbol, decimals] of [
    ["DEV6", 6],
    ["DEV18", 18],
  ]) {
    const token = await deploy(
      "contracts/script/DevelopmentToken.sol:DevelopmentToken",
      ["--constructor-args", symbol, String(decimals), maker, taker],
    );
    assert.equal(
      Number(await cast("call", token, "decimals()(uint8)")),
      decimals,
    );
    for (const account of [maker, taker]) {
      const balance = await cast(
        "call",
        token,
        "balanceOf(address)(uint256)",
        account,
      );
      assert.equal(
        BigInt(balance.split(" ")[0]),
        1_000_000n * 10n ** BigInt(decimals),
      );
      assert(BigInt(await cast("balance", account)) > 0n);
    }
  }
  const settlement = await deploy(
    "contracts/src/PrivateTradeSettlement.sol:PrivateTradeSettlement",
  );
  assert.equal(
    settlement.toLowerCase(),
    "0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0",
  );
  console.log(await run(process.execPath, ["scripts/settlement-smoke.mjs"]));
  console.log("Test chain ready");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  stop();
}
