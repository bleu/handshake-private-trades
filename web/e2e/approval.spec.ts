import { expandDetails } from "./order-details";
import { openApproval } from "./approval-setup";
import { expect, test } from "@playwright/test";
import { erc20Abi, decodeFunctionData } from "viem";
import { z } from "zod";
import { localClient, maker, settlement } from "./local-token";

test("necessary approval sets the full target once, confirms allowance, and never automatically signs", async ({
  page,
}) => {
  const token = await openApproval(page, "ordinary", 10000000n);
  const approvals: bigint[] = [];
  let signatures = 0;
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const raw: unknown = JSON.parse(route.request().postData() ?? "null");
    const request = z
      .object({ method: z.string(), params: z.array(z.unknown()).default([]) })
      .parse(raw);
    if (request.method === "eth_sendTransaction") {
      const call = z
        .object({ to: z.string(), data: z.string() })
        .parse(request.params[0]);
      if (call.to.toLowerCase() === token.toLowerCase()) {
        const decoded = decodeFunctionData({
          abi: erc20Abi,
          data: call.data as `0x${string}`,
        });
        if (decoded.functionName === "approve") approvals.push(decoded.args[1]);
      }
    }
    if (request.method === "eth_signTypedData_v4") signatures++;
    await route.continue();
  });
  await expect(
    page.getByRole("switch", { name: "Max approval", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Approve token", exact: true })
    .click();
  await expect(
    page.getByText("Approval confirmed.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign order", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve token", exact: true }),
  ).toHaveCount(0);
  expect(approvals).toEqual([50000000n]);
  expect(signatures).toBe(0);
  expect(
    await localClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [maker, settlement],
    }),
  ).toBe(50000000n);
});

test("wallet rejection preserves the maximum choice and restores controls for an explicit retry", async ({
  page,
}) => {
  await openApproval(page);
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const raw: unknown = JSON.parse(route.request().postData() ?? "null");
    const request = z.object({ id: z.number(), method: z.string() }).parse(raw);
    if (request.method === "eth_sendTransaction")
      await route.fulfill({
        json: {
          jsonrpc: "2.0",
          id: request.id,
          error: { code: 4001, message: "Rejected" },
        },
      });
    else await route.continue();
  });
  await page.getByRole("switch", { name: "Max approval", exact: true }).check();
  await page
    .getByRole("button", { name: "Approve token", exact: true })
    .click();
  await expect(page.getByText(/Approval failed or was rejected/)).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Max approval", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Approve token", exact: true }),
  ).toBeEnabled();
});

test("a token rejecting direct nonzero approval receives no zero-reset fallback", async ({
  page,
}) => {
  const token = await openApproval(page, "reset", 10000000n);
  const approvals: bigint[] = [];
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const raw: unknown = JSON.parse(route.request().postData() ?? "null");
    const request = z
      .object({ method: z.string(), params: z.array(z.unknown()).default([]) })
      .parse(raw);
    if (request.method === "eth_sendTransaction") {
      const call = z
        .object({ to: z.string(), data: z.string() })
        .parse(request.params[0]);
      if (call.to.toLowerCase() === token.toLowerCase()) {
        const decoded = decodeFunctionData({
          abi: erc20Abi,
          data: call.data as `0x${string}`,
        });
        if (decoded.functionName === "approve") approvals.push(decoded.args[1]);
      }
    }
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Approve token", exact: true })
    .click();
  await expect(
    page.getByText(/Approval failed or was rejected|Approval reverted/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve token", exact: true }),
  ).toBeEnabled();
  expect(approvals).toEqual([50000000n]);
  expect(
    await localClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [maker, settlement],
    }),
  ).toBe(10000000n);
});

