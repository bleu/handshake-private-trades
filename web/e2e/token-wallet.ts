import type { Page } from "@playwright/test";

export async function connectTokenWallet(page: Page) {
  await page.addInitScript(() => {
    let connected = false;
    let chainId = "0x64";
    let account = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const listeners = new Map<string, Set<(value: unknown) => void>>();
    Object.defineProperty(window, "ethereum", {
      value: {
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
            return Promise.resolve([account]);
          }
          if (method === "eth_accounts")
            return Promise.resolve(connected ? [account] : []);
          if (method === "eth_chainId") return Promise.resolve(chainId);
          if (method === "wallet_switchEthereumChain") {
            chainId = params?.[0]?.chainId ?? chainId;
            for (const listener of listeners.get("chainChanged") ?? [])
              listener(chainId);
            return Promise.resolve(null);
          }
          if (method === "wallet_requestPermissions")
            return Promise.resolve([{ parentCapability: "eth_accounts" }]);
          if (method === "wallet_revokePermissions")
            return Promise.resolve(null);
          return Promise.reject(
            new Error("Unsupported test wallet method: " + method),
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
      },
    });
    window.addEventListener("test:token-network", () => {
      chainId = "0x7a69";
      for (const listener of listeners.get("chainChanged") ?? [])
        listener(chainId);
    });
    window.addEventListener("test:token-account", () => {
      account = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      for (const listener of listeners.get("accountsChanged") ?? [])
        listener([account]);
    });
  });
}
