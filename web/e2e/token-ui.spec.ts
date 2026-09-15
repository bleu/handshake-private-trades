import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";
import { connectTokenWallet } from "./token-wallet";
import { createStorageAdapter } from "../src/infrastructure/storage";

const first = "0x1111111111111111111111111111111111111111";
const second = "0x2222222222222222222222222222222222222222";
const third = "0x3333333333333333333333333333333333333333";
const tokens = [
  {
    chainId: 100,
    address: first,
    symbol: "AAA",
    name: "First token",
    decimals: 6,
  },
  {
    chainId: 100,
    address: second,
    symbol: "BBB",
    name: "Second token",
    decimals: 18,
  },
  {
    chainId: 100,
    address: third,
    symbol: "CCC",
    name: "Third token",
    decimals: 6,
  },
];
async function setup(page: Page, makerBalance = 1234567n) {
  await connectTokenWallet(page);
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
  storage.saveDraft(1, {
    makerToken: first,
    takerToken: second,
    makerAmount: "1",
    takerAmount: "2",
  });
  await page.addInitScript(
    (entries) => {
      for (const [key, value] of entries) localStorage.setItem(key, value);
    },
    [...values],
  );
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({
      json: {
        name: "Balances",
        timestamp: "2026-09-14T00:00:00Z",
        version: { major: 1, minor: 0, patch: 0 },
        tokens,
      },
    }),
  );
  await page.route("https://rpc.gnosischain.com/**", async (route) => {
    const request = z
      .object({
        id: z.union([z.number(), z.string()]),
        method: z.string(),
        params: z.array(z.unknown()).default([]),
      })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    const call = z
      .object({ to: z.string(), data: z.string() })
      .safeParse(request.params[0]);
    let value = 0n;
    if (call.success) {
      if (call.data.data.startsWith("0x313ce567"))
        value = call.data.to === second ? 18n : 6n;
      if (call.data.data.startsWith("0x70a08231"))
        value =
          call.data.to === first
            ? makerBalance
            : call.data.to === second
              ? 9200000000000000000n
              : 123n;
    }
    await route.fulfill({
      json: {
        jsonrpc: "2.0",
        id: request.id,
        result: "0x" + value.toString(16).padStart(64, "0"),
      },
    });
  });
}
async function connect(page: Page) {
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
}

test("an unfetched balance is hidden rather than displayed as unavailable", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Choose Send token", exact: true }),
  ).toContainText("AAA");
  await expect(page.getByText(/^Balance:/)).toHaveCount(0);
  await connect(page);
  await expect(
    page.getByText("Balance: 1.234567", { exact: true }),
  ).toBeVisible();
});

test("a fetched balance survives reload and failed refresh without crossing wallet accounts", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await connect(page);
  await expect(
    page.getByText("Balance: 1.234567", { exact: true }),
  ).toBeVisible();
  await page.route("https://rpc.gnosischain.com/**", async (route) => {
    const request = z
      .object({
        id: z.union([z.number(), z.string()]),
        params: z.array(z.unknown()).default([]),
      })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    const call = z.object({ data: z.string() }).safeParse(request.params[0]);
    if (call.success && call.data.data.startsWith("0x70a08231"))
      await route.fulfill({
        json: {
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32000, message: "Temporarily unavailable" },
        },
      });
    else await route.fallback();
  });
  await page.reload();
  await connect(page);
  await expect(
    page.getByText("Balance: 1.234567", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("test:token-account")),
  );
  await expect(page.getByText(/^Balance:/)).toHaveCount(0);
});

test("the compact picker waits for balances and sorts quantities across different decimals", async ({
  page,
}) => {
  await setup(page);
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({
      json: {
        name: "Balances",
        timestamp: "2026-09-14T00:00:00Z",
        version: { major: 1, minor: 0, patch: 0 },
        tokens: [tokens[1], tokens[2], tokens[0]],
      },
    }),
  );
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("https://rpc.gnosischain.com/**", async (route) => {
    const request = z
      .object({
        id: z.union([z.number(), z.string()]),
        params: z.array(z.unknown()).default([]),
      })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    const call = z
      .object({ to: z.string(), data: z.string() })
      .safeParse(request.params[0]);
    if (call.success && call.data.data.startsWith("0x70a08231")) {
      await gate;
      const amount =
        call.data.to === first
          ? 123456789n
          : call.data.to === second
            ? 9200000000000000000n
            : 123n;
      await route.fulfill({
        json: {
          jsonrpc: "2.0",
          id: request.id,
          result: "0x" + amount.toString(16).padStart(64, "0"),
        },
      });
    } else await route.fallback();
  });
  try {
    await page.goto("/");
    await connect(page);
    await page
      .getByRole("button", { name: "Choose Send token", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("status", { name: "Loading balances", exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole("option")).toHaveCount(0);
    release();
    await expect(dialog.getByRole("option")).toHaveText([
      /AAA.*0x1111…1111.*123.45/s,
      /BBB.*0x2222…2222.*9.2/s,
      /CCC.*0x3333…3333.*<0.01/s,
    ]);
    await expect(
      dialog.getByRole("button", { name: "Refresh token list" }),
    ).toHaveCount(0);
    await expect(dialog.getByText("First token", { exact: true })).toHaveCount(
      0,
    );
    await expect(dialog.getByText(first, { exact: true })).toHaveCount(0);
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        path: `../.scratch/handshake-ui/screenshots/compact-balances-${String(width)}.png`,
        fullPage: true,
      });
    }
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: "../.scratch/handshake-ui/screenshots/max-balance-375.png",
      fullPage: true,
    });
  } finally {
    release();
  }
});

