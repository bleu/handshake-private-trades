"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  connectorsForWallets,
  darkTheme,
  RainbowKitProvider,
} from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, createStorage, http, WagmiProvider } from "wagmi";
import { anvil, gnosis } from "wagmi/chains";
import type { Chain } from "viem";
import { TransactionProvider } from "@/infrastructure/chain/transactions";
import { TransactionFeedback } from "@/features/orders/components/transaction-feedback";
import { WalletReadRefresh } from "@/infrastructure/chain/wallet-read-refresh";
import { walletCache } from "@/infrastructure/chain/wallet-cache";
import { walletSettings } from "@/config/wallet";

const chains: readonly [Chain, ...Chain[]] = walletSettings.enableAnvil
  ? [gnosis, anvil]
  : [gnosis];

const config = createConfig({
  storage: createStorage({ storage: walletCache }),
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
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#20c5d9",
            accentColorForeground: "#04232b",
            borderRadius: "large",
          })}
        >
          <WalletReadRefresh />
          <TransactionProvider>
            <TransactionFeedback />
            {children}
          </TransactionProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
