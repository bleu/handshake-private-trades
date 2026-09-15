import { expect, test } from "@playwright/test";
import { z } from "zod";
import { connectTokenWallet } from "./token-wallet";
const rpcRequest = z.object({
  id: z.union([z.number(), z.string()]),
  method: z.string(),
  params: z.array(z.unknown()).optional(),
});

test.beforeEach(async ({ page }) => {
  await page.route("https://rpc.gnosischain.com/**", (route) => route.abort());
});

const token = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const list = {
  name: "CoW Swap",
  timestamp: "2026-09-11T00:00:00Z",
  version: { major: 1, minor: 0, patch: 0 },
  tokens: [
    {
      chainId: 100,
      address: token,
      symbol: "SIX",
      name: "Six Decimal Token",
      decimals: 18,
    },
    {
      chainId: 1,
      address: other,
      symbol: "OTHER",
      name: "Other chain token",
      decimals: 18,
    },
  ],
};

test("token discovery filters the CoW list by network and keeps addresses inspectable", async ({
  page,
}) => {
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ json: list }),
  );
  await page.goto("/tokens");
  await expect(page.getByLabel("Token", { exact: true })).toBeVisible();
  await expect(
    page
      .getByLabel("Token", { exact: true })
      .getByRole("option", { name: /SIX/ }),
  ).toHaveCount(1);
  await expect(
    page
      .getByLabel("Token", { exact: true })
      .getByRole("option", { name: /OTHER/ }),
  ).toHaveCount(0);
  await page
    .getByLabel("Token", { exact: true })
    .getByRole("option", { name: new RegExp(token, "i") })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Token details" })
      .getByText(token, { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Token details" })
      .getByText("Six Decimal Token", { exact: true }),
  ).toBeVisible();
});

test("selection uses fresh onchain decimals instead of the list's claimed precision", async ({
  page,
}) => {
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ json: list }),
  );
  await page.route("https://rpc.gnosischain.com/**", async (route) => {
    const request = rpcRequest.parse(route.request().postDataJSON());
    await route.fulfill({
      json: {
        jsonrpc: "2.0",
        id: request.id,
        result: "0x" + "6".padStart(64, "0"),
      },
    });
  });
  await page.goto("/tokens");
  await page
    .getByLabel("Token", { exact: true })
    .getByRole("option", { name: new RegExp(token, "i") })
    .click();
  await expect(
    page.getByText("Decimals (onchain): 6", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use token" }).click();
  await expect(
    page.getByText("Selected SIX on Gnosis", { exact: true }),
  ).toBeVisible();
});

test("unreadable decimals block selection until a fresh read succeeds, including zero decimals", async ({
  page,
}) => {
  let unavailable = true;
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ json: list }),
  );
  await page.route("https://rpc.gnosischain.com/**", async (route) => {
    const request = rpcRequest.parse(route.request().postDataJSON());
    await route.fulfill({
      json: {
        jsonrpc: "2.0",
        id: request.id,
        ...(unavailable
          ? { error: { code: -32000, message: "Decimals unavailable" } }
          : { result: "0x" + "0".repeat(64) }),
      },
    });
  });
  await page.goto("/tokens");
  await page
    .getByLabel("Token", { exact: true })
    .getByRole("option", { name: new RegExp(token, "i") })
    .click();
  await expect(
    page.getByText("Decimals unavailable. This token cannot be used.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Use token" })).toBeDisabled();
  unavailable = false;
  await page.getByRole("button", { name: "Refresh token data" }).click();
  await expect(
    page.getByText("Decimals (onchain): 0", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Use token" })).toBeEnabled();
});

