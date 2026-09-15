import { expect, test } from "@playwright/test";
import { z } from "zod";
import { erc20Abi } from "viem";
import { MAX_UINT256 } from "../src/domain/orders";
import { tradeFixture } from "./trade-fixture";
import { installAnvilWallet } from "./anvil-wallet";
import { localClient, localWallet, maker, taker } from "./local-token";

test("a maker confirms cancellation from a retained link despite zero funding and failed token reads", async ({
  page,
}) => {
  const { payload, signed, deployment, id } = await tradeFixture({
    expiration: MAX_UINT256,
  });
  await localClient.waitForTransactionReceipt({
    hash: await localWallet.writeContract({
      address: signed.order.makerToken,
      abi: erc20Abi,
      functionName: "transfer",
      args: [taker, 1000000000000n],
    }),
  });
  await installAnvilWallet(page);
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const request = z
      .object({
        id: z.number(),
        method: z.string(),
        params: z.array(z.unknown()).default([]),
      })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    const call = z.object({ to: z.string() }).safeParse(request.params[0]);
    if (
      request.method === "eth_call" &&
      call.success &&
      call.data.to.toLowerCase() !== deployment.address.toLowerCase()
    )
      await route.fulfill({
        json: {
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32602, message: "Token unavailable" },
        },
      });
    else await route.continue();
  });
  await page.goto(`/trade#${payload}`);
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await page.getByRole("button", { name: "Cancel order", exact: true }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Cancel this order?",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText(id);
  await expect(
    confirmation.getByText(
      "You send: 50000000 base units (decimals unavailable)",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Cancellation takes effect when confirmed onchain. The order may still be filled before then.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    await localClient.readContract({
      address: deployment.address,
      abi: deployment.abi,
      functionName: "orderStatus",
      args: [id],
    }),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(
    page.getByText("Cancellation confirmed.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Order status: Cancelled", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel order", exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(`/trade#${payload}`);
});

test("cancellation is hidden from other wallets and after expiration", async ({
  page,
}) => {
  const { payload } = await tradeFixture({
    expiration: BigInt(Math.floor(Date.now() / 1000)) + 60n,
  });
  await installAnvilWallet(page, taker);
  await page.goto(`/trade#${payload}`);
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel order", exact: true }),
  ).toHaveCount(0);
  await page.evaluate((account) => {
    window.dispatchEvent(
      new CustomEvent("test:anvil-account", { detail: account }),
    );
  }, maker);
  await expect(
    page.getByRole("button", { name: "Cancel order", exact: true }),
  ).toBeEnabled();
  await page.clock.setFixedTime(new Date(Date.now() + 120000));
  await expect(
    page.getByText("Order status: Expired", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel order", exact: true }),
  ).toHaveCount(0);
});

for (const winner of ["fill", "cancel"] as const) {
  test(`the first confirmed ${winner} wins the race between settlement and maker cancellation`, async ({
    page,
  }) => {
    const { payload, signed, deployment } = await tradeFixture();
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
    await installAnvilWallet(page);
    await page.goto(`/trade#${payload}`);
    await page
      .getByRole("button", { name: "Connect Wallet", exact: true })
      .click();
    await page
      .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
      .click();
    await expect(
      page.getByRole("button", { name: "Cancel order", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Cancel order", exact: true })
      .click();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    if (winner === "fill")
      await page.route("http://127.0.0.1:8545/", async (route) => {
        const request = z
          .object({ method: z.string() })
          .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
        if (request.method === "eth_sendTransaction") await gate;
        await route.continue();
      });
    await page
      .getByRole("button", { name: "Confirm cancellation", exact: true })
      .click();
    const fill = () =>
      localWallet.writeContract({
        account: taker,
        address: deployment.address,
        abi: deployment.abi,
        functionName: "settle",
        args: [signed.order, signed.signature],
      });
    if (winner === "fill") {
      await expect(
        page.getByText("Awaiting wallet: cancellation.", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Confirm cancellation", exact: true }),
      ).toBeDisabled();
      await localClient.waitForTransactionReceipt({ hash: await fill() });
      release();
      await expect(
        page.getByText(
          /Cancellation failed or was rejected|Cancellation reverted/,
        ),
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
    } else {
      await expect(
        page.getByText("Cancellation confirmed.", { exact: true }),
      ).toBeVisible();
      const losingReceipt = await localClient.waitForTransactionReceipt({
        hash: await fill(),
      });
      expect(losingReceipt.status).toBe("reverted");
      await expect(
        page.getByText("Order status: Cancelled", { exact: true }),
      ).toBeVisible();
      expect(
        await localClient.readContract({
          address: signed.order.makerToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [taker],
        }),
      ).toBe(1000000000000n);
    }
    await expect(
      page.getByRole("button", { name: "Cancel order", exact: true }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(`/trade#${payload}`);
  });
}

test("a failed fresh status read prevents cancellation and recovery requires a new explicit confirmation", async ({
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
  await expect(
    page.getByRole("button", { name: "Cancel order", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Cancel order", exact: true }).click();
  let submitted = 0;
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const request = z
      .object({ id: z.number(), method: z.string() })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    if (request.method === "eth_sendTransaction") submitted++;
    await route.fulfill({
      json: {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32602, message: "Unavailable" },
      },
    });
  });
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(
    page.getByText(
      "Order is no longer open or its status is unavailable. No cancellation was sent.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(submitted).toBe(0);
  await expect(
    page.getByRole("button", { name: "Confirm cancellation", exact: true }),
  ).toBeDisabled();
  await page.unroute("http://127.0.0.1:8545/");
  await page
    .getByRole("dialog", { name: "Cancel this order?", exact: true })
    .getByRole("button", { name: "Refresh trade" })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm cancellation", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("Order status: Open", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(
    page.getByText("Cancellation confirmed.", { exact: true }),
  ).toBeVisible();
});

test("cancellation rejection remains visible inside the confirmation and permits an explicit retry", async ({
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
  await page.getByRole("button", { name: "Cancel order", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Cancel this order?",
    exact: true,
  });
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
  await dialog
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Cancellation failed or was rejected",
  );
  await expect(
    dialog.getByRole("button", { name: "Confirm cancellation", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Dismiss notification", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(
    page.getByText("Cancellation confirmed.", { exact: true }),
  ).toBeVisible();
});
