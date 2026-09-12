import { readFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
} from "viem";
import { anvil } from "viem/chains";
import { z } from "zod";

export const maker = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
export const taker = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
export const settlement = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" as const;
export const localClient = createPublicClient({
  chain: anvil,
  transport: http("http://127.0.0.1:8545"),
});
export const localWallet = createWalletClient({
  account: maker,
  chain: anvil,
  transport: http("http://127.0.0.1:8545"),
});
export async function deployToken(
  kind: "ordinary" | "reset" = "ordinary",
): Promise<Address> {
  const artifact: unknown = JSON.parse(
    await readFile(
      `../contracts/out/${kind === "reset" ? "ResetApprovalToken" : "DevelopmentToken"}.sol/${kind === "reset" ? "ResetApprovalToken" : "DevelopmentToken"}.json`,
      "utf8",
    ),
  );
  const bytecode = z
    .object({
      bytecode: z.object({ object: z.string().regex(/^0x[0-9a-f]+$/i) }),
    })
    .parse(artifact).bytecode.object as `0x${string}`;
  const hash =
    kind === "reset"
      ? await localWallet.deployContract({
          abi: parseAbi(["constructor(address maker,address taker)"]),
          bytecode,
          args: [maker, taker],
        })
      : await localWallet.deployContract({
          abi: parseAbi([
            "constructor(string symbol, uint8 decimals, address maker, address taker)",
          ]),
          bytecode,
          args: ["BROWSER", 6, maker, taker],
        });
  const receipt = await localClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error("Token deployment failed");
  return receipt.contractAddress;
}