test("balances and allowances use exact onchain scaling and refresh for the connected account", async ({
  page,
}) => {
  await connectTokenWallet(page);
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ json: list }),
  );
  const observedSpenders: string[] = [];
  await page.route("https://rpc.gnosischain.com/**", async (route) => {
    const request = rpcRequest.parse(route.request().postDataJSON());
    let result = "0x0";
    if (request.method === "eth_call") {
      const call = z
        .object({ to: z.string(), data: z.string() })
        .parse(request.params?.[0]);
      const ownerIsMaker = call.data
        .toLowerCase()
        .includes("f39fd6e51aad88f6f4ce6ab8827279cfffb92266");
      if (call.data.startsWith("0xdd62ed3e"))
        observedSpenders.push(call.data.slice(-40));
      result =
        "0x" +
        (call.data.startsWith("0x313ce567")
          ? 6n
          : call.data.startsWith("0x70a08231")
            ? ownerIsMaker
              ? 1234567n
              : 9000001n
            : 2500000n
        )
          .toString(16)
          .padStart(64, "0");
    }
    await route.fulfill({ json: { jsonrpc: "2.0", id: request.id, result } });
  });
  await page.goto("/tokens");
  await page.getByRole("button", { name: "Connect Wallet" }).click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await page
    .getByLabel("Token", { exact: true })
    .getByRole("option", { name: new RegExp(token, "i") })
    .click();
  await expect(
    page.getByText("Balance: 1.234567 SIX", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Allowance: 2.5 SIX", { exact: true }),
  ).toBeVisible();
  expect(observedSpenders).toContain(
    "0000000000000000000000000000000000001000",
  );
  await page.evaluate(() =>
    window.dispatchEvent(new Event("test:token-account")),
  );
  await expect(
    page.getByText("Balance: 9.000001 SIX", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Balance: 1.234567 SIX", { exact: true }),
  ).toHaveCount(0);
});

test("list failures distinguish unavailable membership from an explicitly stale cached list", async ({
  page,
}) => {
  let healthy = false;
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    healthy
      ? route.fulfill({ json: list })
      : route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.goto("/tokens");
  await expect(
    page.getByText("Token list unavailable. Membership is unknown.", {
      exact: true,
    }),
  ).toBeVisible();
  healthy = true;
  await page.getByRole("button", { name: "Refresh token list" }).click();
  await expect(
    page
      .getByLabel("Token", { exact: true })
      .getByRole("option", { name: /SIX/ }),
  ).toHaveCount(1);
  healthy = false;
  await page.getByRole("button", { name: "Refresh token list" }).click();
  await expect(
    page.getByText(
      "Token list unavailable. Showing a stale list; membership is unverified.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page
      .getByLabel("Token", { exact: true })
      .getByRole("option", { name: /SIX/ }),
  ).toHaveCount(1);
});

test("listed logos are shown and missing metadata or broken logos use address fallbacks", async ({
  page,
}) => {
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({
      json: {
        ...list,
        tokens: [
          { ...list.tokens[0], logoURI: "https://files.cow.fi/images/six.png" },
          {
            chainId: 100,
            address: other,
            decimals: 18,
            name: "",
            symbol: "",
            logoURI: "https://files.cow.fi/images/missing.png",
          },
        ],
      },
    }),
  );
  await page.route("https://files.cow.fi/images/six.png", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.route("https://files.cow.fi/images/missing.png", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.goto("/tokens");
  await page
    .getByLabel("Token", { exact: true })
    .getByRole("option", { name: new RegExp(token, "i") })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Token details" })
      .getByRole("img", { name: "SIX logo", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Token", { exact: true })
    .getByRole("option", { name: new RegExp(other, "i") })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Token details" })
      .getByText(other, { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Token details" })
      .getByText("0x2222…2222", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Token details" })
      .getByRole("img", { name: "Token logo unavailable", exact: true }),
  ).toBeVisible();
});

test("network selection scopes the list and reads real Anvil token state independently of wallet network", async ({
  page,
}) => {
  const localToken = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  await connectTokenWallet(page);
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({
      json: {
        ...list,
        tokens: [
          ...list.tokens,
          {
            chainId: 31337,
            address: localToken,
            decimals: 18,
            symbol: "DEV6",
            name: "Development token",
          },
        ],
      },
    }),
  );
  await page.goto("/tokens");
  await page.getByRole("button", { name: "Connect Wallet" }).click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await page.getByLabel("Token network", { exact: true }).selectOption("31337");
  await expect(
    page
      .getByLabel("Token", { exact: true })
      .getByRole("option", { name: /SIX/ }),
  ).toHaveCount(0);
  await page
    .getByLabel("Token", { exact: true })
    .getByRole("option", { name: new RegExp(localToken, "i") })
    .click();
  await expect(
    page.getByText("Decimals (onchain): 6", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Balance: 1000000 DEV6", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Allowance: 0 DEV6", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use token" }).click();
  await expect(
    page.getByText("Selected DEV6 on Anvil", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Token network", { exact: true }).selectOption("100");
  await expect(
    page.getByText("Selected DEV6 on Anvil", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Balance: 1000000 DEV6", { exact: true }),
  ).toHaveCount(0);
});

test("a malformed list never supplies token options", async ({ page }) => {
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({
      json: {
        ...list,
        tokens: [{ ...list.tokens[0], address: "not-an-address" }],
      },
    }),
  );
  await page.goto("/tokens");
  await expect(
    page.getByText("Token list unavailable. Membership is unknown.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Token", { exact: true }).getByRole("option"),
  ).toHaveCount(0);
});

test("failed decimal revalidation does not reuse previously successful scaling", async ({
  page,
}) => {
  let healthy = true;
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ json: list }),
  );
  await page.route("https://rpc.gnosischain.com/**", async (route) => {
    const request = rpcRequest.parse(route.request().postDataJSON());
    await route.fulfill({
      json: {
        jsonrpc: "2.0",
        id: request.id,
        ...(healthy
          ? { result: "0x" + "6".padStart(64, "0") }
          : { error: { code: -32000, message: "Read failed" } }),
      },
    });
  });
  await page.goto("/tokens");
  await page
    .getByLabel("Token", { exact: true })
    .getByRole("option", { name: new RegExp(token, "i") })
    .click();
  await expect(page.getByRole("button", { name: "Use token" })).toBeEnabled();
  healthy = false;
  await page.getByRole("button", { name: "Refresh token data" }).click();
  await expect(
    page.getByText("Decimals unavailable. This token cannot be used.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Use token" })).toBeDisabled();
  await expect(
    page.getByText("Decimals (onchain): 6", { exact: true }),
  ).toHaveCount(0);
});

test("the official list's offset timestamp is accepted", async ({ page }) => {
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({
      json: { ...list, timestamp: "2026-07-29T18:00:00+00:00" },
    }),
  );
  await page.goto("/tokens");
  await expect(
    page
      .getByLabel("Token", { exact: true })
      .getByRole("option", { name: /SIX/ }),
  ).toHaveCount(1);
});

test("out-of-range decimals returned by a token are unusable", async ({
  page,
}) => {
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ json: list }),
  );
  await page.route("https://rpc.gnosischain.com/**", async (route) => {
    const request = rpcRequest.parse(route.request().postDataJSON());
    await route.fulfill({
      json: {
        jsonrpc: "2.0",
        id: request.id,
        result: "0x" + "100".padStart(64, "0"),
      },
    });
  });
  await page.goto("/tokens");
  await page
    .getByLabel("Token", { exact: true })
    .getByRole("option", { name: new RegExp(token, "i") })
    .click();
  await expect(
    page.getByText("Decimals unavailable. This token cannot be used.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Use token" })).toBeDisabled();
});

