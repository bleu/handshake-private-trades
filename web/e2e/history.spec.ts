import { selectNetwork } from "./network-control";
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
}, testInfo) => {
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
  for (const [key, raw] of records)
    records.set(
      key,
      JSON.stringify({
        ...(JSON.parse(raw) as object),
        savedAt: key.endsWith(first.id) ? 1700000000000 : 1700000060000,
      }),
    );
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
  await expect(
    page.getByRole("heading", { name: "History", exact: true }),
  ).toBeVisible();
  const help = page.getByRole("button", { name: "About History", exact: true });
  await help.focus();
  await expect(page.getByRole("tooltip")).toContainText(
    "Clearing storage does not cancel orders",
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Chain Selector", exact: true }),
  ).toBeVisible();
  await selectNetwork(page, "31337");
  let releaseDecimals!: () => void;
  const decimalsReady = new Promise<void>((resolve) => {
    releaseDecimals = resolve;
  });
  await page.route("http://127.0.0.1:8545/", async (route) => {
    if (route.request().postData()?.includes("0x313ce567")) await decimalsReady;
    await route.continue();
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  try {
    await expect(
      page.getByRole("status", { name: "Loading order details" }).first(),
    ).toBeVisible();
    await expect(page.getByText(/base units/)).toHaveCount(0);
    await expect(page.getByText("You send: 50", { exact: true })).toHaveCount(
      0,
    );
  } finally {
    releaseDecimals();
  }
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(page.getByLabel("Sort orders", { exact: true })).toBeVisible();
  await expect(page.getByRole("article").first()).toHaveAttribute(
    "aria-label",
    `Order ${second.id}`,
  );
  await page.getByLabel("Sort orders", { exact: true }).selectOption("oldest");
  await expect(page.getByRole("article").first()).toHaveAttribute(
    "aria-label",
    `Order ${first.id}`,
  );
  await expect(
    page.getByRole("textbox", { name: "Search orders", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search orders", exact: true })
    .fill(first.id);
  await expect(page.getByRole("article")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Search orders", exact: true })
    .fill("BROWSER");
  await expect(page.getByRole("article")).toHaveCount(2);
  await page
    .getByRole("textbox", { name: "Search orders", exact: true })
    .fill("missing-token");
  await expect(
    page.getByText("No matching orders.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search orders", exact: true })
    .fill("");
  const row = page.getByRole("article", { name: `Order ${first.id}` });
  await expect(row.getByText("Status: Open", { exact: true })).toBeVisible();
  await expect(row.getByText("You send: 50", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Copy link", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    new URL(`/trade#${first.payload}`, page.url()).href,
  );
  await expect(page).toHaveURL("/history");
  const warning = row.locator("summary").first();
  await warning.click();
  await expect(row.getByRole("note").first()).toBeVisible();
  await expect(page).toHaveURL("/history");
  await warning.click();
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(row.getByText("You send: 50", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (width === 375) {
      const status = await row
        .getByText("Status: Open", { exact: true })
        .boundingBox();
      const amount = await row
        .getByText("You send: 50", { exact: true })
        .boundingBox();
      expect(status?.y).toBeLessThan(amount?.y ?? 0);
    }
    await page.screenshot({
      path: testInfo.outputPath(`history-${String(width)}.png`),
      fullPage: true,
    });
    const view = row.getByRole("link", { name: /^View order / });
    if (width === 375) {
      // Click the row's inset, outside the visible order-ID link.
      await row.click({ position: { x: 8, y: 8 } });
    } else {
      await view.focus();
      await page.keyboard.press("Enter");
    }
    await expect(page).toHaveURL(`/trade#${first.payload}`);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("You send: 50", { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`history-details-${String(width)}.png`),
      fullPage: true,
    });
    await page.getByRole("link", { name: "History", exact: true }).click();
  }
  await row.getByRole("link", { name: /^View order / }).click();
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
  await selectNetwork(page, "31337");
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
  await page
    .getByRole("article", { name: `Order ${expired.id}` })
    .getByRole("link", { name: /^View order / })
    .click();
  await expect(
    page.getByText("Deadline reached", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "Filled 1", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(
    page.getByRole("article", { name: `Order ${filled.id}` }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open 0", exact: true }).click();
  await expect(
    page.getByText("No matching orders.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "All 3", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Delete|Remove|Clear history/ }),
  ).toHaveCount(0);
  await selectNetwork(page, "100");
  await expect(page.getByRole("article")).toHaveCount(0);
  await selectNetwork(page, "31337");
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
  ).toHaveCount(0);
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
  await page.getByRole("link", { name: "History", exact: true }).click();
  await selectNetwork(page, "31337");
  await expect(page.getByText("Status: Open", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open 1", exact: true }).click();
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
    page.getByRole("button", { name: "Status unavailable 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "All 1", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
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
  await selectNetwork(page, "31337");
  await expect(
    page.getByText("Saved order history is unavailable.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("a maker cancels from History details and sees confirmed counts and link status", async ({
  page,
}, testInfo) => {
  const { payload, id } = await tradeFixture();
  await installAnvilWallet(page);
  await page.goto(`/trade#${payload}`);
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await selectNetwork(page, "31337");
  const row = page.getByRole("article", { name: `Order ${id}` });
  await row.getByRole("link", { name: /^View order / }).click();
  await expect(page).toHaveURL(`/trade#${payload}`);
  const details = page.locator(".trade-details");
  const cancel = page.getByRole("button", {
    name: "Cancel order",
    exact: true,
  });
  await expect(cancel).toBeEnabled();
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await cancel.focus();
    await page.keyboard.press("Enter");
    const confirmation = page.getByRole("dialog", {
      name: "Cancel this order?",
      exact: true,
    });
    await expect(confirmation).toContainText(id);
    await expect(
      confirmation.getByText("You send: 50", { exact: true }),
    ).toBeVisible();
    await expect(
      confirmation.getByText(/network fee|estimated fee/i),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`cancel-history-${String(width)}.png`),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(cancel).toBeFocused();
  }
  await cancel.click();
  await page
    .getByRole("dialog", { name: "Cancel this order?", exact: true })
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(
    details.getByText("Order status: Cancelled", { exact: true }),
  ).toBeVisible();
  await expect(
    details.getByRole("button", { name: "Cancel order", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Cancelled 1", exact: true }),
  ).toBeVisible();
  await row.getByRole("link", { name: /^View order / }).click();
  await expect(
    page.getByText("Order status: Cancelled", { exact: true }),
  ).toBeVisible();
});

test("History paginates ten orders and searches across pages before pagination", async ({
  page,
}, testInfo) => {
  const first = await tradeFixture({ expiration: MAX_UINT256 });
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
  for (let index = 0; index < 10; index++) {
    const next = await tradeFixture({
      makerToken: first.signed.order.makerToken,
      takerToken: first.signed.order.takerToken,
      expiration: MAX_UINT256,
    });
    await storage.saveOrder(next.payload, maker, tradeRegistry);
  }
  await page.addInitScript(
    (entries) => {
      for (const [key, value] of entries) localStorage.setItem(key, value);
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
  await expect(page.getByRole("article")).toHaveCount(10);
  await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`history-pagination-${String(width)}.png`),
      fullPage: true,
    });
  }

  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Next page", exact: true }),
  ).toBeDisabled();
  await page.getByRole("textbox", { name: "Search orders" }).fill(first.id);
  await expect(page.getByText("Page 1 of 1", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("article", { name: `Order ${first.id}`, exact: true }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search orders" }).fill("BROWSER");
  await expect(page.getByRole("article")).toHaveCount(10);
  await page.getByRole("button", { name: /^Filled / }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByText("Page 1 of 1", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Previous page", exact: true }),
  ).toBeDisabled();
});

test("history waits for a fresh status when a previously open order was filled elsewhere", async ({
  page,
}) => {
  const fixture = await tradeFixture();
  await installAnvilWallet(page);
  await page.goto(`/trade#${fixture.payload}`);
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await expect(
    page.getByText("Order status: Open", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create", exact: true }).click();
  for (const [account, token, amount] of [
    [maker, fixture.signed.order.makerToken, fixture.signed.order.makerAmount],
    [taker, fixture.signed.order.takerToken, fixture.signed.order.takerAmount],
  ] as const) {
    await localClient.waitForTransactionReceipt({
      hash: await localWallet.writeContract({
        account,
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [fixture.deployment.address, amount],
      }),
    });
  }
  await localClient.waitForTransactionReceipt({
    hash: await localWallet.writeContract({
      account: taker,
      address: fixture.deployment.address,
      abi: fixture.deployment.abi,
      functionName: "settle",
      args: [fixture.signed.order, fixture.signed.signature],
    }),
  });
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("http://127.0.0.1:8545/", async (route) => {
    if (route.request().postData()?.includes(fixture.id.slice(2))) await gate;
    await route.continue();
  });
  await page.getByRole("link", { name: "History", exact: true }).click();
  const row = page.getByRole("article", { name: `Order ${fixture.id}` });
  try {
    await expect(row).toBeVisible();
    await expect(row.getByText("Status: Open", { exact: true })).toHaveCount(0);
    await expect(
      row.getByRole("status", { name: "Loading order details" }),
    ).toBeVisible();
  } finally {
    release();
  }
  await expect(row.getByText("Status: Filled", { exact: true })).toBeVisible();
});
