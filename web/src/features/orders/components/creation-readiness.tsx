"use client";
import type { Address } from "viem";
import { Button } from "@/components/ui/button";
import type { Deployment } from "@/config/deployments";
import { SignOrderAction } from "./sign-order-action";
import type { CreationDraft } from "@/domain/orders";
import { ApprovalCommitments } from "./approval-commitments";
import { ApprovalAction } from "./approval-action";
import { useApprovalPlan } from "../hooks/use-approval-plan";

export function CreationReadiness({
  deployment,
  maker,
  token,
  amount,
  decimals,
  ready,
  draft,
  revision,
  takerDecimals,
}: {
  deployment: Deployment;
  maker: Address;
  token: Address;
  amount: bigint;
  decimals: number;
  ready: boolean;
  draft: CreationDraft;
  revision: string | undefined;
  takerDecimals: number;
}) {
  const { plan, refresh, historyError } = useApprovalPlan({
    deployment,
    maker,
    token,
    amount,
    mode: "creation",
  });
  return (
    <section aria-label="Trade readiness" className="space-y-2">
      <p>
        {plan.balanceSufficient === undefined
          ? "Balance unavailable."
          : plan.balanceSufficient
            ? "Individual balance is sufficient."
            : "Insufficient balance for this order."}
      </p>
      <ApprovalCommitments
        plan={plan}
        decimals={decimals}
        historyError={historyError}
      />
      <p>
        {plan.needsApproval === undefined
          ? "Allowance readiness unavailable."
          : plan.needsApproval
            ? "Approval is required."
            : "Allowance is sufficient."}
      </p>
      <ApprovalAction
        deployment={deployment}
        maker={maker}
        token={token}
        amount={amount}
        decimals={decimals}
        plan={plan}
        ready={ready}
      />
      <SignOrderAction
        deployment={deployment}
        maker={maker}
        draft={draft}
        revision={revision}
        decimals={{ maker: decimals, taker: takerDecimals }}
        ready={
          ready &&
          plan.balanceSufficient === true &&
          plan.needsApproval === false
        }
      />
      <Button
        onClick={() => {
          void refresh();
        }}
      >
        Refresh readiness
      </Button>
    </section>
  );
}
