import { expandDetails } from "./order-details";
import {
  localClient,
  localWallet,
  maker,
  taker,
  settlement,
} from "./local-token";
import { openApproval } from "./approval-setup";
import { expect, test } from "@playwright/test";
import { createTestClient, http, erc20Abi } from "viem";
import { anvil } from "viem/chains";
import { z } from "zod";
import { tradeFixture } from "./trade-fixture";
import { installAnvilWallet } from "./anvil-wallet";

const node = createTestClient({
  chain: anvil,
  mode: "anvil",
  transport: http("http://127.0.0.1:8545"),
});

test("a confirmed cancellation whose receipt disappears returns to pending and rechecks the open order without resubmitting", async ({
  page,
}) => {
  const { payload } = await tradeFixture();
  const snapshot = await node.snapshot();
  await installAnvilWallet(page);
  let sends = 0;
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const request = z
      .object({ method: z.string() })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    if (request.method === "eth_sendTransaction") sends++;
    await route.continue();
  });
  await page.goto(`/trade#${payload}`);
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await page.getByRole("button", { name: "Cancel order", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(
    page.getByText("Cancellation confirmed.", { exact: true }),
  ).toBeVisible();
  await node.revert({ id: snapshot });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("Cancellation pending/rechecking. Receipt unavailable.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Cancellation confirmed.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Order status: Open", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel order", exact: true }),
  ).toBeDisabled();
  expect(sends).toBe(1);
});

test("temporary missing RPC receipts keep the submitted approval pending and recover without another wallet request", async ({
  page,
}) => {
  await openApproval(page);
  let hideReceipt = true;
  let sends = 0;
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const request = z
      .object({ id: z.number(), method: z.string() })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    if (request.method === "eth_sendTransaction") sends++;
    if (request.method === "eth_getTransactionReceipt" && hideReceipt)
      await route.fulfill({
        json: { jsonrpc: "2.0", id: request.id, result: null },
      });
    else await route.continue();
  });
  await page
    .getByRole("button", { name: "Approve token", exact: true })
    .click();
  await expect(
    page.getByText("Approval pending/rechecking. Receipt unavailable.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign order", exact: true }),
  ).toBeDisabled();
  hideReceipt = false;
  await expect(
    page.getByText("Approval confirmed.", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  expect(sends).toBe(1);
});

