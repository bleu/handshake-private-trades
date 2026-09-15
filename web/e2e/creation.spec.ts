import { selectNetwork } from "./network-control";
import { expect, test } from "@playwright/test";
import { connectTokenWallet } from "./token-wallet";

test("maker reviews exact amounts, token addresses and duration before any wallet action", async ({
  page,
}) => {
  await connectTokenWallet(page);
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await selectNetwork(page, "31337");
  for (const [side, address] of [
    ["Send", "0x5FbDB2315678afecb367f032d93F642f64180aa3"],
    ["Receive", "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"],
  ] as const) {
    await page
      .getByRole("button", { name: `Choose ${side} token`, exact: true })
      .click();
    if (!(await page.getByLabel("Token address", { exact: true }).isVisible()))
      await page
        .getByRole("button", { name: "Import token", exact: true })
        .click();
    await page.getByLabel("Token address", { exact: true }).fill(address);
    await page
      .getByRole("button", { name: "Import information", exact: true })
      .click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog").getByRole("option").click();
  }
  await page.getByLabel("Send amount").fill("1.234567");
  await page.getByLabel("Receive amount").fill("2.5");
  await expect(page.getByLabel("Duration")).toHaveValue("1 day");
  await expect(page.getByLabel("Duration").getByRole("option")).toHaveText([
    "1 hour",
    "1 day",
    "1 week",
    "1 month",
    "1 year",
    "Unlimited",
  ]);
  await page.getByRole("button", { name: "Review trade", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review order", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("You send: 1.234567", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("You receive: 2.5", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Anyone with the link", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1 day", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Chain Selector", exact: true }),
  ).toContainText("Anvil");
  await expect(page.getByText(/List membership unknown/)).toHaveCount(2);
  await expect(
    page.getByText(/Fee-on-transfer tokens are unsupported/),
  ).toHaveCount(0);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("test:token-account")),
  );
  await expect(page.getByRole("button", { name: /0x70/i })).toBeVisible();
  await page.reload();
  await selectNetwork(page, "31337");
  await expect(
    page.getByRole("heading", { name: "Review order", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1 day", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Wallet", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit terms" }).click();
  await expect(page.getByLabel("Send amount")).toHaveValue("1.234567");
});

test("maker fills Max from the fresh exact token balance", async ({ page }) => {
  await connectTokenWallet(page);
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await selectNetwork(page, "31337");
  await page
    .getByRole("button", { name: "Choose Send token", exact: true })
    .click();
  if (!(await page.getByLabel("Token address", { exact: true }).isVisible()))
    await page
      .getByRole("button", { name: "Import token", exact: true })
      .click();
  await page
    .getByLabel("Token address", { exact: true })
    .fill("0x5FbDB2315678afecb367f032d93F642f64180aa3");
  await page
    .getByRole("button", { name: "Import information", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").getByRole("option").click();
  await page.getByRole("button", { name: "Max", exact: true }).click();
  await expect(page.getByLabel("Send amount")).toHaveValue("1000000");
  await page
    .getByRole("button", { name: "Choose Receive token", exact: true })
    .click();
  if (!(await page.getByLabel("Token address", { exact: true }).isVisible()))
    await page
      .getByRole("button", { name: "Import token", exact: true })
      .click();
  await page
    .getByLabel("Token address", { exact: true })
    .fill("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512");
  await page
    .getByRole("button", { name: "Import information", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").getByRole("option").click();
  await page.getByLabel("Receive amount").fill("1");
  await page.getByLabel("Send amount").fill("1000001");
  await expect(
    page.getByRole("button", {
      name: "Insufficient send-token balance.",
      exact: true,
    }),
  ).toBeDisabled();
});
