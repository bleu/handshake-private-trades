"use client";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { tradeStatus } from "@/domain/orders";
import type { StoredOrder } from "@/infrastructure/storage";
import type { Deployment } from "@/config/deployments";
import { useOrderStatuses } from "@/infrastructure/chain/order-status";
import { useTokenMetadata } from "@/infrastructure/chain/token-metadata";
import { useTokenFunding } from "@/infrastructure/chain/token-funding";

export function useTradeState(entry: StoredOrder, deployment: Deployment) {
  const { address, chainId } = useAccount();
  const { order } = entry.signed;
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(BigInt(Math.floor(Date.now() / 1000)));
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  const query = useOrderStatuses(deployment, [entry.orderId])[0];
  const status = query?.isSuccess ? query.data : undefined;
  const makerToken = useTokenMetadata(
    deployment.chainId,
    order.makerToken,
    true,
  );
  const takerToken = useTokenMetadata(
    deployment.chainId,
    order.takerToken,
    true,
  );
  const makerFunding = useTokenFunding(
    deployment.chainId,
    order.makerToken,
    order.maker,
  );
  const takerFunding = useTokenFunding(
    deployment.chainId,
    order.takerToken,
    address,
  );
  const refresh = async () => {
    await Promise.all([
      query?.refetch(),
      makerToken.refresh(),
      takerToken.refresh(),
      makerFunding.refresh(),
      takerFunding.refresh(),
    ]);
  };
  return {
    address,
    chainId,
    now,
    status,
    statusLoading: !query || query.isPending,
    label: tradeStatus(status, order.expiration, now),
    makerToken,
    takerToken,
    makerFunding,
    takerFunding,
    refresh,
  };
}