test("wallet cancellation follows the replacement hash and leaves the order open for an explicit retry", async ({
  page,
}) => {
  const { payload, deployment, id } = await tradeFixture();
  await installAnvilWallet(page);
  await page.goto(`/trade#${payload}`);
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await page.getByRole("button", { name: "Cancel order", exact: true }).click();
  let inspectedOriginal = false;
  let sends = 0;
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const request = z
      .object({ method: z.string() })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    if (request.method === "eth_sendTransaction") sends++;
    const response = await route.fetch();
    await route.fulfill({ response });
    if (request.method === "eth_getTransactionByHash") inspectedOriginal = true;
  });
  await node.setAutomine(false);
  try {
    await page
      .getByRole("button", { name: "Confirm cancellation", exact: true })
      .click();
    await expect(
      page.getByText("Cancellation pending.", { exact: true }),
    ).toBeVisible();
    await expect.poll(() => inspectedOriginal).toBe(true);
    const original = z
      .string()
      .regex(/^Transaction: 0x[0-9a-f]{64}$/i)
      .parse(await page.getByText(/^Transaction: 0x/).textContent())
      .slice(13) as `0x${string}`;
    const transaction = await localClient.getTransaction({ hash: original });
    const replacement = await localWallet.sendTransaction({
      to: maker,
      value: 0n,
      nonce: transaction.nonce,
      gas: 21000n,
      maxFeePerGas: (transaction.maxFeePerGas ?? transaction.gasPrice) * 2n,
      maxPriorityFeePerGas:
        (transaction.maxPriorityFeePerGas ?? 1000000000n) * 2n,
    });
    await node.mine({ blocks: 1 });
    await expect(
      page.getByText(
        "Wallet transaction cancelled. The order was not cancelled.",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 15000 });
    await expandDetails(page, "Transaction details");
    await expect(
      page.getByText(`Transaction: ${replacement}`, { exact: true }),
    ).toBeVisible();
    await expandDetails(page, "Transaction details");
    await expect(
      page.getByText(`Original transaction: ${original}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Order status: Open", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm cancellation", exact: true }),
    ).toBeEnabled();
    expect(
      await localClient.readContract({
        address: deployment.address,
        abi: deployment.abi,
        functionName: "orderStatus",
        args: [id],
      }),
    ).toBe(0);
    expect(sends).toBe(1);
  } finally {
    await node.setAutomine(true);
    await node.mine({ blocks: 1 });
  }
});

test("repricing across route, account and network changes confirms the original maker transaction without a new wallet request", async ({
  page,
}) => {
  const token = await openApproval(page);
  let inspectedOriginal = false;
  let sends = 0;
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const request = z
      .object({ method: z.string() })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    if (request.method === "eth_sendTransaction") sends++;
    const response = await route.fetch();
    await route.fulfill({ response });
    if (request.method === "eth_getTransactionByHash") inspectedOriginal = true;
  });
  await node.setAutomine(false);
  try {
    await page
      .getByRole("button", { name: "Approve token", exact: true })
      .click();
    await expect(
      page.getByText("Approval pending.", { exact: true }),
    ).toBeVisible();
    await expect.poll(() => inspectedOriginal).toBe(true);
    const original = z
      .string()
      .regex(/^Transaction: 0x[0-9a-f]{64}$/i)
      .parse(await page.getByText(/^Transaction: 0x/).textContent())
      .slice(13) as `0x${string}`;
    await page.getByRole("link", { name: "History", exact: true }).click();
    await page.evaluate((account) => {
      window.dispatchEvent(
        new CustomEvent("test:anvil-account", { detail: account }),
      );
      window.dispatchEvent(
        new CustomEvent("test:anvil-chain", { detail: "0x64" }),
      );
    }, taker);
    await expect(
      page.getByRole("button", { name: "Chain Selector", exact: true }),
    ).toContainText("Gnosis");
    await expandDetails(page, "Transaction details");
    await expect(
      page.getByText(`Account: ${maker} · Chain: 31337`, { exact: true }),
    ).toBeVisible();
    const transaction = await localClient.getTransaction({ hash: original });
    const replacement = await localWallet.sendTransaction({
      to: token,
      data: transaction.input,
      value: transaction.value,
      nonce: transaction.nonce,
      gas: transaction.gas,
      maxFeePerGas: (transaction.maxFeePerGas ?? transaction.gasPrice) * 2n,
      maxPriorityFeePerGas:
        (transaction.maxPriorityFeePerGas ?? 1000000000n) * 2n,
    });
    await node.mine({ blocks: 1 });
    await expandDetails(page, "Transaction details");
    await expect(
      page.getByText("Approval confirmed.", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expandDetails(page, "Transaction details");
    await expect(
      page.getByText(`Transaction: ${replacement}`, { exact: true }),
    ).toBeVisible();
    expect(
      await localClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [maker, settlement],
      }),
    ).toBe(50000000n);
    expect(
      await localClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [taker, settlement],
      }),
    ).toBe(0n);
    expect(sends).toBe(1);
    await page.reload();
    await expect(page.getByText(/^Transaction: 0x/)).toHaveCount(0);
    expect(sends).toBe(1);
  } finally {
    await node.setAutomine(true);
    await node.mine({ blocks: 1 });
  }
});

test("signing after approval does not forget the approval receipt when its block is reorganized", async ({
  page,
}) => {
  await openApproval(page);
  const snapshot = await node.snapshot();
  await page
    .getByRole("button", { name: "Approve token", exact: true })
    .click();
  await expect(
    page.getByText("Approval confirmed.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign order", exact: true }).click();
  await expect(page).toHaveURL(/\/trade#/);
  const link = page.url();
  await node.revert({ id: snapshot });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("Approval pending/rechecking. Receipt unavailable.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel order", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Trade link", { exact: true })).toHaveValue(
    link,
  );
});

test("a replacement mined during an RPC outage is discovered after the original hash disappears", async ({
  page,
}) => {
  const token = await openApproval(page);
  let inspectedOriginal = false;
  let outage = false;
  let hideOriginal = false;
  let original: `0x${string}` | undefined;
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const request = z
      .object({
        id: z.number(),
        method: z.string(),
        params: z.array(z.unknown()).default([]),
      })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    if (
      hideOriginal &&
      request.method === "eth_getTransactionByHash" &&
      request.params[0] === original
    ) {
      await route.fulfill({
        json: { jsonrpc: "2.0", id: request.id, result: null },
      });
      return;
    }
    if (
      outage &&
      [
        "eth_getTransactionReceipt",
        "eth_getBlockByNumber",
        "eth_blockNumber",
      ].includes(request.method)
    ) {
      await route.fulfill({
        json: {
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32602, message: "Unavailable" },
        },
      });
      return;
    }
    const response = await route.fetch();
    await route.fulfill({ response });
    if (request.method === "eth_getTransactionByHash") inspectedOriginal = true;
  });
  await node.setAutomine(false);
  try {
    await page
      .getByRole("button", { name: "Approve token", exact: true })
      .click();
    await expect.poll(() => inspectedOriginal).toBe(true);
    original = z
      .string()
      .regex(/^Transaction: 0x[0-9a-f]{64}$/i)
      .parse(await page.getByText(/^Transaction: 0x/).textContent())
      .slice(13) as `0x${string}`;
    const transaction = await localClient.getTransaction({ hash: original });
    outage = true;
    const replacement = await localWallet.sendTransaction({
      to: token,
      data: transaction.input,
      nonce: transaction.nonce,
      gas: transaction.gas,
      maxFeePerGas: (transaction.maxFeePerGas ?? transaction.gasPrice) * 2n,
      maxPriorityFeePerGas:
        (transaction.maxPriorityFeePerGas ?? 1000000000n) * 2n,
    });
    await node.mine({ blocks: 3 });
    await expect(
      page.getByText("Approval pending/rechecking. Receipt unavailable.", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 20000 });
    hideOriginal = true;
    outage = false;
    await expandDetails(page, "Transaction details");
    await expect(
      page.getByText("Approval confirmed.", { exact: true }),
    ).toBeVisible();
    await expandDetails(page, "Transaction details");
    await expect(
      page.getByText(`Transaction: ${replacement}`, { exact: true }),
    ).toBeVisible();
  } finally {
    await node.setAutomine(true);
    await node.mine({ blocks: 1 });
  }
});

test("a repriced transaction after a confirmed receipt disappears is followed through reorg recovery", async ({
  page,
}) => {
  const token = await openApproval(page);
  const snapshot = await node.snapshot();
  await page
    .getByRole("button", { name: "Approve token", exact: true })
    .click();
  await expect(
    page.getByText("Approval confirmed.", { exact: true }),
  ).toBeVisible();
  const original = z
    .string()
    .regex(/^Transaction: 0x[0-9a-f]{64}$/i)
    .parse(await page.getByText(/^Transaction: 0x/).textContent())
    .slice(13) as `0x${string}`;
  const transaction = await localClient.getTransaction({ hash: original });
  await node.revert({ id: snapshot });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("Approval pending/rechecking. Receipt unavailable.", {
      exact: true,
    }),
  ).toBeVisible();
  const replacement = await localWallet.sendTransaction({
    to: token,
    data: transaction.input,
    nonce: transaction.nonce,
    gas: transaction.gas,
    maxFeePerGas: (transaction.maxFeePerGas ?? transaction.gasPrice) * 2n,
    maxPriorityFeePerGas:
      (transaction.maxPriorityFeePerGas ?? 1000000000n) * 2n,
  });
  await localClient.waitForTransactionReceipt({ hash: replacement });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expandDetails(page, "Transaction details");
  await expect(
    page.getByText("Approval confirmed.", { exact: true }),
  ).toBeVisible();
  await expandDetails(page, "Transaction details");
  await expect(
    page.getByText(`Transaction: ${replacement}`, { exact: true }),
  ).toBeVisible();
});

test("a reverted approval receipt is monitored and returns to pending if its block disappears", async ({
  page,
}) => {
  await openApproval(page, "reset", 10000000n);
  const snapshot = await node.snapshot();
  await page
    .getByRole("button", { name: "Approve token", exact: true })
    .click();
  await expect(
    page.getByText("Approval reverted. Review the current state and retry.", {
      exact: true,
    }),
  ).toBeVisible();
  await node.revert({ id: snapshot });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("Approval pending/rechecking. Receipt unavailable.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Approval reverted. Review the current state and retry.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Approve token", exact: true }),
  ).toBeDisabled();
});

test("a settlement re-included as reverted between polls loses its false confirmation", async ({
  page,
}) => {
  const { payload, signed, deployment } = await tradeFixture();
  for (const [account, token, amount] of [
    [maker, signed.order.makerToken, signed.order.makerAmount],
    [taker, signed.order.takerToken, signed.order.takerAmount],
  ] as const) {
    await localClient.waitForTransactionReceipt({
      hash: await localWallet.writeContract({
        account,
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [deployment.address, amount],
      }),
    });
  }
  const snapshot = await node.snapshot();
  await installAnvilWallet(page, taker);
  await page.goto(`/trade#${payload}`);
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await page.getByRole("button", { name: "Accept trade", exact: true }).click();
  await expect(
    page.getByText("Settlement confirmed.", { exact: true }),
  ).toBeVisible();
  const original = z
    .string()
    .regex(/^Transaction: 0x[0-9a-f]{64}$/i)
    .parse(await page.getByText(/^Transaction: 0x/).textContent())
    .slice(13) as `0x${string}`;
  const transaction = await localClient.getTransaction({ hash: original });
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const request = z
      .object({ method: z.string() })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    if (request.method === "eth_getTransactionReceipt") await gate;
    await route.continue();
  });
  await node.revert({ id: snapshot });
  await localClient.waitForTransactionReceipt({
    hash: await localWallet.writeContract({
      address: deployment.address,
      abi: deployment.abi,
      functionName: "cancel",
      args: [signed.order],
    }),
  });
  const replayed = await localWallet.sendTransaction({
    account: taker,
    to: deployment.address,
    data: transaction.input,
    value: transaction.value,
    nonce: transaction.nonce,
    gas: transaction.gas,
    maxFeePerGas: transaction.maxFeePerGas,
    maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
  });
  expect(replayed).toBe(original);
  expect(
    (await localClient.waitForTransactionReceipt({ hash: replayed })).status,
  ).toBe("reverted");
  release();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("Settlement reverted. Review the current state and retry.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Settlement confirmed.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Order status: Cancelled", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(`/trade#${payload}`);
});

