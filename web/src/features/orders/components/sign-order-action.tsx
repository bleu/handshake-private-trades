"use client";
import { useAccount, useSwitchChain } from "wagmi";
import type { Address } from "viem";
import { Button } from "@/components/ui/button";
import type { CreationDraft } from "@/domain/orders";
import type { Deployment } from "@/config/deployments";
import { useSignOrder } from "../hooks/use-sign-order";

export function SignOrderAction({
  deployment,
  maker,
  draft,
  revision,
  decimals,
  ready,
}: {
  deployment: Deployment;
  maker: Address;
  draft: CreationDraft;
  revision: string | undefined;
  decimals: { maker: number; taker: number };
  ready: boolean;
}) {
  const { chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { sign, busy } = useSignOrder({
    deployment,
    maker,
    draft,
    revision,
    decimals,
  });
  if (chainId !== deployment.chainId)
    return (
      <Button
        disabled={busy}
        onClick={() => {
          switchChain({ chainId: deployment.chainId });
        }}
      >
        Switch network to sign
      </Button>
    );
  return (
    <Button
      disabled={!ready || busy}
      onClick={() => {
        void sign();
      }}
    >
      Sign order
    </Button>
  );
}
