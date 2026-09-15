"use client";
import { useId, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import type { Address } from "viem";
import type { Deployment } from "@/config/deployments";
import { Button } from "@/components/ui/button";
import {
  formatAmount,
  type approvalPlan,
  type ApprovalInput,
  type KnownOrder,
} from "@/domain/orders";
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
  const descriptionId = useId();
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
    <fieldset className="approval-choice" disabled={busy || !ready}>
      <label className="approval-toggle">
        <span>Max approval</span>
        <input
          type="checkbox"
          role="switch"
          checked={choice === "maximum"}
          aria-describedby={descriptionId}
          onChange={(event) => {
            setChoice(event.target.checked ? "maximum" : "necessary");
          }}
        />
      </label>
      <p id={descriptionId} className="approval-description">
        {choice === "maximum"
          ? "Allow unlimited spending of this token."
          : plan.exactTarget !== undefined
            ? `Allow spending up to ${formatAmount(plan.exactTarget, decimals)} tokens.`
            : "Necessary approval unavailable."}
      </p>
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
