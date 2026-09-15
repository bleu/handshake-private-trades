import { expect, test } from "@playwright/test";

test("a visitor can navigate the three screens and open wallet connection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Create an order" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Trade link" }).click();
  await expect(
    page.getByRole("heading", { name: "Review trade", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "History" }).click();
  await expect(
    page.getByRole("heading", { name: "History", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connect Wallet" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("a browser wallet can connect, switch supported networks, change account, and disconnect", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let accounts = ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"];
    let chainId = "0x1";
    let connected = false;
    const listeners = new Map<string, Set<(value: unknown) => void>>();
    const emit = (event: string, value: unknown) => {
      for (const listener of listeners.get(event) ?? []) listener(value);
    };
    const provider = {
      isMetaMask: true,
      request: ({
        method,
        params,
      }: {
        method: string;
        params?: { chainId: string }[];
      }) => {
        if (method === "eth_requestAccounts") {
          connected = true;
          return Promise.resolve(accounts);
        }
        if (method === "eth_accounts")
          return Promise.resolve(connected ? accounts : []);
        if (method === "eth_chainId") return Promise.resolve(chainId);
        if (method === "wallet_switchEthereumChain") {
          chainId = params?.[0]?.chainId ?? chainId;
          emit("chainChanged", chainId);
          return Promise.resolve(null);
        }
        if (method === "wallet_requestPermissions")
          return Promise.resolve([{ parentCapability: "eth_accounts" }]);
        if (method === "wallet_revokePermissions") return Promise.resolve(null);
        return Promise.reject(
          new Error(`Unsupported test wallet request: ${method}`),
        );
      },
      on: (event: string, listener: (value: unknown) => void) => {
        const group = listeners.get(event) ?? new Set();
        group.add(listener);
        listeners.set(event, group);
      },
      removeListener: (event: string, listener: (value: unknown) => void) => {
        listeners.get(event)?.delete(listener);
      },
    };
    Object.defineProperty(window, "ethereum", { value: provider });
    window.addEventListener("test:wallet-chain", () => {
      chainId = "0x1";
      emit("chainChanged", chainId);
    });
    window.addEventListener("test:wallet-account", () => {
      accounts = ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8"];
      emit("accountsChanged", accounts);
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Connect Wallet" }).click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Chain Selector" }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("test:wallet-chain")),
  );
  await expect(page.getByText("Wrong network", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Chain Selector" }).click();
  await page.getByRole("button", { name: /Gnosis/ }).click();
  await expect(page.getByRole("button", { name: /0xf3/i })).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("test:wallet-account")),
  );
  await expect(page.getByRole("button", { name: /0x70/i })).toBeVisible();
  await page.getByRole("button", { name: /0x70/ }).click();
  await page.getByRole("button", { name: /Disconnect/ }).click();
  await expect(
    page.getByRole("button", { name: "Connect Wallet" }),
  ).toBeVisible();
});

test("the connected header shows the wallet control without a second account paragraph", async ({
  page,
}) => {
  const { installAnvilWallet } = await import("./anvil-wallet");
  await installAnvilWallet(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await expect(page.getByRole("button", { name: /0xf3/i })).toBeVisible();
  await expect(page.getByText(/^Connected account:/)).toHaveCount(0);
});

test("one header chain control drives the Create token network", async ({
  page,
}) => {
  const { installAnvilWallet } = await import("./anvil-wallet");
  await installAnvilWallet(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: /MetaMask|Browser Wallet|Injected/ })
    .click();
  await expect(page.getByRole("banner").getByRole("combobox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Chain Selector", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Chain Selector", exact: true })
    .click();
  await page.getByRole("button", { name: /Gnosis/ }).click();
  await page
    .getByRole("button", { name: "Choose Send token", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Select token", exact: true }),
  ).toBeVisible();
});
