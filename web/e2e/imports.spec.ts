import { expect, test } from "@playwright/test";

const token = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
test("a custom token persists across reloads and remains usable while the CoW list is unavailable", async ({
  page,
}) => {
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  await page.getByLabel("Token address", { exact: true }).fill(token);
  await page
    .getByRole("button", { name: "Inspect token", exact: true })
    .click();
  await expect(
    page.getByText("Decimals (onchain): 6", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save import", exact: true }).click();
  await expect(page.getByText("Import saved.", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  await page.getByLabel("Token", { exact: true }).selectOption(token);
  await expect(
    page.getByText("Decimals (onchain): 6", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/List membership unknown/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use token", exact: true }),
  ).toBeEnabled();
});

test("custom names and symbols come from chain rather than cached imports", async ({
  page,
}) => {
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({
      json: {
        name: "CoW Swap",
        timestamp: "2026-09-11T00:00:00Z",
        version: { major: 1, minor: 0, patch: 0 },
        tokens: [],
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  await page.getByLabel("Token address", { exact: true }).fill(token);
  await page
    .getByRole("button", { name: "Inspect token", exact: true })
    .click();
  await expect(page.getByText("DEV6", { exact: true })).toBeVisible();
  await expect(page.getByText(/Unlisted token/)).toBeVisible();
});

test("failed import persistence reports an error without claiming a saved import", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Object.getOwnPropertyDescriptor(
      Storage.prototype,
      "setItem",
    )?.value as (this: Storage, key: string, value: string) => void;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith("ptl:imports:"))
        throw new DOMException("Full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  await page.getByLabel("Token address", { exact: true }).fill(token);
  await page
    .getByRole("button", { name: "Inspect token", exact: true })
    .click();
  await page.getByRole("button", { name: "Save import", exact: true }).click();
  await expect(page.getByText(/Import could not be saved/)).toBeVisible();
  await expect(page.getByText("Import saved.", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Use token", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  await expect(
    page.getByLabel("Token", { exact: true }).getByRole("option"),
  ).toHaveCount(1);
});

test("saving in another tab refreshes imported token selection without losing existing entries", async ({
  context,
  page,
}) => {
  await context.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  const other = await context.newPage();
  await other.goto("/");
  await other
    .getByLabel("Token network", { exact: true })
    .selectOption("31337");
  await other.getByLabel("Token address", { exact: true }).fill(token);
  await other
    .getByRole("button", { name: "Inspect token", exact: true })
    .click();
  await other.getByRole("button", { name: "Save import", exact: true }).click();
  await expect(
    page
      .getByLabel("Token", { exact: true })
      .getByRole("option", { name: new RegExp(token) }),
  ).toHaveCount(1);
});
