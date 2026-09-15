"use client";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
export default function ConnectWalletAction() {
  const { openConnectModal } = useConnectModal();
  return (
    <Button className="primary-action" onClick={openConnectModal}>
      Connect wallet
    </Button>
  );
}
