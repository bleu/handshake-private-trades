import { expect, test } from "@playwright/test";
import { z } from "zod";
import { erc20Abi } from "viem";
import { MAX_UINT256 } from "../src/domain/orders";
import { createStorageAdapter } from "../src/infrastructure/storage";
import { tradeFixture, tradeRegistry } from "./trade-fixture";
import { installAnvilWallet } from "./anvil-wallet";
import { maker, taker, localClient, localWallet } from "./local-token";

test("maker history keeps independent orders and copies the same canonical link before opening existing cancellation", async ({
  page,
  context,
}) => {
  const first = await tradeFixture({ expiration: MAX_UINT256 });
  const second = await tradeFixture({
    makerToken: first.signed.order.makerToken,
    takerToken: first.signed.order.takerToken,
    expiration: MAX_UINT256,
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
  await storage.saveOrder(first.payload, maker, tradeRegistry);
  await storage.saveOrder(second.payload, maker, tradeRegistry);
  await page.addInitScript(
    (values) => {
      for (const [key, value] of values) localStorage.setItem(key, value);
    },
    [...records],
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await installAnvilWallet(page);
  await page.goto("/history");
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await expect(page.getByLabel("History network")).toBeVisible();
  await page.getByLabel("History network").selectOption("31337");
  await expect(page.getByRole("article")).toHaveCount(2);
  const row = page.getByRole("article", { name: `Order ${first.id}` });
  await expect(row.getByText("Status: Open", { exact: true })).toBeVisible();
  await expect(row.getByText("Maker sends: 50", { exact: true })).toBeVisible();
  await expect(
    row.getByText("Expiration: Unlimited", { exact: true }),
  ).toBeVisible();
  await row.getByRole("button", { name: "Copy link", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    new URL(`/trade#${first.payload}`, page.url()).href,
  );
  await row.getByRole("link", { name: "View trade", exact: true }).click();
  await expect(page).toHaveURL(`/trade#${first.payload}`);
  await expect(
    page.getByRole("button", { name: "Cancel order", exact: true }),
  ).toBeEnabled();
});

test("history retains filled, cancelled and expired orders, isolates corruption, and scopes account and network changes", async ({
  page,
}) => {
  const filled = await tradeFixture();
  const cancelled = await tradeFixture();
  const expired = await tradeFixture({ expiration: 1n });
  const corrupt = await tradeFixture();
  for (const [account, token, amount] of [
    [maker, filled.signed.order.makerToken, filled.signed.order.makerAmount],
    [taker, filled.signed.order.takerToken, filled.signed.order.takerAmount],
  ] as const)
    await localClient.waitForTransactionReceipt({
      hash: await localWallet.writeContract({
        account,
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [filled.deployment.address, amount],
      }),
    });
  await localClient.waitForTransactionReceipt({
    hash: await localWallet.writeContract({
      account: taker,
      address: filled.deployment.address,
      abi: filled.deployment.abi,
      functionName: "settle",
      args: [filled.signed.order, filled.signed.signature],
    }),
  });
  await localClient.waitForTransactionReceipt({
    hash: await localWallet.writeContract({
      address: cancelled.deployment.address,
      abi: cancelled.deployment.abi,
      functionName: "cancel",
      args: [cancelled.signed.order],
    }),
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
  for (const fixture of [filled, cancelled, expired, corrupt])
    await storage.saveOrder(fixture.payload, maker, tradeRegistry);
  const corruptKey = [...records.keys()].at(-1);
  if (!corruptKey) throw new Error("Missing corruption fixture");
  records.set(corruptKey, "{");
  await page.addInitScript(
    (values) => {
      for (const [key, value] of values) localStorage.setItem(key, value);
    },
    [...records],
  );
  await installAnvilWallet(page);
  await page.goto("/history");
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await page.getByLabel("History network").selectOption("31337");
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(
    page.getByText(/Some saved orders are corrupt or unsupported/),
  ).toBeVisible();
  await expect(page.getByText("Status: Filled", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Status: Cancelled", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Status: Expired", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("article", { name: `Order ${expired.id}` })
      .getByText("Deadline reached", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Delete|Remove|Clear history/ }),
  ).toHaveCount(0);
  await page.getByLabel("History network").selectOption("100");
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByLabel("History network").selectOption("31337");
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.evaluate((account) => {
    window.dispatchEvent(
      new CustomEvent("test:anvil-account", { detail: account }),
    );
  }, taker);
  await expect(
    page.getByText("No saved orders for this maker and network.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("a restored link appears in history and unavailable RPC state never removes its row", async ({
  page,
}) => {
  const { payload } = await tradeFixture();
  await installAnvilWallet(page);
  await page.goto(`/trade#${payload}`);
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await expect(
    page.getByText("Order saved in your local maker history.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page.getByLabel("History network").selectOption("31337");
  await expect(page.getByText("Status: Open", { exact: true })).toBeVisible();
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const request = z
      .object({ id: z.number() })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    await route.fulfill({
      json: {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32602, message: "Unavailable" },
      },
    });
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await expect(
    page.getByText("Status: Status unavailable", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "View trade", exact: true }),
  ).toHaveAttribute("href", `/trade#${payload}`);
});

test("unavailable browser storage reports missing history while a retained link remains cancellable", async ({
  page,
}) => {
  const { payload } = await tradeFixture();
  await installAnvilWallet(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
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
    page.getByRole("button", { name: "Cancel order", exact: true }),
  ).toBeEnabled();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page.getByLabel("History network").selectOption("31337");
  await expect(
    page.getByText("Saved order history is unavailable.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
});