test("token search narrows the available network tokens by symbol and address", async ({
  page,
}) => {
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ json: list }),
  );
  await page.goto("/tokens");
  await expect(page.getByLabel("Search tokens", { exact: true })).toBeVisible();
  await page.getByLabel("Search tokens", { exact: true }).fill("missing");
  await expect(
    page.getByLabel("Token", { exact: true }).getByRole("option"),
  ).toHaveCount(0);
  await page.getByLabel("Search tokens", { exact: true }).fill("six");
  await expect(
    page
      .getByLabel("Token", { exact: true })
      .getByRole("option", { name: /SIX/ }),
  ).toHaveCount(1);
});

test("an outside-whitelist warning links to the full contract on its own network", async ({
  page,
}) => {
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ json: { ...list, tokens: [] } }),
  );
  await page.goto("/tokens");
  if (!(await page.getByLabel("Token address", { exact: true }).isVisible()))
    await page
      .getByRole("button", { name: "Import token", exact: true })
      .click();
  await page.getByLabel("Token address", { exact: true }).fill(token);
  await page
    .getByRole("button", { name: "Import information", exact: true })
    .click();
  await page.getByText("Outside whitelist", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: token, exact: true }),
  ).toHaveAttribute("href", `https://gnosisscan.io/address/${token}`);
});
