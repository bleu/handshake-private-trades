"use client";
import type { Address } from "viem";
import { Button } from "@/components/ui/button";
import type { Deployment } from "@/config/deployments";
import { SignOrderAction } from "./sign-order-action";
import { formatAmount, type CreationDraft } from "@/domain/orders";
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
      {plan.aggregateWarning && (
        <p role="note">
          Balance does not cover all known open orders. Funds are not reserved.
        </p>
      )}
      <p>
        Orders missing from this browser&apos;s history are not included in
        aggregate commitments.
      </p>
      {historyError && <p role="alert">{historyError}</p>}
      {plan.aggregateUnavailable && (
        <p role="alert">
          Aggregate status unavailable. The necessary allowance cannot be
          calculated.
        </p>
      )}
      {!plan.aggregateUnavailable && plan.exactTarget === undefined && (
        <p>
          The necessary total exceeds uint256. Maximum approval remains
          available without guaranteeing coverage of all commitments.
        </p>
      )}
      {plan.exactTarget !== undefined && (
        <p>Necessary allowance: {formatAmount(plan.exactTarget, decimals)}</p>
      )}
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
