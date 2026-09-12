"use client";
import type { Address } from "viem";
import { Button } from "@/components/ui/button";
import type { Deployment } from "@/config/deployments";
import { settlementReadiness } from "@/domain/orders";
import type { StoredOrder } from "@/infrastructure/storage";
import type { useTradeState } from "../hooks/use-trade-state";
import { useApprovalPlan } from "../hooks/use-approval-plan";
import { ApprovalCommitments } from "./approval-commitments";
import { ApprovalAction } from "./approval-action";
import { useSettleOrder } from "../hooks/use-settle-order";

export function TradeAcceptance({
  entry,
  deployment,
  state,
  taker,
}: {
  entry: StoredOrder;
  deployment: Deployment;
  state: ReturnType<typeof useTradeState>;
  taker: Address;
}) {
  const fresh = <T,>(query: {
    isSuccess: boolean;
    isFetching: boolean;
    data: T | undefined;
  }) => (query.isSuccess && !query.isFetching ? query.data : undefined);
  const decimals = {
    maker: fresh(state.makerToken.decimals),
    taker: fresh(state.takerToken.decimals),
  };
  const { settle, busy } = useSettleOrder(entry, deployment, taker, decimals);
  const { plan, historyError } = useApprovalPlan({
    deployment,
    maker: taker,
    token: entry.signed.order.takerToken,
    amount: entry.signed.order.takerAmount,
    mode: "acceptance",
  });
  const reason = settlementReadiness({
    order: entry.signed.order,
    caller: taker,
    status: state.status,
    now: state.now,
    makerBalance: fresh(state.makerFunding.balance),
    makerAllowance: fresh(state.makerFunding.allowance),
    takerBalance: fresh(state.takerFunding.balance),
    takerAllowance: fresh(state.takerFunding.allowance),
  });
  return (
    <section className="space-y-2" aria-label="Accept trade">
      <p>
        Review the amounts and addresses above. Another transaction may accept
        or cancel this order before yours is included.
      </p>
      {reason && <p role="alert">{reason}</p>}
      {(decimals.maker === undefined || decimals.taker === undefined) && (
        <p role="alert">
          Token decimals unavailable. Wait for fresh reads before accepting.
        </p>
      )}
      <ApprovalCommitments
        plan={plan}
        decimals={
          state.takerToken.decimals.isSuccess
            ? state.takerToken.decimals.data
            : undefined
        }
        historyError={historyError}
        mode="acceptance"
      />
      {state.takerToken.decimals.isSuccess && (
        <>
          <ApprovalAction
            deployment={deployment}
            maker={taker}
            token={entry.signed.order.takerToken}
            amount={entry.signed.order.takerAmount}
            decimals={state.takerToken.decimals.data}
            plan={plan}
            mode="acceptance"
            viewed={{
              order: entry.signed.order,
              orderId: entry.orderId,
              deploymentId: deployment.id,
              status: state.status,
            }}
            ready={
              state.label === "Open" &&
              decimals.maker !== undefined &&
              decimals.taker !== undefined
            }
          />
        </>
      )}
      <Button
        disabled={
          busy ||
          !!reason ||
          decimals.maker === undefined ||
          decimals.taker === undefined ||
          state.chainId !== deployment.chainId
        }
        onClick={() => {
          void settle();
        }}
      >
        Accept trade
      </Button>
    </section>
  );
}
