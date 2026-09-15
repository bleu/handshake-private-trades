import { selectNetwork } from "./network-control";
import { expect, test } from "@playwright/test";
import { openApproval } from "./approval-setup";
import { z } from "zod";
import { getAddress } from "viem";
import { maker, taker, settlement } from "./local-token";
import { decodeOrderLink } from "../src/domain/orders";
import { createStorageAdapter } from "../src/infrastructure/storage";

const registry = [
  {
    id: 2,
    domain: {
      name: "Private Trade Links",
      version: "1",
      chainId: 31337,
      verifyingContract: settlement,
    },
  },
];
test("explicit signing saves a verified link, clears its draft, and copies the complete URL", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const token = await openApproval(page, "ordinary", 50000000n);
  const before = BigInt(Math.floor(Date.now() / 1000));
  await page.getByRole("button", { name: "Sign order", exact: true }).click();
  await expect(page).toHaveURL(/\/trade#[A-Za-z0-9_-]{367}$/);
  const signed = await decodeOrderLink(
    new URL(page.url()).hash.slice(1),
    registry,
  );
  expect(signed.order.maker).toBe(maker);
  expect(signed.order.makerToken.toLowerCase()).toBe(token.toLowerCase());
  expect(signed.order.makerAmount).toBe(50000000n);
  expect(signed.order.expiration >= before + 86400n).toBe(true);
  expect(
    signed.order.expiration <= BigInt(Math.floor(Date.now() / 1000)) + 86400n,
  ).toBe(true);
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.getByText("Link copied.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    page.url(),
  );
  const copiedNotice = page
    .getByRole("status")
    .filter({ hasText: "Link copied." });
  await expect(
    copiedNotice.getByRole("button", { name: "Dismiss notification" }),
  ).toBeVisible();
  await copiedNotice
    .getByRole("button", { name: "Dismiss notification" })
    .click();
  await expect(copiedNotice).toHaveCount(0);
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(copiedNotice).toBeVisible();
  const records = new Map(
    await page.evaluate(() =>
      Object.keys(localStorage).map(
        (key) => [key, localStorage.getItem(key) ?? ""] as const,
      ),
    ),
  );
  const storage = createStorageAdapter(() => ({
    get length() {
      return records.size;
    },
    key: (i) => [...records.keys()][i] ?? null,
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => {
      records.set(key, value);
    },
  }));
  expect(storage.readDraft(2).value).toBeNull();
  expect((await storage.readOrders(maker, 2, registry)).value).toHaveLength(1);
  await page.getByRole("link", { name: "Trade link", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copy link", exact: true }),
  ).toHaveCount(0);
});

test("a delayed expired signature retains its link and expiration warning", async ({
  page,
}) => {
  await openApproval(page, "ordinary", 50000000n);
  await page.getByRole("button", { name: "Edit terms" }).click();
  await page.getByLabel("Duration").selectOption("1 hour");
  await page.getByRole("button", { name: "Review trade", exact: true }).click();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const request: unknown = JSON.parse(route.request().postData() ?? "null");
    if (
      typeof request === "object" &&
      request !== null &&
      "method" in request &&
      request.method === "eth_signTypedData_v4"
    )
      await gate;
    await route.continue();
  });
  await page.getByRole("button", { name: "Sign order", exact: true }).click();
  await expect(
    page.getByText("Awaiting wallet: signature.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign order", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("main")
      .locator('[role="alert"]:visible, .action-error:visible'),
  ).toHaveCount(0);
  const later = new Date(Date.now() + 3700000);
  await page.clock.setFixedTime(later);
  release();
  await expect(page).toHaveURL(/\/trade#[A-Za-z0-9_-]{367}$/);
  await expect(page.getByText("Expired", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Signature returned after expiration/),
  ).toBeVisible();
  await expect(page.getByLabel("Trade link", { exact: true })).toHaveValue(
    page.url(),
  );
  await expect(
    page.getByRole("button", { name: "Create another order", exact: true }),
  ).toHaveCount(0);
});

test("storage failures retain the signed link and warn about incomplete cleanup", async ({
  page,
}) => {
  await openApproval(page, "ordinary", 50000000n);
  await page.evaluate(() => {
    const original = Object.getOwnPropertyDescriptor(
      Storage.prototype,
      "setItem",
    )?.value as (this: Storage, key: string, value: string) => void;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith("ptl:history:") || key.startsWith("ptl:draft:"))
        throw new DOMException("Full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Sign order", exact: true }).click();
  await expect(page).toHaveURL(/\/trade#[A-Za-z0-9_-]{367}$/);
  await expect(
    page.getByText(/Order history could not be saved/),
  ).toBeVisible();
  await expect(
    page.getByText(/Completed draft could not be cleared/),
  ).toBeVisible();
  await expect(page.getByLabel("Trade link", { exact: true })).toHaveValue(
    page.url(),
  );
  await expect(
    page.getByRole("button", { name: "Create another order", exact: true }),
  ).toHaveCount(0);
});

test("a pending signature retains original terms and maker while a newer edited draft survives cleanup", async ({
  page,
}) => {
  await openApproval(page, "ordinary", 50000000n);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const raw: unknown = JSON.parse(route.request().postData() ?? "null");
    const request = z.object({ method: z.string() }).parse(raw);
    if (request.method === "eth_signTypedData_v4") await gate;
    await route.continue();
  });
  await page.getByRole("button", { name: "Sign order", exact: true }).click();
  await expect(
    page.getByText("Awaiting wallet: signature.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit terms" }).click();
  await page.getByLabel("Send amount").fill("60");
  await page.evaluate(
    (account) =>
      window.dispatchEvent(
        new CustomEvent("test:anvil-account", { detail: account }),
      ),
    taker,
  );
  await expect(page.getByRole("button", { name: /0x70/i })).toBeVisible();
  release();
  await expect(page).toHaveURL(/\/trade#[A-Za-z0-9_-]{367}$/);
  const signed = await decodeOrderLink(
    new URL(page.url()).hash.slice(1),
    registry,
  );
  expect(signed.order.maker).toBe(maker);
  expect(signed.order.makerAmount).toBe(50000000n);
  const records = new Map(
    await page.evaluate(() =>
      Object.keys(localStorage).map(
        (key) => [key, localStorage.getItem(key) ?? ""] as const,
      ),
    ),
  );
  const storage = createStorageAdapter(() => ({
    get length() {
      return records.size;
    },
    key: (i) => [...records.keys()][i] ?? null,
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => {
      records.set(key, value);
    },
  }));
  expect(storage.readDraft(2).value?.draft.makerAmount).toBe("60");
  expect((await storage.readOrders(maker, 2, registry)).value).toHaveLength(1);
  expect((await storage.readOrders(taker, 2, registry)).value).toHaveLength(0);
});

test("a signature from the wrong account is rejected without clearing the draft or saving an order", async ({
  page,
}) => {
  await openApproval(page, "ordinary", 50000000n);
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const raw: unknown = JSON.parse(route.request().postData() ?? "null");
    const request = z
      .object({
        id: z.number(),
        jsonrpc: z.string(),
        method: z.string(),
        params: z.array(z.unknown()).default([]),
      })
      .parse(raw);
    if (request.method === "eth_signTypedData_v4")
      await route.continue({
        postData: JSON.stringify({
          ...request,
          params: [taker, request.params[1]],
        }),
      });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Sign order", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /Signature failed or was rejected/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign order", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Edit terms" }).click();
  await expect(page.getByLabel("Send amount")).toHaveValue("50");
  expect(new URL(page.url()).hash).toBe("");
});

test("signing unsaved edits clears their older persisted draft without resurrecting stale terms", async ({
  page,
}) => {
  await openApproval(page, "ordinary", 50000000n);
  await page.evaluate(() => {
    const original = Object.getOwnPropertyDescriptor(
      Storage.prototype,
      "setItem",
    )?.value as (this: Storage, key: string, value: string) => void;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (/^ptl:draft:\d+$/.test(key))
        throw new DOMException("Full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Edit terms" }).click();
  await page.getByLabel("Send amount").fill("40");
  await page.getByRole("button", { name: "Review trade", exact: true }).click();
  await expect(page.getByText(/Draft could not be saved/)).toBeVisible();
  await page.getByRole("button", { name: "Sign order", exact: true }).click();
  await expect(page).toHaveURL(/\/trade#[A-Za-z0-9_-]{367}$/);
  await page.getByRole("link", { name: "Create", exact: true }).click();
  await selectNetwork(page, "31337");
  await expect(page.getByLabel("Send amount")).toHaveValue("");
});

test("listed tokens support the complete Handshake create approve sign and copy flow", async ({
  page,
  context,
}, testInfo) => {
  const capture = async (name: string) => {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${name}-${String(width)}.png`),
        fullPage: true,
      });
    }
  };
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const token = await openApproval(page);
  await page.unroute("https://files.cow.fi/tokens/CowSwap.json");
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({
      json: {
        name: "Local listed tokens",
        timestamp: "2026-09-14T00:00:00Z",
        version: { major: 1, minor: 0, patch: 0 },
        tokens: [
          {
            chainId: 31337,
            address: token,
            name: "Browser",
            symbol: "BROWSER",
            decimals: 6,
          },
          {
            chainId: 31337,
            address: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
            name: "Development 18",
            symbol: "DEV18",
            decimals: 18,
          },
        ],
      },
    }),
  );
  await page.getByRole("button", { name: "Edit terms", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose Send token", exact: true })
    .click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await capture("token-selection");
  await page
    .getByLabel("Token", { exact: true })
    .getByRole("option", { name: new RegExp(getAddress(token), "i") })
    .click();
  await page.getByLabel("Send amount").fill("2.123456");
  await capture("create-populated");
  await page.getByRole("button", { name: "Review trade", exact: true }).click();
  await expect(
    page.getByText(/List membership unknown|Outside whitelist/),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Approve token", exact: true }),
  ).toBeEnabled();
  await capture("create-review");
  await page
    .getByRole("button", { name: "Approve token", exact: true })
    .click();
  await expect(
    page.getByText("Approval confirmed.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign order", exact: true }).click();
  await expect(page).toHaveURL(/\/trade#[A-Za-z0-9_-]{367}$/);
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.getByText("Link copied.", { exact: true })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const signed = await decodeOrderLink(new URL(copied).hash.slice(1), registry);
  expect(signed.order.makerAmount).toBe(2123456n);
  expect(signed.order.maker).toBe(maker);
});

test("signed receipts retain token membership warnings", async ({ page }) => {
  await openApproval(page, "ordinary", 50000000n);
  await page.getByRole("button", { name: "Sign order", exact: true }).click();
  await expect(page).toHaveURL(/\/trade#[A-Za-z0-9_-]{367}$/);
  await expect(
    page.getByText("List membership unknown.", { exact: true }),
  ).toHaveCount(2);
});

test("saved maker orders retain the ready-to-share layout and inline copy control", async ({
  page,
  context,
}, testInfo) => {
  await openApproval(page, "ordinary", 50000000n);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Sign order", exact: true }).click();
  await expect(page).toHaveURL(/\/trade#[A-Za-z0-9_-]{367}$/);
  const link = page.url();
  await expect(
    page.getByRole("heading", { name: "Ready to share.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create another order", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page.getByRole("link", { name: /^View order / }).click();
  await expect(page).toHaveURL(link);
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("heading", { name: "Ready to share.", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("You send: 50", { exact: true })).toBeVisible();
    const input = page.getByLabel("Trade link", { exact: true });
    const copy = page.getByRole("button", { name: "Copy link", exact: true });
    await expect(input).toHaveValue(link);
    await expect(copy).toHaveText("");
    const inputBox = await input.boundingBox(),
      copyBox = await copy.boundingBox();
    expect(inputBox).not.toBeNull();
    expect(copyBox).not.toBeNull();
    expect(Math.abs((inputBox?.y ?? 0) - (copyBox?.y ?? 0))).toBeLessThan(4);
    await copy.click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      link,
    );
    await page.screenshot({
      path: testInfo.outputPath(`shared-order-${String(width)}.png`),
      fullPage: true,
    });
  }
});
