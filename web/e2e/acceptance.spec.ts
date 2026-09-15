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
      recipient.getByRole("button", {
        name: "Approve token",
        exact: true,
      }),
    ).toBeEnabled();
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

test("a maker retains a link when storage is full without offering approval management", async ({
  page,
}) => {
  const { payload } = await tradeFixture();
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
    page.locator("summary").filter({ hasText: /^Manage token approval$/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Approve token", exact: true }),
  ).toHaveCount(0);
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
    page.getByText("Settlement reverted. Review the current state and retry.", {
      exact: true,
    }),
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
    page.getByRole("button", {
      name: "Maker balance for BROWSER is insufficient.",
      exact: true,
    }),
  ).toBeDisabled();
  expect(submitted).toBe(0);
});

test("a restricted trade blocks the wrong wallet and recovers for its eligible taker", async ({
  page,
}, testInfo) => {
  await openFundedTrade(page);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("test:anvil-account", {
        detail: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      }),
    ),
  );
  const blocked = page.getByRole("button", {
    name: "This trade is not for you",
    exact: true,
  });
  await expect(blocked).toBeDisabled();
  await page
    .getByRole("button", { name: "About who can accept", exact: true })
    .focus();
  await expect(page.getByRole("tooltip")).toContainText(
    "Only the designated wallet can accept this order.",
  );
  await page.keyboard.press("Escape");
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(blocked).toBeDisabled();
    await page.screenshot({
      path: testInfo.outputPath(`blocked-trade-${String(width)}.png`),
      fullPage: true,
    });
  }
  await page.evaluate(
    (account) =>
      window.dispatchEvent(
        new CustomEvent("test:anvil-account", { detail: account }),
      ),
    taker,
  );
  await expect(
    page.getByRole("button", { name: "Accept trade", exact: true }),
  ).toBeEnabled();
});

test("blocked actions name the deficient token and recover after fresh allowance reads", async ({
  page,
}) => {
  const { signed, deployment } = await openFundedTrade(page);
  await localClient.waitForTransactionReceipt({
    hash: await localWallet.writeContract({
      address: signed.order.makerToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [deployment.address, 0n],
    }),
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("button", {
      name: "Maker approval for BROWSER is insufficient.",
      exact: true,
    }),
  ).toBeDisabled();
  await localClient.waitForTransactionReceipt({
    hash: await localWallet.writeContract({
      address: signed.order.makerToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [deployment.address, signed.order.makerAmount],
    }),
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("button", { name: "Accept trade", exact: true }),
  ).toBeEnabled();
});

test("acceptance stays stable during background reads and omits approval details", async ({
  page,
}) => {
  await openFundedTrade(page);
  const accept = page.getByRole("button", {
    name: "Accept trade",
    exact: true,
  });
  await expect(accept).toBeEnabled();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const request = z
      .object({ method: z.string() })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    if (request.method === "eth_call") {
      reads++;
      await gate;
    }
    await route.continue();
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => reads).toBeGreaterThan(0);
    await expect(accept).toBeEnabled();
    await expect(
      page.getByText("Order status: Open", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(
      page.locator("summary").filter({ hasText: /^Approval details$/ }),
    ).toHaveCount(0);
  } finally {
    release();
  }
});

test("a confirmed taker fill is saved in paginated History with wallet-relative amounts", async ({
  page,
}, testInfo) => {
  const fixture = await openFundedTrade(page);
  await page.getByRole("button", { name: "Accept trade", exact: true }).click();
  await expect(
    page.getByText("Settlement confirmed.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create an order", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Create another order", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "History", exact: true }).click();
  const row = page.getByRole("article", {
    name: `Order ${fixture.id}`,
    exact: true,
  });
  await expect(row).toBeVisible();
  await expect(row.getByText("Status: Filled", { exact: true })).toBeVisible();
  await expect(row.getByText("You send: 2", { exact: true })).toBeVisible();
  await expect(row.getByText("You receive: 50", { exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await page.evaluate(
    (account) =>
      window.dispatchEvent(
        new CustomEvent("test:anvil-account", { detail: account }),
      ),
    taker,
  );
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: /^View order / }).click();
  await expect(page).toHaveURL(`/trade#${fixture.payload}`);
  const details = page.locator(".trade-details");
  await expect(details.getByText("You send: 2", { exact: true })).toBeVisible();
  await expect(
    details.getByText("You receive: 50", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel order", exact: true }),
  ).toHaveCount(0);
  await expect(details.locator(`dd[title="${maker}"]`)).toBeVisible();
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: testInfo.outputPath(`taker-history-details-${String(width)}.png`),
      fullPage: true,
    });
  }

  await page.getByRole("link", { name: "History", exact: true }).click();
  await page.route("http://127.0.0.1:8545/", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("button", { name: "Status unavailable 1", exact: true })
    .click();
  await expect(
    row.getByText("Status: Status unavailable", { exact: true }),
  ).toBeVisible();
});

test("a confirmed settlement warns when taker history cannot be saved", async ({
  page,
}) => {
  await openFundedTrade(page);
  await page.evaluate(() => {
    // Keep the native receiver while simulating history quota failure.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("ptl:history:"))
        throw new DOMException("Full", "QuotaExceededError");
      write.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Accept trade", exact: true }).click();
  await expect(
    page.getByText("Settlement confirmed.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Order status: Filled", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Filled trade history could not be saved. Keep this link.",
    }),
  ).toBeVisible();
});