test("maximum approval shows awaiting-wallet and pending states, disables duplicates, and confirms uint256 max", async ({
  page,
}) => {
  const token = await openApproval(page);
  let releaseWallet = () => {};
  const walletGate = new Promise<void>((resolve) => {
    releaseWallet = resolve;
  });
  let releaseReceipt = () => {};
  const receiptGate = new Promise<void>((resolve) => {
    releaseReceipt = resolve;
  });
  let sends = 0;
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const raw: unknown = JSON.parse(route.request().postData() ?? "null");
    const request = z.object({ id: z.number(), method: z.string() }).parse(raw);
    if (request.method === "eth_sendTransaction") {
      sends++;
      await walletGate;
    }
    if (request.method === "eth_getTransactionReceipt") await receiptGate;
    await route.continue();
  });
  await page.getByRole("switch", { name: "Max approval", exact: true }).check();
  await page
    .getByRole("button", { name: "Approve token", exact: true })
    .click();
  await expect(
    page.getByText("Awaiting wallet: approval.", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .locator('[role="alert"]:visible, .action-error:visible'),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Approve token", exact: true }),
  ).toBeDisabled();
  releaseWallet();
  await expandDetails(page, "Transaction details");
  await expect(
    page.getByText("Approval pending.", { exact: true }),
  ).toBeVisible();
  await expandDetails(page, "Transaction details");
  await expect(page.getByText(/Transaction: 0x/)).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .locator('[role="alert"]:visible, .action-error:visible'),
  ).toHaveCount(0);
  releaseReceipt();
  await expect(
    page.getByText("Approval confirmed.", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  expect(sends).toBe(1);
  expect(
    await localClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [maker, settlement],
    }),
  ).toBe((1n << 256n) - 1n);
});

test("a successful receipt does not claim readiness when allowance reads remain insufficient", async ({
  page,
}) => {
  const token = await openApproval(page);
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const raw: unknown = JSON.parse(route.request().postData() ?? "null");
    const request = z
      .object({
        id: z.number(),
        method: z.string(),
        params: z.array(z.unknown()).default([]),
      })
      .parse(raw);
    const call = z
      .object({ to: z.string(), data: z.string() })
      .safeParse(request.params[0]);
    if (
      request.method === "eth_call" &&
      call.success &&
      call.data.to.toLowerCase() === token.toLowerCase() &&
      call.data.data.startsWith("0xdd62ed3e")
    )
      await route.fulfill({
        json: { jsonrpc: "2.0", id: request.id, result: "0x" + "0".repeat(64) },
      });
    else await route.continue();
  });
  await page
    .getByRole("button", { name: "Approve token", exact: true })
    .click();
  await expect(
    page.getByText(/Approval confirmed, but allowance is still insufficient/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign order", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Approve token", exact: true }),
  ).toBeEnabled();
});

test("a balance drop during review explains the disabled signing action", async ({
  page,
}) => {
  const token = await openApproval(page, "ordinary", 50000000n);
  await expect(
    page.getByRole("button", { name: "Sign order", exact: true }),
  ).toBeEnabled();
  await page.route("http://127.0.0.1:8545/", async (route) => {
    const request = z
      .object({
        id: z.number(),
        method: z.string(),
        params: z.array(z.unknown()).default([]),
      })
      .parse(JSON.parse(route.request().postData() ?? "null") as unknown);
    const call = z
      .object({ to: z.string(), data: z.string() })
      .safeParse(request.params[0]);
    if (
      request.method === "eth_call" &&
      call.success &&
      call.data.to.toLowerCase() === token.toLowerCase() &&
      call.data.data.startsWith("0x70a08231")
    )
      await route.fulfill({
        json: { jsonrpc: "2.0", id: request.id, result: "0x" + "0".repeat(64) },
      });
    else await route.continue();
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("button", {
      name: "Insufficient balance for this order.",
      exact: true,
    }),
  ).toBeDisabled();
});

test("the pre-sign review omits technical order and approval disclosures", async ({
  page,
}, testInfo) => {
  await openApproval(page);
  await expect(
    page.getByRole("heading", { name: "Review order", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator("summary")
      .filter({ hasText: /^(Order details|Approval details)$/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Approve token", exact: true }),
  ).toBeEnabled();
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: testInfo.outputPath(`approval-switch-off-${String(width)}.png`),
      fullPage: true,
    });
    const toggle = page.getByRole("switch", {
      name: "Max approval",
      exact: true,
    });
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toBeChecked();
    await expect(toggle).toHaveCSS("background-color", "rgb(32, 197, 217)");
    await page.screenshot({
      path: testInfo.outputPath(`approval-switch-on-${String(width)}.png`),
      fullPage: true,
    });
    await toggle.uncheck();
    await expect(toggle).toHaveCSS("background-color", "rgb(17, 29, 48)");
  }
});
