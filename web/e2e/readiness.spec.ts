import { expect, test } from "@playwright/test";
import { mnemonicToAccount } from "viem/accounts";
import { z } from "zod";
import { createStorageAdapter } from "../src/infrastructure/storage";
import {
  encodeOrderLink,
  orderTypedData,
  orderSchema,
} from "../src/domain/orders";
import { connectTokenWallet } from "./token-wallet";

const maker = mnemonicToAccount(
  "test test test test test test test test test test test junk",
);
const token = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const deployment = {
  id: 2,
  domain: {
    name: "Private Trade Links",
    version: "1",
    chainId: 31337,
    verifyingContract: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" as const,
  },
};
test("creation distinguishes individual balance from aggregate commitments and unavailable reads", async ({
  page,
}) => {
  const values = new Map<string, string>();
  const storage = createStorageAdapter(() => ({
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  }));
  const order = orderSchema.parse({
    maker: maker.address,
    restrictedTaker: "0x" + "00".repeat(20),
    makerToken: token,
    takerToken: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    makerAmount: 80000000n,
    takerAmount: 1n,
    expiration: (1n << 256n) - 1n,
    salt: "0x" + "bb".repeat(32),
  });
  const payload = await encodeOrderLink(
    {
      order,
      signature: await maker.signTypedData(
        orderTypedData(order, deployment.domain),
      ),
      deploymentId: 2,
    },
    [deployment],
  );
  await storage.saveOrder(payload, maker.address, [deployment]);
  storage.saveDraft(2, {
    makerToken: token,
    takerToken: order.takerToken,
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
  await connectTokenWallet(page);
  let unavailable = false;
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const raw: unknown = JSON.parse(route.request().postData() ?? "null");
    const request = z
      .object({
        id: z.number(),
        method: z.string(),
        params: z.array(z.unknown()).default([]),
      })
      .parse(raw);
    const call = z
      .object({ to: z.string(), data: z.string() })
      .safeParse(request.params[0]);
    if (
      request.method === "eth_call" &&
      call.success &&
      call.data.to.toLowerCase() === token.toLowerCase() &&
      call.data.data.startsWith("0x70a08231")
    ) {
      await route.fulfill({
        json: unavailable
          ? {
              jsonrpc: "2.0",
              id: request.id,
              error: { code: -32000, message: "Unavailable" },
            }
          : {
              jsonrpc: "2.0",
              id: request.id,
              result: "0x" + "5f5e100".padStart(64, "0"),
            },
      });
    } else await route.continue();
  });
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
  await page.getByLabel("Trade network").selectOption("31337");
  await expect(
    page.getByText("Individual balance is sufficient.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Balance does not cover all known open orders/),
  ).toBeVisible();
  await expect(
    page.getByText("Necessary allowance: 130", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Orders missing from this browser/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit terms" }).click();
  await page.getByLabel("Send amount").fill("101");
  await page.getByRole("button", { name: "Review trade", exact: true }).click();
  await expect(
    page.getByText("Insufficient balance for this order.", { exact: true }),
  ).toBeVisible();
  unavailable = true;
  await page.evaluate(() =>
    window.dispatchEvent(new Event("test:token-network")),
  );
  await expect(
    page.getByText("Balance unavailable.", { exact: true }),
  ).toBeVisible();
});
