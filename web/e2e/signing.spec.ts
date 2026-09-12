import { expect, test } from "@playwright/test";
import { openApproval } from "./approval-setup";
import { z } from "zod";
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

test("a delayed expired signature remains shareable and creating a new order uses a fresh deadline and salt", async ({
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
  const later = new Date(Date.now() + 3700000);
  await page.clock.setFixedTime(later);
  release();
  await expect(page).toHaveURL(/\/trade#[A-Za-z0-9_-]{367}$/);
  const old = await decodeOrderLink(
    new URL(page.url()).hash.slice(1),
    registry,
  );
  await expect(page.getByText("Expired", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Signature returned after expiration/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create new order", exact: true })
    .click();
  await expect(page.getByLabel("Trade network")).toHaveValue("31337");
  await expect(page.getByLabel("Send amount")).toHaveValue("50");
  await page.getByRole("button", { name: "Review trade", exact: true }).click();
  await page.getByRole("button", { name: "Sign order", exact: true }).click();
  await expect(page).toHaveURL(/\/trade#[A-Za-z0-9_-]{367}$/);
  const fresh = await decodeOrderLink(
    new URL(page.url()).hash.slice(1),
    registry,
  );
  expect(fresh.order.salt).not.toBe(old.order.salt);
  expect(fresh.order.expiration).toBe(
    BigInt(Math.floor(later.getTime() / 1000)) + 3600n,
  );
});

test("storage failures retain the signed link and a copied new draft remains usable in memory", async ({
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
  await page
    .getByRole("button", { name: "Create new order", exact: true })
    .click();
  await expect(page.getByLabel("Send amount")).toHaveValue("50");
  await expect(page.getByText(/Draft could not be saved/)).toBeVisible();
  await page.getByRole("button", { name: "Review trade", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign order", exact: true }),
  ).toBeEnabled();
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
  await expect(
    page.getByText(`Connected account: ${taker}`, { exact: true }),
  ).toBeVisible();
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
    page.getByText(/Signature failed or was rejected/),
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
  await page.getByLabel("Trade network").selectOption("31337");
  await expect(page.getByLabel("Send amount")).toHaveValue("");
});
