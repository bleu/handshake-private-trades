import { selectNetwork } from "./network-control";
import { expect, test } from "@playwright/test";

test("Handshake explains why an empty order cannot be reviewed", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", {
      name: "Fill all the inputs",
      exact: true,
    }),
  ).toBeDisabled();
});

test("Handshake shell and token dialog remain usable by keyboard on mobile and desktop", async ({
  page,
}, testInfo) => {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Handshake home" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link"),
    ).toHaveText(["Create", "Trade link", "History", "Help"]);
    const trigger = page.getByRole("button", {
      name: "Choose Send token",
      exact: true,
    });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Select token" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`create-${String(width)}.png`),
      fullPage: true,
    });
  }
});

test("maker can change a restricted draft to anyone with the link", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Specific wallet", exact: true })
    .click();
  await page
    .getByLabel("Counterparty address", { exact: true })
    .fill("0x1111111111111111111111111111111111111111");
  await page.reload();
  await expect(
    page.getByLabel("Counterparty address", { exact: true }),
  ).toHaveValue("0x1111111111111111111111111111111111111111");
  await page
    .getByRole("button", { name: "Anyone with the link", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByLabel("Counterparty address", { exact: true }),
  ).toHaveCount(0);
});

test("Specific wallet cannot silently create an unrestricted zero-address order", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Specific wallet", exact: true })
    .click();
  await page
    .getByLabel("Counterparty address", { exact: true })
    .fill("0x0000000000000000000000000000000000000000");
  await expect(
    page.getByRole("button", {
      name: "Fill all the inputs",
      exact: true,
    }),
  ).toBeDisabled();
});

test("token import opens an address-only form inside the token dialog", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Choose Send token", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Import token", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import token", exact: true }).click();
  await expect(page.getByLabel("Token address", { exact: true })).toBeVisible();
  const input = page.getByLabel("Token address", { exact: true });
  const submit = page.getByRole("button", {
    name: "Enter a nonzero token address.",
    exact: true,
  });
  expect((await submit.boundingBox())?.width).toBe(
    (await input.boundingBox())?.width,
  );

  await expect(
    page.getByRole("dialog", { name: "Import token" }).getByRole("textbox"),
  ).toHaveCount(1);
});

test("invalid import addresses explain the disabled action", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Choose Send token", exact: true })
    .click();
  await page.getByRole("button", { name: "Import token", exact: true }).click();
  await page.getByLabel("Token address", { exact: true }).fill("invalid");
  await expect(
    page.getByRole("button", {
      name: "Enter a nonzero token address.",
      exact: true,
    }),
  ).toBeDisabled();
});

test("token warnings expose exact identities by keyboard without overflowing the modal", async ({
  page,
}, testInfo) => {
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await selectNetwork(page, "31337");
    await page
      .getByRole("button", { name: "Choose Send token", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Import token", exact: true })
      .click();
    await page
      .getByLabel("Token address", { exact: true })
      .fill("0x5FbDB2315678afecb367f032d93F642f64180aa3");
    await page
      .getByRole("button", { name: "Import information", exact: true })
      .click();
    const warning = page
      .getByRole("dialog")
      .getByText("List membership unknown.", { exact: true });
    await warning.focus();
    await page.keyboard.press("Enter");
    await expect(
      page
        .getByRole("dialog")
        .getByText(/Fee-on-transfer tokens are unsupported/),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("dialog")
        .getByText("Verify the contract before trading.", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`token-warning-${String(width)}.png`),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Choose Send token", exact: true }),
    ).toBeFocused();
  }
});

test("trade-link entry is keyboard accessible on mobile and desktop", async ({
  page,
}, testInfo) => {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/trade");
    const trigger = page.getByRole("button", {
      name: "Paste trade link",
      exact: true,
    });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Open trade link" }),
    ).toBeVisible();
    await page
      .getByLabel("Paste trade link", { exact: true })
      .fill("not a link");
    await expect(
      page.getByRole("button", {
        name: "Enter a complete trade link.",
        exact: true,
      }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`trade-entry-${String(width)}.png`),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }
});

