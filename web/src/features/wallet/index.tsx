"use client";

import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { walletSettings } from "@/config/wallet";

export function WalletControls() {
  const { address } = useAccount();
  return (
    <div className="flex flex-col items-start gap-2">
      <ConnectButton showBalance={false} />
      {address && (
        <p className="max-w-full break-all text-xs">
          Connected account: {address}
        </p>
      )}
      {!walletSettings.projectId && (
        <p className="text-xs text-muted-foreground">
          WalletConnect is unavailable. Use a browser wallet.
        </p>
      )}
    </div>
  );
}
