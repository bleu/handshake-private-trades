"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  connectorsForWallets,
  RainbowKitProvider,
} from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, http, WagmiProvider } from "wagmi";
import { anvil, gnosis } from "wagmi/chains";
import type { Chain } from "viem";
import { WalletReadRefresh } from "@/infrastructure/chain/wallet-read-refresh";
import { walletSettings } from "@/config/wallet";

const chains: readonly [Chain, ...Chain[]] = walletSettings.enableAnvil
  ? [gnosis, anvil]
  : [gnosis];

const config = createConfig({
  chains,
  // Fresh Anvil deployments have no Multicall3 contract.
  batch: { multicall: false },
  connectors: connectorsForWallets(
    [
      {
        groupName: "Connect a wallet",
        wallets: walletSettings.projectId
          ? [injectedWallet, walletConnectWallet]
          : [injectedWallet],
      },
    ],
    { appName: "Private Trade Links", projectId: walletSettings.projectId },
  ),
  transports: {
    [gnosis.id]: http(walletSettings.gnosisRpc),
    ...(walletSettings.enableAnvil
      ? { [anvil.id]: http("http://127.0.0.1:8545") }
      : {}),
  },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <WalletReadRefresh />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
