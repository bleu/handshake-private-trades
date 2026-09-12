"use client";
import { useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import type { Address } from "viem";
import type { Deployment } from "@/config/deployments";
import { Button } from "@/components/ui/button";
import type { approvalPlan, ApprovalInput, KnownOrder } from "@/domain/orders";
import {
  useApproveToken,
  type ApprovalChoice,
} from "../hooks/use-approve-token";

export function ApprovalAction({
  deployment,
  maker,
  token,
  amount,
  decimals,
  plan,
  mode = "creation",
  viewed,
  ready = true,
}: {
  deployment: Deployment;
  maker: Address;
  token: Address;
  amount: bigint;
  decimals: number;
  plan: ReturnType<typeof approvalPlan>;
  mode?: ApprovalInput["mode"];
  viewed?: KnownOrder;
  ready?: boolean;
}) {
  const [choice, setChoice] = useState<ApprovalChoice>("necessary");
  const { chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { approve, busy } = useApproveToken({
    deployment,
    maker,
    token,
    amount,
    decimals,
    mode,
    ...(viewed ? { viewed } : {}),
  });
  if (plan.needsApproval === false) return null;
  if (chainId !== deployment.chainId)
    return (
      <Button
        onClick={() => {
          switchChain({ chainId: deployment.chainId });
        }}
      >
        Switch network to approve
      </Button>
    );
  return (
    <fieldset className="space-y-2" disabled={busy || !ready}>
      <legend>Approval amount</legend>
      <label className="block">
        <input
          type="radio"
          name="approval"
          checked={choice === "necessary"}
          onChange={() => {
            setChoice("necessary");
          }}
          disabled={plan.exactTarget === undefined}
        />{" "}
        Approve just necessary
      </label>
      <label className="block">
        <input
          type="radio"
          name="approval"
          checked={choice === "maximum"}
          onChange={() => {
            setChoice("maximum");
          }}
        />{" "}
        Maximum approval
      </label>
      <Button
        disabled={
          plan.balanceSufficient !== true ||
          plan.needsApproval === undefined ||
          (choice === "necessary" && plan.exactTarget === undefined)
        }
        onClick={() => {
          void approve(choice);
        }}
      >
        Approve token
      </Button>
    </fieldset>
  );
}
