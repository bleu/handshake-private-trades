"use client";
import type { Deployment } from "@/config/deployments";
import type { StoredOrder } from "@/infrastructure/storage";
import type { useTradeState } from "../hooks/use-trade-state";
import { useApprovalPlan } from "../hooks/use-approval-plan";
import { ApprovalCommitments } from "./approval-commitments";
import { ApprovalAction } from "./approval-action";

export function MakerApprovalRepair({
  entry,
  deployment,
  state,
}: {
  entry: StoredOrder;
  deployment: Deployment;
  state: ReturnType<typeof useTradeState>;
}) {
  const { order } = entry.signed;
  const viewed = {
    order,
    orderId: entry.orderId,
    deploymentId: deployment.id,
    status: state.status,
  };
  const { plan, historyError } = useApprovalPlan({
    deployment,
    maker: order.maker,
    token: order.makerToken,
    amount: order.makerAmount,
    mode: "repair",
    viewed,
  });
  return (
    <section className="space-y-2" aria-label="Repair maker allowance">
      <ApprovalCommitments
        plan={plan}
        decimals={
          state.makerToken.decimals.isSuccess
            ? state.makerToken.decimals.data
            : undefined
        }
        historyError={historyError}
        mode="repair"
      />
      {state.makerToken.decimals.isSuccess && (
        <>
          <ApprovalAction
            deployment={deployment}
            maker={order.maker}
            token={order.makerToken}
            amount={order.makerAmount}
            decimals={state.makerToken.decimals.data}
            plan={plan}
            mode="repair"
            viewed={viewed}
            ready={
              state.label === "Open" && !state.makerToken.decimals.isFetching
            }
          />
        </>
      )}
    </section>
  );
}