test("a fetched balance remains during refresh when persistent storage is full", async ({
  page,
}) => {
  await setup(page);
  await page.addInitScript(() => {
    // Preserve the native receiver below while simulating quota failure at the storage boundary.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("ptl:display-balance:"))
        throw new DOMException("Storage full", "QuotaExceededError");
      write.call(this, key, value);
    };
  });
  await page.goto("/");
  await connect(page);
  const balance = page.getByText("Balance: 1.234567", { exact: true });
  await expect(balance).toBeVisible();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("https://rpc.gnosischain.com/**", async (route) => {
    if (route.request().postData()?.includes("0x70a08231")) await gate;
    await route.fallback();
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByRole("button", { name: "Max", exact: true }),
    ).toBeEnabled();
    await expect(balance).toBeVisible();
  } finally {
    release();
  }
});

test("a square token image stays circular after selection", async ({
  page,
}) => {
  await setup(page);
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({
      json: {
        name: "Square logo",
        timestamp: "2026-09-14T00:00:00Z",
        version: { major: 1, minor: 0, patch: 0 },
        tokens: [
          {
            ...tokens[0],
            symbol: "WXDAI",
            logoURI: "https://tokens.example/wxdai.svg",
          },
          tokens[1],
        ],
      },
    }),
  );
  await page.route("https://tokens.example/wxdai.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><path fill="#48a9a6" d="M0 0h64v64H0z"/></svg>',
    }),
  );
  await page.goto("/");
  const selected = page.getByRole("button", {
    name: "Choose Send token",
    exact: true,
  });
  const logo = selected.getByRole("img", { name: "WXDAI logo" });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveCSS("border-radius", "50%");
  await expect(logo).toHaveCSS("object-fit", "cover");
});

test("token balances and modal navigation have readable, aligned controls", async ({
  page,
}, testInfo) => {
  await setup(page);
  await page.goto("/");
  await connect(page);
  const balance = page.getByText("Balance: 1.234567", { exact: true });
  await expect(balance).toBeVisible();
  const max = page.getByRole("button", { name: "Max", exact: true });
  await expect(balance).toHaveCSS(
    "font-size",
    await max.evaluate((el) => getComputedStyle(el).fontSize),
  );
  await page
    .getByRole("button", { name: "Choose Send token", exact: true })
    .click();
  await page.getByRole("button", { name: "Import token", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Import token",
    exact: true,
  });
  const back = dialog.getByRole("button", {
    name: "Back to tokens",
    exact: true,
  });
  await expect(back).toHaveText("");
  const close = dialog.getByRole("button", {
    name: "Close Import token",
    exact: true,
  });
  expect((await close.boundingBox())?.width).toBeGreaterThanOrEqual(44);
  expect((await close.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect((await back.boundingBox())?.y).toBe((await close.boundingBox())?.y);
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: testInfo.outputPath(`import-controls-${String(width)}.png`),
      fullPage: true,
    });
  }
  await back.click();
  await expect(
    page.getByRole("dialog", { name: "Select token", exact: true }),
  ).toBeVisible();
});

