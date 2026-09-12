import type { Page } from "@playwright/test";

export async function installAnvilWallet(page: Page) {
  await page.addInitScript(() => {
    let connected = false;
    let account = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const listeners = new Map<string, Set<(value: unknown) => void>>();
    window.addEventListener("test:anvil-account", (event) => {
      const value: unknown =
        event instanceof CustomEvent ? event.detail : undefined;
      if (typeof value !== "string") return;
      account = value;
      for (const listener of listeners.get("accountsChanged") ?? [])
        listener([account]);
    });
    Object.defineProperty(window, "ethereum", {
      value: {
        isMetaMask: true,
        request: async ({
          method,
          params = [],
        }: {
          method: string;
          params?: unknown[];
        }) => {
          if (method === "eth_requestAccounts") {
            connected = true;
            return [account];
          }
          if (method === "eth_accounts") return connected ? [account] : [];
          if (method === "eth_chainId") return "0x7a69";
          if (method === "wallet_requestPermissions")
            return [{ parentCapability: "eth_accounts" }];
          if (method === "wallet_revokePermissions") return null;
          const response = await fetch("http://127.0.0.1:8545", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          });
          const result: unknown = await response.json();
          if (typeof result !== "object" || result === null)
            throw new Error("Invalid wallet RPC response");
          if ("error" in result)
            throw new Error("Wallet RPC rejected the request");
          return "result" in result ? result.result : undefined;
        },
        on: (event: string, listener: (value: unknown) => void) => {
          const group = listeners.get(event) ?? new Set();
          group.add(listener);
          listeners.set(event, group);
        },
        removeListener: (event: string, listener: (value: unknown) => void) => {
          listeners.get(event)?.delete(listener);
        },
      },
    });
  });
}