test("a reorg replacing an already scanned empty block still discovers the pending transaction's replacement", async ({
  page,
}) => {
  const token = await openApproval(page);
  const initialBaseFee = (await localClient.getBlock()).baseFeePerGas ?? 0n;
  const snapshot = await node.snapshot();
  const scanned = new Set<string>();
  let inspectedOriginal = false;
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const request = z
      .object({ method: z.string(), params: z.array(z.unknown()).default([]) })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    const response = await route.fetch();
    await route.fulfill({ response });
    if (request.method === "eth_blockNumber") {
      const result = z
        .object({ result: z.string() })
        .parse((await response.json()) as unknown);
      scanned.add(result.result);
    }
    if (request.method === "eth_getTransactionByHash") inspectedOriginal = true;
    if (
      request.method === "eth_getBlockByNumber" &&
      typeof request.params[0] === "string"
    )
      scanned.add(request.params[0]);
  });
  await node.setAutomine(false);
  try {
    await page
      .getByRole("button", { name: "Approve token", exact: true })
      .click();
    await expect.poll(() => inspectedOriginal).toBe(true);
    const original = z
      .string()
      .regex(/^Transaction: 0x[0-9a-f]{64}$/i)
      .parse(await page.getByText(/^Transaction: 0x/).textContent())
      .slice(13) as `0x${string}`;
    const transaction = await localClient.getTransaction({ hash: original });
    // An underpriced transaction stays pending while the search scans this block.
    await node.setNextBlockBaseFeePerGas({ baseFeePerGas: 1000000000000n });
    await node.mine({ blocks: 1 });
    const emptyBlock = await localClient.getBlock();
    expect(emptyBlock.transactions).not.toContain(original);
    await expect
      .poll(() => scanned.has(`0x${emptyBlock.number.toString(16)}`))
      .toBe(true);
    await node.revert({ id: snapshot });
    await node.setNextBlockBaseFeePerGas({ baseFeePerGas: initialBaseFee });
    await node.setAutomine(true);
    const replacement = await localWallet.sendTransaction({
      to: token,
      data: transaction.input,
      nonce: transaction.nonce,
      gas: transaction.gas,
      maxFeePerGas: (transaction.maxFeePerGas ?? transaction.gasPrice) * 2n,
      maxPriorityFeePerGas:
        (transaction.maxPriorityFeePerGas ?? 1000000000n) * 2n,
    });
    await localClient.waitForTransactionReceipt({ hash: replacement });
    await expandDetails(page, "Transaction details");
    await expect(
      page.getByText("Approval confirmed.", { exact: true }),
    ).toBeVisible();
    await expandDetails(page, "Transaction details");
    await expect(
      page.getByText(`Transaction: ${replacement}`, { exact: true }),
    ).toBeVisible();
  } finally {
    await node.setNextBlockBaseFeePerGas({ baseFeePerGas: initialBaseFee });
    await node.setAutomine(true);
    await node.mine({ blocks: 1 });
  }
});
