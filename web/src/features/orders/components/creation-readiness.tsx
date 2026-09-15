"use client";
import { useTransactions } from "@/infrastructure/chain/transactions";
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
  const { plan, state, historyError, aggregateError } = useApprovalPlan({
    deployment,
    maker,
    token,
    amount,
    mode: "creation",
  });
  const { busy } = useTransactions();
  const missing =
    !ready ||
    plan.balanceSufficient === undefined ||
    plan.needsApproval === undefined;
  const blocker = busy
    ? undefined
    : state.balance.isError
      ? "Balance unavailable."
      : state.allowance.isError
        ? "Allowance unavailable."
        : plan.balanceSufficient === false
          ? "Insufficient balance for this order."
          : undefined;
  return (
    <div aria-label="Trade readiness" className="workflow-actions">
      {!busy && (
        <ApprovalCommitments
          plan={plan}
          decimals={decimals}
          historyError={historyError}
          compact
          aggregateError={aggregateError}
        />
      )}
      {(blocker || missing) && (
        <Button disabled className={blocker ? "action-error" : undefined}>
          {blocker ?? "Approve token"}
        </Button>
      )}
      <div hidden={!!blocker || missing}>
        <ApprovalAction
          deployment={deployment}
          maker={maker}
          token={token}
          amount={amount}
          decimals={decimals}
          plan={plan}
          ready={ready}
        />
        {plan.needsApproval === false && (
          <SignOrderAction
            deployment={deployment}
            maker={maker}
            draft={draft}
            revision={revision}
            decimals={{ maker: decimals, taker: takerDecimals }}
            ready={ready && plan.balanceSufficient === true}
          />
        )}
      </div>
    </div>
  );
}
