import { expect, test } from "@playwright/test";
import { tradeFixture, tradeRegistry } from "./trade-fixture";
import { openApproval } from "./approval-setup";
import { installAnvilWallet } from "./anvil-wallet";
import { maker, taker, localClient, localWallet } from "./local-token";
import { createStorageAdapter } from "../src/infrastructure/storage";

test("a received link displays verified terms and live status without a wallet or creator storage", async ({
  page,
}) => {
  const { payload } = await tradeFixture();
  await page.goto(`/trade#${payload}`);
  await expect(
    page.getByText("Order status: Open", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("You receive: 50", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("You send: 2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Wallet", exact: true }),
  ).toBeVisible();
});

test("only the connected maker restores a received link into local history and account guidance follows wallet changes", async ({
  page,
}) => {
  const { payload } = await tradeFixture({
    restrictedTaker: "0x1111111111111111111111111111111111111111",
  });
  await installAnvilWallet(page);
  await page.goto(`/trade#${payload}`);
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ready to share.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Connect a wallet to accept this trade or manage your order.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await page.evaluate((account) => {
    window.dispatchEvent(
      new CustomEvent("test:anvil-account", { detail: account }),
    );
  }, taker);
  await expect(
    page.getByRole("button", {
      name: "This trade is not for you",
      exact: true,
    }),
  ).toBeVisible();
  const values = new Map(
    await page.evaluate(() =>
      Object.keys(localStorage).map(
        (key) => [key, localStorage.getItem(key) ?? ""] as const,
      ),
    ),
  );
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
  expect(
    (await storage.readOrders(maker, 2, tradeRegistry)).value,
  ).toHaveLength(1);
  expect(
    (await storage.readOrders(taker, 2, tradeRegistry)).value,
  ).toHaveLength(0);
});

test("malformed, unknown-deployment and invalid-signature links never expose trade actions or terms", async ({
  page,
}) => {
  const { payload } = await tradeFixture();
  const unknown = Buffer.from(payload, "base64url");
  unknown[1] = 3;
  const changedMaker = Buffer.from(payload, "base64url");
  changedMaker[2] = 0x11;
  for (const invalid of [
    "!" + payload.slice(1),
    unknown.toString("base64url"),
    changedMaker.toString("base64url"),
  ]) {
    await page.goto(`/trade#${invalid}`);
    await expect(
      page.getByText(/Invalid or unsupported trade link/),
    ).toBeVisible();
    await expect(page.getByText(/^You receive:/)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Refresh trade" }),
    ).toHaveCount(0);
  }
});

test("chain status refreshes on the interval and focus, with terminal state preceding expiry and RPC failure remaining unavailable", async ({
  page,
}) => {
  const { payload, signed, deployment } = await tradeFixture();
  await page.clock.install();
  await page.goto(`/trade#${payload}`);
  await expect(
    page.getByText("Order status: Open", { exact: true }),
  ).toBeVisible();
  await localClient.waitForTransactionReceipt({
    hash: await localWallet.writeContract({
      address: deployment.address,
      abi: deployment.abi,
      functionName: "cancel",
      args: [signed.order],
    }),
  });
  await page.clock.fastForward(15000);
  await expect(
    page.getByText("Order status: Cancelled", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Trade cancelled", exact: true }),
  ).toBeDisabled();
  await page.clock.setFixedTime(new Date(Date.now() + 3700000));
  await page.clock.fastForward(1000);
  await expect(
    page.getByText("Order status: Cancelled", { exact: true }),
  ).toBeVisible();
  await page.route("http://127.0.0.1:8545/", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("Order status: Status unavailable", { exact: true }),
  ).toBeVisible();
  await page.unroute("http://127.0.0.1:8545/");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await expect(
    page.getByText("Order status: Cancelled", { exact: true }),
  ).toBeVisible();
});

test("window focus refreshes an order changed by another client before the polling interval", async ({
  page,
}) => {
  const { payload, signed, deployment } = await tradeFixture();
  await page.goto(`/trade#${payload}`);
  await expect(
    page.getByText("Order status: Open", { exact: true }),
  ).toBeVisible();
  await localClient.waitForTransactionReceipt({
    hash: await localWallet.writeContract({
      address: deployment.address,
      abi: deployment.abi,
      functionName: "cancel",
      args: [signed.order],
    }),
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await expect(
    page.getByText("Order status: Cancelled", { exact: true }),
  ).toBeVisible();
});

test("reopening a newly signed link restores history after storage was cleared in the same browser session", async ({
  page,
}) => {
  await openApproval(page, "ordinary", 50000000n);
  await page.getByRole("button", { name: "Sign order", exact: true }).click();
  await expect(page).toHaveURL(/\/trade#[A-Za-z0-9_-]{367}$/);
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.getByRole("link", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/trade#[A-Za-z0-9_-]{367}$/);
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
});

test("a recipient can paste a canonical trade URL and review its verified terms", async ({
  page,
}) => {
  const { payload } = await tradeFixture();
  await page.goto("/trade");
  await expect(
    page.getByRole("button", { name: "Open trade link", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open trade link", exact: true })
    .click();
  await page
    .getByLabel("Paste trade link", { exact: true })
    .fill(`${new URL(page.url()).origin}/trade#${payload}`);
  await page.getByRole("button", { name: "Open trade", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/trade#${payload}$`));
  await expect(
    page.getByText("You receive: 50", { exact: true }),
  ).toBeVisible();
});

test("trade amounts use the recipient perspective and follow a maker wallet change", async ({
  page,
}) => {
  const { payload } = await tradeFixture();
  await installAnvilWallet(page, taker);
  await page.goto(`/trade#${payload}`);
  await expect(page.getByText("You send: 2", { exact: true })).toBeVisible();
  await expect(
    page.getByText("You receive: 50", { exact: true }),
  ).toBeVisible();
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
  }, maker);
  await expect(page.getByText("You send: 50", { exact: true })).toBeVisible();
});

test("received trade details use the shared receipt at mobile and desktop widths", async ({
  page,
}, testInfo) => {
  const { payload } = await tradeFixture();
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/trade#${payload}`);
    const send = page.getByText("You send: 2", { exact: true });
    const receive = page.getByText("You receive: 50", { exact: true });
    await expect(send).toBeVisible();
    await expect(receive).toBeVisible();
    expect((await receive.boundingBox())?.y).toBeGreaterThan(
      (await send.boundingBox())?.y ?? 0,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`received-order-${String(width)}.png`),
      fullPage: true,
    });
  }
});

test("maker Trade link keeps only the primary controls and an error-colored cancellation", async ({
  page,
}) => {
  await openApproval(page, "ordinary", 50000000n);
  await page.getByRole("button", { name: "Sign order", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your trade link is ready" }),
  ).toBeVisible();
  await expect(
    page.locator("summary").filter({
      hasText: /^(Order details|Manage token approval|Approval details)$/,
    }),
  ).toHaveCount(0);
  const cancel = page.getByRole("button", {
    name: "Cancel order",
    exact: true,
  });
  await expect(cancel).toBeEnabled();
  await expect(cancel).toHaveCSS("background-color", "rgb(67, 35, 41)");
});
