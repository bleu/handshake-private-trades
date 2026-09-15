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
  onHistoryWarning,
}: {
  entry: StoredOrder;
  deployment: Deployment;
  state: ReturnType<typeof useTradeState>;
  taker: Address;
  onHistoryWarning: (warning: string | undefined) => void;
}) {
  const fresh = <T,>(query: {
    isSuccess: boolean;
    isFetching: boolean;
    data: T | undefined;
  }) => (query.isSuccess ? query.data : undefined);
  const decimals = {
    maker: fresh(state.makerToken.decimals),
    taker: fresh(state.takerToken.decimals),
  };
  const { settle, busy } = useSettleOrder(
    entry,
    deployment,
    taker,
    decimals,
    onHistoryWarning,
  );
  const { plan, historyError, aggregateError } = useApprovalPlan({
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
  const tokenReason = reason?.replace(
    /^(Maker|Your) (balance|allowance)/,
    (_, party: string, kind: string) => {
      const metadata = party === "Maker" ? state.makerToken : state.takerToken;
      const address =
        party === "Maker"
          ? entry.signed.order.makerToken
          : entry.signed.order.takerToken;
      return `${party} ${kind === "allowance" ? "approval" : kind} for ${metadata.symbol.data ?? address}`;
    },
  );
  const blocker =
    state.chainId !== deployment.chainId
      ? "Switch to trade network to accept"
      : (tokenReason ??
        (decimals.maker === undefined || decimals.taker === undefined
          ? "Token decimals unavailable"
          : undefined));
  const loading =
    [
      state.makerToken.decimals,
      state.takerToken.decimals,
      state.makerFunding.balance,
      state.makerFunding.allowance,
      state.takerFunding.balance,
      state.takerFunding.allowance,
    ].some((query) => query.isPending) || state.statusLoading;
  const visibleBlocker = busy || loading ? undefined : blocker;
  return (
    <div className="workflow-actions" aria-label="Accept trade">
      {!busy && (
        <ApprovalCommitments
          plan={plan}
          decimals={decimals.taker}
          historyError={historyError}
          mode="acceptance"
          compact
          aggregateError={aggregateError}
        />
      )}
      {state.takerToken.decimals.isSuccess &&
        (!reason || reason.startsWith("Your allowance")) && (
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
      {!(
        plan.needsApproval === true && reason?.startsWith("Your allowance")
      ) && (
        <Button
          className={visibleBlocker ? "action-error" : undefined}
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
          {visibleBlocker ?? "Accept trade"}
        </Button>
      )}
    </div>
  );
}