test("back from an import preview returns to a clean token list", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Choose Send token", exact: true })
    .click();
  await page.getByRole("button", { name: "Import token", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Token address", exact: true })
    .fill("0x4444444444444444444444444444444444444444");
  await page
    .getByRole("button", { name: "Import information", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Token details", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to tokens", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Token details", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Import token", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Token details", exact: true }),
  ).toHaveCount(0);
});

test("a populated invalid amount explains precision without using an error-colored action", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await connect(page);
  await expect(
    page.getByText("Balance: 1.234567", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Send amount", exact: true })
    .fill("1.0000001");
  const action = page.getByRole("button", {
    name: "Amount exceeds token precision.",
    exact: true,
  });
  await expect(action).toBeDisabled();
  await expect(action).toHaveCSS("background-color", "rgb(41, 56, 79)");
});

test("trade labels and expiry options match the balance text size", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await connect(page);
  await expect(
    page.getByText("Balance: 1.234567", { exact: true }),
  ).toBeVisible();
  for (const label of ["You send", "You receive", "Expires after"]) {
    await expect(page.getByText(label, { exact: true })).toHaveCSS(
      "font-size",
      "14px",
    );
  }
  await expect(page.getByRole("combobox", { name: "Duration" })).toHaveCSS(
    "font-size",
    "14px",
  );
});

test("import token is a centered filled button", async ({ page }) => {
  await setup(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Choose Send token", exact: true })
    .click();
  const button = page.getByRole("button", {
    name: "Import token",
    exact: true,
  });
  await expect(button).toHaveCSS("justify-content", "center");
  await expect(button).toHaveCSS("background-color", "rgb(32, 197, 217)");
  await expect(button).toHaveCSS("border-radius", "14px");
});

test("background reads keep Create and review actions stable", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await connect(page);
  const review = page.getByRole("button", {
    name: "Review trade",
    exact: true,
  });
  await expect(review).toBeEnabled();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("https://rpc.gnosischain.com/**", async (route) => {
    requests++;
    await gate;
    await route.fallback();
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => requests).toBeGreaterThan(0);
    await expect(review).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Max", exact: true }),
    ).toBeEnabled();
    await review.click();
    await expect(
      page.getByRole("heading", { name: "Review order" }),
    ).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Approve token", exact: true }),
    ).toBeEnabled();
  } finally {
    release();
  }
  const approve = page.getByRole("button", {
    name: "Approve token",
    exact: true,
  });
  await expect(approve).toBeEnabled();
  let finish = () => {};
  const refresh = new Promise<void>((resolve) => {
    finish = resolve;
  });
  requests = 0;
  await page.route("https://rpc.gnosischain.com/**", async (route) => {
    requests++;
    await refresh;
    await route.fallback();
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => requests).toBeGreaterThan(0);
    await expect(approve).toBeEnabled();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  } finally {
    finish();
  }
});

test("import Save stays enabled while known decimals refresh", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Choose Send token", exact: true })
    .click();
  await page.getByRole("button", { name: "Import token", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Token address", exact: true })
    .fill("0x4444444444444444444444444444444444444444");
  await page
    .getByRole("button", { name: "Import information", exact: true })
    .click();
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeEnabled();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  await page.route("https://rpc.gnosischain.com/**", async (route) => {
    reads++;
    await gate;
    await route.fallback();
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => reads).toBeGreaterThan(0);
    await expect(save).toBeEnabled();
    await expect(
      page.getByRole("status", { name: "Reading token decimals", exact: true }),
    ).toHaveCount(0);
  } finally {
    release();
  }
});

test("token options remain selectable during a balance and decimals refresh", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Choose Send token", exact: true })
    .click();
  const option = page.getByRole("option", {
    name: `AAA ${first}`,
    exact: true,
  });
  await expect(option).toBeEnabled();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  await page.route("https://rpc.gnosischain.com/**", async (route) => {
    reads++;
    await gate;
    await route.fallback();
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => reads).toBeGreaterThan(0);
    await expect(option).toBeEnabled();
  } finally {
    release();
  }
});

test("review explains a completed decimals failure only after the refresh settles", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await connect(page);
  await page.getByRole("button", { name: "Review trade", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Approve token", exact: true }),
  ).toBeEnabled();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  await page.route("https://rpc.gnosischain.com/**", async (route) => {
    const request = z
      .object({ id: z.union([z.number(), z.string()]) })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    reads++;
    await gate;
    await route.fulfill({
      json: {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32000, message: "Unavailable" },
      },
    });
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => reads).toBeGreaterThan(0);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Approve token", exact: true }),
    ).toBeEnabled();
  } finally {
    release();
  }
  await expect(
    page.getByText("Token decimals unavailable.", { exact: true }),
  ).toBeVisible();
});

test("Max is hidden until a selected token has a positive wallet balance", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  const max = page.getByRole("button", { name: "Max", exact: true });
  await expect(
    page.getByRole("button", { name: "Choose Send token", exact: true }),
  ).toContainText("AAA");
  await expect(max).toHaveCount(0);
  await connect(page);
  await expect(max).toBeVisible();
  await max.click();
  await expect(page.getByLabel("Send amount")).toHaveValue("1.234567");
});

test("Max is hidden for a selected token with zero balance", async ({
  page,
}) => {
  await setup(page, 0n);
  await page.goto("/");
  await connect(page);
  await expect(page.getByText("Balance: 0", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Max", exact: true }),
  ).toHaveCount(0);
});

test("Max is hidden when no send token is selected", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto("/");
  await connect(page);
  await expect(
    page.getByRole("button", { name: "Choose Send token", exact: true }),
  ).toContainText("Select token");
  await expect(
    page.getByRole("button", { name: "Max", exact: true }),
  ).toHaveCount(0);
});
