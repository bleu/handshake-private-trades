import { expect, test } from "@playwright/test";
import { createStorageAdapter } from "../src/infrastructure/storage";

const token = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
test("a custom token persists across reloads and remains usable while the CoW list is unavailable", async ({
  page,
}) => {
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/tokens");
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  if (!(await page.getByLabel("Token address", { exact: true }).isVisible()))
    await page
      .getByRole("button", { name: "Import token", exact: true })
      .click();
  await page.getByLabel("Token address", { exact: true }).fill(token);
  await page
    .getByRole("button", { name: "Import information", exact: true })
    .click();
  await expect(
    page.getByText("Decimals (onchain): 6", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Import saved.", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  await page
    .getByLabel("Token", { exact: true })
    .getByRole("option", { name: new RegExp(token, "i") })
    .click();
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
  await page.goto("/tokens");
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  if (!(await page.getByLabel("Token address", { exact: true }).isVisible()))
    await page
      .getByRole("button", { name: "Import token", exact: true })
      .click();
  await page.getByLabel("Token address", { exact: true }).fill(token);
  await page
    .getByRole("button", { name: "Import information", exact: true })
    .click();
  await expect(page.getByText("DEV6", { exact: true })).toBeVisible();
  await expect(page.getByText(/Outside whitelist/)).toBeVisible();
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
  await page.goto("/tokens");
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  if (!(await page.getByLabel("Token address", { exact: true }).isVisible()))
    await page
      .getByRole("button", { name: "Import token", exact: true })
      .click();
  await page.getByLabel("Token address", { exact: true }).fill(token);
  await page
    .getByRole("button", { name: "Import information", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Import could not be saved/)).toBeVisible();
  await expect(page.getByText("Import saved.", { exact: true })).toHaveCount(0);
  await page
    .getByRole("alert")
    .filter({ hasText: /Import could not be saved/ })
    .getByRole("button", { name: "Dismiss notification" })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /Import could not be saved/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use token", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  await expect(
    page.getByLabel("Token", { exact: true }).getByRole("option"),
  ).toHaveCount(0);
});

test("saving in another tab refreshes imported token selection without losing existing entries", async ({
  context,
  page,
}) => {
  await context.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/tokens");
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  const other = await context.newPage();
  await other.goto("/tokens");
  await other
    .getByLabel("Token network", { exact: true })
    .selectOption("31337");
  if (!(await other.getByLabel("Token address", { exact: true }).isVisible()))
    await other
      .getByRole("button", { name: "Import token", exact: true })
      .click();
  await other.getByLabel("Token address", { exact: true }).fill(token);
  await other
    .getByRole("button", { name: "Import information", exact: true })
    .click();
  await other.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page
      .getByLabel("Token", { exact: true })
      .getByRole("option", { name: new RegExp(token) }),
  ).toHaveCount(1);
});

test("editing an inspected address removes the old preview before it can be saved", async ({
  page,
}) => {
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/tokens");
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  if (!(await page.getByLabel("Token address", { exact: true }).isVisible()))
    await page
      .getByRole("button", { name: "Import token", exact: true })
      .click();
  await page.getByLabel("Token address", { exact: true }).fill(token);
  await page
    .getByRole("button", { name: "Import information", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  if (!(await page.getByLabel("Token address", { exact: true }).isVisible()))
    await page
      .getByRole("button", { name: "Import token", exact: true })
      .click();
  await page
    .getByLabel("Token address", { exact: true })
    .fill("0x1111111111111111111111111111111111111111");
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toHaveCount(0);
});

test("an imported token becoming listed loses its outside-whitelist warning", async ({
  page,
}) => {
  let listed = false;
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({
      json: {
        name: "Local list",
        timestamp: "2026-09-14T00:00:00Z",
        version: { major: 1, minor: 0, patch: 0 },
        tokens: listed
          ? [
              {
                chainId: 31337,
                address: token,
                symbol: "DEV6",
                name: "DEV6",
                decimals: 6,
              },
            ]
          : [],
      },
    }),
  );
  await page.goto("/tokens");
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  if (!(await page.getByLabel("Token address", { exact: true }).isVisible()))
    await page
      .getByRole("button", { name: "Import token", exact: true })
      .click();
  await page.getByLabel("Token address", { exact: true }).fill(token);
  await page
    .getByRole("button", { name: "Import information", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Outside whitelist", { exact: true }),
  ).toBeVisible();
  listed = true;
  await page
    .getByRole("button", { name: "Refresh token list", exact: true })
    .click();
  await expect(
    page.getByText("Outside whitelist", { exact: true }),
  ).toHaveCount(0);
});

test("an already saved token cannot be imported twice", async ({ page }) => {
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/tokens");
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  if (!(await page.getByLabel("Token address", { exact: true }).isVisible()))
    await page
      .getByRole("button", { name: "Import token", exact: true })
      .click();
  await page.getByLabel("Token address", { exact: true }).fill(token);
  await page
    .getByRole("button", { name: "Import information", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Import saved.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toHaveCount(0);
});

test("imported tokens can be found by their current onchain symbol", async ({
  page,
}) => {
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/tokens");
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  if (!(await page.getByLabel("Token address", { exact: true }).isVisible()))
    await page
      .getByRole("button", { name: "Import token", exact: true })
      .click();
  await page.getByLabel("Token address", { exact: true }).fill(token);
  await page
    .getByRole("button", { name: "Import information", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("button", { name: "Back to tokens", exact: true })
    .click();
  await page.getByLabel("Search tokens", { exact: true }).fill("DEV6");
  await expect(
    page
      .getByLabel("Token", { exact: true })
      .getByRole("option", { name: /DEV6/ }),
  ).toHaveCount(1);
});

test("search finds an imported address beyond the initial token page", async ({
  page,
}) => {
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
  for (let i = 1; i <= 41; i++)
    storage.saveImport({
      chainId: 31337,
      address: `0x${i.toString(16).padStart(40, "0")}`,
    });
  await page.addInitScript(
    (entries) => {
      for (const [key, value] of entries) localStorage.setItem(key, value);
    },
    [...values],
  );
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/tokens");
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  for (let i = 1; i <= 41; i++) {
    const address = `0x${i.toString(16).padStart(40, "0")}`;
    await page.getByLabel("Search tokens", { exact: true }).fill(address);
    await expect(
      page
        .getByLabel("Token", { exact: true })
        .getByRole("option", { name: new RegExp(address, "i") }),
    ).toHaveCount(1);
  }
});
