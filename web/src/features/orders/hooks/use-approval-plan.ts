"use client";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import {
  approvalPlan,
  type ApprovalInput,
  type KnownOrder,
} from "@/domain/orders";
import type { Deployment } from "@/config/deployments";
import { useTokenFunding } from "@/infrastructure/chain/token-funding";
import { useOrderStatuses } from "@/infrastructure/chain/order-status";
import { useMakerHistory } from "./use-maker-history";

export function useApprovalPlan({
  deployment,
  maker,
  token,
  amount,
  mode,
  viewed,
}: {
  deployment: Deployment;
  maker: Address;
  token: Address;
  amount: bigint;
  mode: ApprovalInput["mode"];
  viewed?: KnownOrder;
}) {
  const history = useMakerHistory(maker, deployment.id);
  const statuses = useOrderStatuses(
    deployment,
    history.orders.map((entry) => entry.orderId),
  );
  const state = useTokenFunding(deployment.chainId, token, maker);
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(BigInt(Math.floor(Date.now() / 1000)));
    }, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, []);
  const plan = approvalPlan({
    mode,
    maker,
    token,
    amount,
    deploymentId: deployment.id,
    now,
    historyAvailable: history.available,
    balance:
      state.balance.isSuccess && !state.balance.isFetching
        ? state.balance.data
        : undefined,
    allowance:
      state.allowance.isSuccess && !state.allowance.isFetching
        ? state.allowance.data
        : undefined,
    known: history.orders.map((entry, index) => ({
      order: entry.signed.order,
      orderId: entry.orderId,
      deploymentId: entry.signed.deploymentId,
      status:
        statuses[index]?.isSuccess && !statuses[index].isFetching
          ? statuses[index].data
          : undefined,
    })),
    ...(viewed ? { viewed } : {}),
  });
  const refresh = async () => {
    await Promise.all([
      state.refresh(),
      ...statuses.map((status) => status.refetch()),
    ]);
  };
  return { plan, state, refresh, historyError: history.error };
}