test("the first mobile tap opens tooltip help and moving focus dismisses it", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 375, height: 900 },
  });
  try {
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:3100/");
    await page
      .getByRole("button", { name: "About counterparties", exact: true })
      .tap();
    await expect(page.getByRole("tooltip")).toContainText(
      "Only the specified wallet",
    );
    await page.getByLabel("Send amount", { exact: true }).tap();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("CoW Swap tokens are available before connecting or configuring settlement", async ({
  page,
}, testInfo) => {
  const { readFile } = await import("node:fs/promises");
  const list: unknown = JSON.parse(
    await readFile(
      new URL("./fixtures/cow-swap-gnosis.json", import.meta.url),
      "utf8",
    ),
  );
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ json: list }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Choose Send token", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choose Send token", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("option")).toHaveCount(34);
  await expect(
    page.getByRole("dialog").getByRole("option", { name: /WXDAI/ }),
  ).toBeVisible();
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: testInfo.outputPath(`cow-token-list-${String(width)}.png`),
      fullPage: true,
    });
  }
});

test("choosing a readable listed token selects it immediately and closes the modal", async ({
  page,
}) => {
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({
      json: {
        name: "Local token list",
        timestamp: "2026-09-14T00:00:00Z",
        version: { major: 1, minor: 0, patch: 0 },
        tokens: [
          {
            chainId: 31337,
            address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
            symbol: "DEV6",
            name: "Development 6",
            decimals: 6,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await selectNetwork(page, "31337");
  const choose = page.getByRole("button", {
    name: "Choose Send token",
    exact: true,
  });
  await choose.click();
  await page.getByRole("dialog").getByRole("option", { name: /DEV6/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(choose).toContainText("DEV6");
});

test("saving an imported token returns to the list and allows direct selection", async ({
  page,
}) => {
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await selectNetwork(page, "31337");
  await page
    .getByRole("button", { name: "Choose Send token", exact: true })
    .click();
  await page.getByRole("button", { name: "Import token", exact: true }).click();
  await page
    .getByLabel("Token address", { exact: true })
    .fill("0x5FbDB2315678afecb367f032d93F642f64180aa3");
  await page
    .getByRole("button", { name: "Import information", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Select token", exact: true })
      .getByRole("option", { name: /DEV6/ }),
  ).toBeVisible();
  await page.getByRole("dialog").getByRole("option", { name: /DEV6/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Choose Send token", exact: true }),
  ).toContainText("DEV6");
});

test("keyboard token navigation skips an unreadable row and reaches the next usable token", async ({
  page,
}) => {
  const addresses = [
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333",
  ];
  await page.route("https://files.cow.fi/tokens/CowSwap.json", (route) =>
    route.fulfill({
      json: {
        name: "Navigation fixture",
        timestamp: "2026-09-14T00:00:00Z",
        version: { major: 1, minor: 0, patch: 0 },
        tokens: addresses.map((address, index) => ({
          address,
          chainId: 100,
          name: ["First", "Unreadable", "Last"][index],
          symbol: ["AAA", "BBB", "CCC"][index],
          decimals: 6,
        })),
      },
    }),
  );
  await page.route("https://rpc.gnosischain.com/**", (route) => {
    const request = JSON.parse(route.request().postData() ?? "{}") as {
      id: number;
      params?: { to?: string }[];
    };
    return route.fulfill({
      json: {
        jsonrpc: "2.0",
        id: request.id,
        ...(request.params?.[0]?.to === addresses[1]
          ? { error: { code: -32000, message: "Unreadable" } }
          : { result: "0x" + "6".padStart(64, "0") }),
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Choose Send token", exact: true })
    .click();
  const first = page.getByRole("option", { name: /AAA/ });
  const last = page.getByRole("option", { name: /CCC/ });
  await expect(first).toBeEnabled();
  await expect(page.getByRole("option", { name: /BBB/ })).toBeDisabled();
  await expect(last).toBeEnabled();
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await expect(last).toBeFocused();
});

test("disconnected History offers a local wallet connection action", async ({
  page,
}) => {
  await page.goto("/history");
  await page
    .getByRole("main")
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("the header keeps navigation between brand and wallet controls at prototype breakpoints", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(navigation).toBeVisible();
  const desktop = await navigation.boundingBox();
  expect(desktop?.x).toBeGreaterThan(450);
  expect(desktop?.x).toBeLessThan(600);
  await page.setViewportSize({ width: 375, height: 900 });
  const mobile = await navigation.boundingBox();
  const header = await page.getByRole("banner").boundingBox();
  expect((mobile?.y ?? 0) - (header?.y ?? 0)).toBeLessThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
});

test("the create form aligns amounts with consistent panel insets on both viewports", async ({
  page,
}) => {
  for (const [width, inset] of [
    [1280, 414],
    [375, 48],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const send = page.getByRole("textbox", {
      name: "Send amount",
      exact: true,
    });
    await expect(send).toBeVisible();
    const position = await send.boundingBox();
    expect(position?.x).toBe(inset);
    await expect(
      page.getByRole("heading", { name: "Who can accept?" }),
    ).toBeVisible();
    const receive = await page
      .getByRole("textbox", { name: "Receive amount", exact: true })
      .boundingBox();
    expect((receive?.y ?? 0) - (position?.y ?? 0)).toBeGreaterThan(170);
    expect((receive?.y ?? 0) - (position?.y ?? 0)).toBeLessThan(195);
  }
});

test("History keeps its compact search field and subdued selected filter", async ({
  page,
}) => {
  const { connectTokenWallet } = await import("./token-wallet");
  await connectTokenWallet(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/history");
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  const search = page.getByRole("textbox", {
    name: "Search orders",
    exact: true,
  });
  await expect(search).toBeVisible();
  expect((await search.boundingBox())?.width).toBe(330);
  await expect(
    page.getByRole("button", { name: "All 0", exact: true }),
  ).toHaveCSS("background-color", "rgb(34, 70, 91)");
});

test("connecting a wallet preserves the compact header height", async ({
  page,
}) => {
  const { installAnvilWallet } = await import("./anvil-wallet");
  await installAnvilWallet(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Connect Wallet", exact: true }),
  ).toHaveCount(0);
  expect((await page.getByRole("banner").boundingBox())?.height).toBe(97);
  await page.setViewportSize({ width: 375, height: 900 });
  const navigation = await page
    .getByRole("navigation", { name: "Main navigation" })
    .boundingBox();
  const header = await page.getByRole("banner").boundingBox();
  expect((navigation?.y ?? 0) - (header?.y ?? 0)).toBeLessThan(100);
});

test("an incomplete form uses one neutral prompt even when a counterparty is missing", async ({
  page,
}) => {
  await page.goto("/");
  const action = page.getByRole("button", {
    name: "Fill all the inputs",
    exact: true,
  });
  await expect(action).toBeDisabled();
  await page
    .getByRole("button", { name: "Specific wallet", exact: true })
    .click();
  await expect(action).toBeDisabled();
  await expect(action).toHaveCSS("background-color", "rgb(41, 56, 79)");
  await expect(
    page.getByText("Enter a nonzero counterparty address.", { exact: true }),
  ).toHaveCount(0);
});

test("network and token selectors use aligned text-sized chevrons and a chain icon", async ({
  page,
}) => {
  await page.goto("/");
  const network = page.getByRole("button", {
    name: "Chain Selector",
    exact: true,
  });
  await expect(network.getByRole("img", { name: "Gnosis logo" })).toBeVisible();
  for (const control of [
    network,
    page.getByRole("button", { name: "Choose Send token", exact: true }),
  ]) {
    const size = await control.evaluate((button) => {
      const arrow = button.querySelector("svg");
      return {
        text: parseFloat(getComputedStyle(button).fontSize),
        arrow: arrow?.getBoundingClientRect().height,
      };
    });
    expect(size.arrow).toBe(size.text);
  }
});
