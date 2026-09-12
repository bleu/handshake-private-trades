import { expect, test, type Page } from "@playwright/test";
import { erc20Abi, getAddress } from "viem";
import { decodeOrderLink, MAX_UINT256 } from "../src/domain/orders";
import { installAnvilWallet } from "./anvil-wallet";
import { deployToken, localClient, maker, taker } from "./local-token";
import { tradeRegistry, tradeFixture } from "./trade-fixture";

test.use({ actionTimeout: 10000 });

async function connect(page: Page) {
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
}
async function fitsViewport(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
}

test("mobile maker imports tokens, restores a draft, shares an accepted trade, then creates and cancels an independent offer", async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.setTimeout(90000);
  const send = await deployToken();
  const receive = await deployToken();
  const balances = async () =>
    Promise.all(
      (
        [
          [send, maker],
          [send, taker],
          [receive, maker],
          [receive, taker],
        ] as const
      ).map(([address, account]) =>
        localClient.readContract({
          address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account],
        }),
      ),
    );
  expect(await balances()).toEqual([
    1000000000000n,
    1000000000000n,
    1000000000000n,
    1000000000000n,
  ]);
  const requests: string[] = [];
  const diagnostics: string[] = [];
  const observe = (target: Page) => {
    target.on("request", (request) =>
      requests.push(request.url() + (request.postData() ?? "")),
    );
    target.on("console", (message) => diagnostics.push(message.text()));
    target.on("pageerror", (error) => diagnostics.push(error.message));
  };
  observe(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 320, height: 740 });
  await installAnvilWallet(page);
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await connect(page);
  await page.getByLabel("Trade network").selectOption("31337");
  await fitsViewport(page);
  for (const [side, address] of [
    ["Send", send],
    ["Receive", receive],
  ] as const) {
    await page
      .getByRole("button", { name: `Choose ${side} token`, exact: true })
      .click();
    await page.getByLabel("Token address", { exact: true }).fill(address);
    await page
      .getByRole("button", { name: "Inspect token", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save import", exact: true })
      .click();
    await expect(
      page.getByText("Import saved.", { exact: true }),
    ).toBeVisible();
    await fitsViewport(page);
    await page.getByRole("button", { name: "Use token", exact: true }).click();
  }
  await page.getByLabel("Send amount").fill("5");
  await page.getByLabel("Receive amount").fill("7");
  await page.getByRole("button", { name: "Review trade", exact: true }).click();
  await page.reload();
  await connect(page);
  await page.getByLabel("Trade network").selectOption("31337");
  await expect(page.getByText("You send: 5", { exact: true })).toBeVisible();
  await expect(page.getByText("You receive: 7", { exact: true })).toBeVisible();
  await fitsViewport(page);
  await page
    .getByRole("button", { name: "Approve token", exact: true })
    .click();
  await expect(
    page.getByText("Approval confirmed.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign order", exact: true }).click();
  await expect(page).toHaveURL(/\/trade#[A-Za-z0-9_-]{367}$/);
  const firstLink = page.url();
  const first = await decodeOrderLink(
    new URL(firstLink).hash.slice(1),
    tradeRegistry,
  );
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    firstLink,
  );
  await fitsViewport(page);
  await page.screenshot({
    path: testInfo.outputPath("maker-mobile.png"),
    fullPage: true,
  });
  const recipientContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  try {
    const recipient = await recipientContext.newPage();
    observe(recipient);
    await installAnvilWallet(recipient, taker);
    await recipient.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
      route.fulfill({ status: 503, body: "Unavailable" }),
    );
    await recipient.goto(firstLink);
    await expect(
      recipient.getByText("Maker sends: 5", { exact: true }),
    ).toBeVisible();
    await connect(recipient);
    await recipient
      .getByRole("button", { name: "Approve token", exact: true })
      .click();
    await expect(
      recipient.getByText("Approval confirmed.", { exact: true }),
    ).toBeVisible();
    await recipient
      .getByRole("button", { name: "Accept trade", exact: true })
      .click();
    await expect(
      recipient.getByText("Settlement confirmed.", { exact: true }),
    ).toBeVisible();
    await expect(
      recipient.getByText("Order status: Filled", { exact: true }),
    ).toBeVisible();
    await fitsViewport(recipient);
    await recipient.screenshot({
      path: testInfo.outputPath("taker-desktop.png"),
      fullPage: true,
    });
    const after = await balances();
    expect(after).toEqual([
      999995000000n,
      1000005000000n,
      1000007000000n,
      999993000000n,
    ]);
    await recipient.getByRole("link", { name: "History", exact: true }).click();
    await recipient.getByLabel("History network").selectOption("31337");
    await expect(
      recipient.getByText("No saved orders for this maker and network.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByText("Order status: Filled", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Create new order", exact: true })
      .click();
    await expect(page.getByLabel("Send amount")).toHaveValue("5");
    await page.getByLabel("Duration").selectOption("Unlimited");
    await page
      .getByRole("button", { name: "Choose Send token", exact: true })
      .click();
    await page
      .getByLabel("Token", { exact: true })
      .selectOption(getAddress(send));
    await page.getByRole("button", { name: "Use token", exact: true }).click();
    await page
      .getByRole("button", { name: "Review trade", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Approve token", exact: true })
      .click();
    await expect(
      page.getByText("Approval confirmed.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign order", exact: true }).click();
    await expect(page).toHaveURL(/\/trade#[A-Za-z0-9_-]{367}$/);
    const secondLink = page.url();
    const second = await decodeOrderLink(
      new URL(secondLink).hash.slice(1),
      tradeRegistry,
    );
    expect(second.order.salt).not.toBe(first.order.salt);
    await page
      .getByRole("button", { name: "Cancel order", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm cancellation", exact: true })
      .click();
    await expect(
      page.getByText("Cancellation confirmed.", { exact: true }),
    ).toBeVisible();
    expect(await balances()).toEqual(after);
    await page.getByRole("link", { name: "History", exact: true }).click();
    await page.getByLabel("History network").selectOption("31337");
    await expect(page.getByRole("article")).toHaveCount(2);
    await expect(
      page.getByText("Status: Filled", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Status: Cancelled", { exact: true }),
    ).toBeVisible();
    await fitsViewport(page);
    await page.screenshot({
      path: testInfo.outputPath("history-mobile.png"),
      fullPage: true,
    });
    expect(first.deploymentId).toBe(2);
    expect(second.deploymentId).toBe(2);
    const submissions = requests.filter((request) =>
      request.includes('"eth_sendTransaction"'),
    );
    expect(submissions).toHaveLength(5);
    expect(
      submissions.every((request) =>
        request.startsWith("http://127.0.0.1:8545/"),
      ),
    ).toBe(true);
    for (const link of [firstLink, secondLink]) {
      const payload = new URL(link).hash.slice(1);
      expect(requests.some((request) => request.includes(payload))).toBe(false);
      expect(diagnostics.some((message) => message.includes(payload))).toBe(
        false,
      );
    }
    for (const signed of [first, second])
      expect(
        diagnostics.some(
          (message) =>
            message.includes(signed.signature) ||
            message.includes(signed.order.salt),
        ),
      ).toBe(false);
  } finally {
    await recipientContext.close();
  }
});

test("uint256-scale signed amounts remain readable without horizontal overflow on a narrow trade view", async ({
  page,
}, testInfo) => {
  const { payload } = await tradeFixture({
    makerAmount: MAX_UINT256,
    takerAmount: MAX_UINT256 - 1n,
    expiration: MAX_UINT256,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto(`/trade#${payload}`);
  await expect(
    page.getByText("Expiration: Unlimited", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/^Maker sends: 115792089237316195423570985/),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("large-amount-mobile.png"),
    fullPage: true,
  });
  await fitsViewport(page);
});

test("invalid signed links are rejected without sending fragments or signed data to diagnostics or HTTP endpoints", async ({
  page,
}) => {
  const { payload, signed } = await tradeFixture();
  const bytes = Buffer.from(payload, "base64url");
  bytes[99] = (bytes[99] ?? 0) ^ 1;
  const invalid = bytes.toString("base64url");
  const requests: string[] = [];
  const diagnostics: string[] = [];
  const pageErrors: string[] = [];
  page.on("request", (request) =>
    requests.push(request.url() + (request.postData() ?? "")),
  );
  page.on("console", (message) => diagnostics.push(message.text()));
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`/trade#${invalid}`);
  await expect(
    page.getByText(/Invalid or unsupported trade link/),
  ).toBeVisible();
  await expect(page.getByText(/^Maker sends:/)).toHaveCount(0);
  expect(
    requests.some(
      (request) =>
        request.includes(invalid) ||
        request.includes(payload) ||
        request.includes('"eth_sendTransaction"'),
    ),
  ).toBe(false);
  expect(
    diagnostics.some((message) =>
      [invalid, payload, signed.signature, signed.order.salt].some((value) =>
        message.includes(value),
      ),
    ),
  ).toBe(false);
  expect(pageErrors).toEqual([]);
});
