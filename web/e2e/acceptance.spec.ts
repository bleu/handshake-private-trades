import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";
import { erc20Abi } from "viem";
import { tradeFixture } from "./trade-fixture";
import { createStorageAdapter } from "../src/infrastructure/storage";
import { openApproval } from "./approval-setup";
import { decodeOrderLink } from "../src/domain/orders";
import { tradeRegistry } from "./trade-fixture";
import { installAnvilWallet } from "./anvil-wallet";
import {
  deployToken,
  settlement,
  localClient,
  localWallet,
  maker,
  taker,
} from "./local-token";

test("an independent taker settles an individually funded link despite aggregate commitments with exact token outcomes", async ({
  page,
}) => {
  const { payload, signed, deployment } = await tradeFixture({
    restrictedTaker: taker,
  });
  for (const [account, token, amount] of [
    [maker, signed.order.makerToken, signed.order.makerAmount],
    [taker, signed.order.takerToken, signed.order.takerAmount],
  ] as const)
    await localClient.waitForTransactionReceipt({
      hash: await localWallet.writeContract({
        account,
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [deployment.address, amount],
      }),
    });
  const commitment = await tradeFixture({
    maker: taker,
    makerToken: signed.order.takerToken,
    takerToken: signed.order.makerToken,
    makerAmount: 1000000000000n,
  });
  const records = new Map<string, string>();
  const storage = createStorageAdapter(() => ({
    get length() {
      return records.size;
    },
    key: (index) => [...records.keys()][index] ?? null,
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => {
      records.set(key, value);
    },
  }));
  await storage.saveOrder(commitment.payload, taker, tradeRegistry);
  await page.addInitScript(
    (values) => {
      for (const [key, value] of values) localStorage.setItem(key, value);
    },
    [...records],
  );
  await installAnvilWallet(page);
  await page.goto(`/trade#${payload}`);
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await page.evaluate((account) => {
    window.dispatchEvent(
      new CustomEvent("test:anvil-account", { detail: account }),
    );
  }, taker);
  await expect(
    page.getByRole("button", { name: "Accept trade", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Approve token", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Balance does not cover all known open orders/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept trade", exact: true }).click();
  await expect(
    page.getByText("Settlement confirmed.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Order status: Filled", { exact: true }),
  ).toBeVisible();
  expect(
    await localClient.readContract({
      address: signed.order.makerToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [taker],
    }),
  ).toBe(1000050000000n);
  expect(
    await localClient.readContract({
      address: signed.order.takerToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [maker],
    }),
  ).toBe(1000002000000n);
  await expect(page).toHaveURL(`/trade#${payload}`);
});

test("a maker signs in one browser and an independent taker explicitly approves then accepts the retained link", async ({
  page,
  browser,
}) => {
  const receive = await deployToken();
  await openApproval(page, "ordinary", 0n, receive);
  await page
    .getByRole("button", { name: "Approve token", exact: true })
    .click();
  await expect(
    page.getByText("Approval confirmed.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign order", exact: true }).click();
  await expect(page).toHaveURL(/\/trade#[A-Za-z0-9_-]{367}$/);
  const link = page.url();
  const signed = await decodeOrderLink(
    new URL(link).hash.slice(1),
    tradeRegistry,
  );
  const recipientContext = await browser.newContext();
  try {
    const recipient = await recipientContext.newPage();
    await installAnvilWallet(recipient, taker);
    await recipient.goto(link);
    await recipient
      .getByRole("button", { name: "Connect Wallet", exact: true })
      .click();
    await recipient
      .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
      .click();
    await expect(
      recipient.getByRole("button", { name: "Accept trade", exact: true }),
    ).toBeDisabled();
    await recipient
      .getByRole("button", { name: "Approve token", exact: true })
      .click();
    await expect(
      recipient.getByText("Approval confirmed.", { exact: true }),
    ).toBeVisible();
    await expect(
      recipient.getByText("Order status: Open", { exact: true }),
    ).toBeVisible();
    await expect(
      recipient.getByRole("button", { name: "Accept trade", exact: true }),
    ).toBeEnabled();
    expect(
      await localClient.readContract({
        address: receive,
        abi: erc20Abi,
        functionName: "allowance",
        args: [taker, settlement],
      }),
    ).toBe(1000000n);
    await recipient
      .getByRole("button", { name: "Accept trade", exact: true })
      .click();
    await expect(
      recipient.getByText("Order status: Filled", { exact: true }),
    ).toBeVisible();
    expect(
      await localClient.readContract({
        address: signed.order.makerToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [taker],
      }),
    ).toBe(1000050000000n);
  } finally {
    await recipientContext.close();
  }
});

test("a maker repairs allowance from an unsaved retained link and the viewed order counts exactly once", async ({
  page,
}) => {
  const { payload, signed, deployment } = await tradeFixture();
  await installAnvilWallet(page);
  await page.addInitScript(() => {
    const original = Object.getOwnPropertyDescriptor(
      Storage.prototype,
      "setItem",
    )?.value as (this: Storage, key: string, value: string) => void;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith("ptl:history:"))
        throw new DOMException("Full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.goto(`/trade#${payload}`);
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await expect(
    page.getByText(/Order history could not be saved/),
  ).toBeVisible();
  await expect(
    page.getByText("Necessary allowance: 50", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Approve token", exact: true })
    .click();
  await expect(
    page.getByText("Approval confirmed.", { exact: true }),
  ).toBeVisible();
  expect(
    await localClient.readContract({
      address: signed.order.makerToken,
      abi: erc20Abi,
      functionName: "allowance",
      args: [maker, deployment.address],
    }),
  ).toBe(50000000n);
  await expect(
    page.getByRole("button", { name: "Accept trade", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Order status: Open", { exact: true }),
  ).toBeVisible();
});

async function openFundedTrade(page: Page) {
  const fixture = await tradeFixture({ restrictedTaker: taker });
  for (const [account, token, amount] of [
    [maker, fixture.signed.order.makerToken, fixture.signed.order.makerAmount],
    [taker, fixture.signed.order.takerToken, fixture.signed.order.takerAmount],
  ] as const)
    await localClient.waitForTransactionReceipt({
      hash: await localWallet.writeContract({
        account,
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [fixture.deployment.address, amount],
      }),
    });
  await installAnvilWallet(page, taker);
  await page.goto(`/trade#${fixture.payload}`);
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Accept trade", exact: true }),
  ).toBeEnabled();
  return fixture;
}

test("a competing cancellation while the wallet is open prevents settlement and preserves the link without duplicate submission", async ({
  page,
}) => {
  const { payload, deployment, signed } = await openFundedTrade(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const request = z
      .object({ method: z.string() })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    if (request.method === "eth_sendTransaction") await gate;
    await route.continue();
  });
  await page.getByRole("button", { name: "Accept trade", exact: true }).click();
  await expect(
    page.getByText("Awaiting wallet: settlement.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept trade", exact: true }),
  ).toBeDisabled();
  await localClient.waitForTransactionReceipt({
    hash: await localWallet.writeContract({
      address: deployment.address,
      abi: deployment.abi,
      functionName: "cancel",
      args: [signed.order],
    }),
  });
  release();
  await expect(
    page.getByText(/Settlement failed or was rejected/),
  ).toBeVisible();
  await expect(
    page.getByText("Order status: Cancelled", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(`/trade#${payload}`);
  await expect(
    page.getByRole("button", { name: "Accept trade", exact: true }),
  ).toHaveCount(0);
});

test("wallet rejection resets acceptance for an explicit retry without losing signed terms", async ({
  page,
}) => {
  const { payload } = await openFundedTrade(page);
  let reject = true;
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const request = z
      .object({ id: z.number(), method: z.string() })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    if (request.method === "eth_sendTransaction" && reject) {
      reject = false;
      await route.fulfill({
        json: {
          jsonrpc: "2.0",
          id: request.id,
          error: { code: 4001, message: "Rejected" },
        },
      });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Accept trade", exact: true }).click();
  await expect(
    page.getByText(/Settlement failed or was rejected/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept trade", exact: true }),
  ).toBeEnabled();
  await expect(page).toHaveURL(`/trade#${payload}`);
  await page.getByRole("button", { name: "Accept trade", exact: true }).click();
  await expect(
    page.getByText("Settlement confirmed.", { exact: true }),
  ).toBeVisible();
});

test("acceptance rechecks individual maker funding before opening the wallet", async ({
  page,
}) => {
  const { signed } = await openFundedTrade(page);
  await localClient.waitForTransactionReceipt({
    hash: await localWallet.writeContract({
      address: signed.order.makerToken,
      abi: erc20Abi,
      functionName: "transfer",
      args: [taker, 999950000001n],
    }),
  });
  let submitted = 0;
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const request = z
      .object({ method: z.string() })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    if (request.method === "eth_sendTransaction") submitted++;
    await route.continue();
  });
  await page.getByRole("button", { name: "Accept trade", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Account:" }),
  ).toContainText("Maker balance is insufficient.");
  await expect(
    page.getByRole("button", { name: "Accept trade", exact: true }),
  ).toBeDisabled();
  expect(submitted).toBe(0);
});
