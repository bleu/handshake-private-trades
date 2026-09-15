import { selectNetwork } from "./network-control";
import type { Page } from "@playwright/test";
import { erc20Abi } from "viem";
import { createStorageAdapter } from "../src/infrastructure/storage";
import { installAnvilWallet } from "./anvil-wallet";
import {
  deployToken,
  localClient,
  localWallet,
  settlement,
} from "./local-token";

export async function openApproval(
  page: Page,
  kind: "ordinary" | "reset" = "ordinary",
  initial = 0n,
  receiveToken = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
) {
  const token = await deployToken(kind);
  if (initial > 0n)
    await localClient.waitForTransactionReceipt({
      hash: await localWallet.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [settlement, initial],
      }),
    });
  const values = new Map<string, string>();
  const storage = createStorageAdapter(() => ({
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  }));
  storage.saveDraft(2, {
    makerToken: token,
    takerToken: receiveToken,
    makerAmount: "50",
    takerAmount: "1",
    stage: "review",
  });
  await page.addInitScript(
    (entries) => {
      for (const [key, value] of entries) localStorage.setItem(key, value);
    },
    [...values],
  );
  await installAnvilWallet(page);
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await selectNetwork(page, "31337");
  return token;
}
