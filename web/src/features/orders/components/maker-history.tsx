"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, useChains } from "wagmi";
import { deployments, type Deployment } from "@/config/deployments";
import { formatAmount, tradeStatus, type OrderStatus } from "@/domain/orders";
import type { StoredOrder } from "@/infrastructure/storage";
import { useOrderStatuses } from "@/infrastructure/chain/order-status";
import { useTokenMetadata } from "@/infrastructure/chain/token-metadata";
import { useMakerHistory } from "../hooks/use-maker-history";
import { OrderExpiration } from "./order-expiration";
import { CopyTradeLink } from "./copy-trade-link";

export function MakerHistory() {
  const { address } = useAccount();
  const chains = useChains();
  const [chainId, setChainId] = useState<number>(
    deployments[0]?.chainId ?? 100,
  );
  const deployment = deployments.find((entry) => entry.chainId === chainId);
  return (
    <section className="space-y-4">
      <h1>Maker history</h1>
      <p>
        Saved offers belong to this browser, maker and deployment. Clearing
        storage does not cancel orders.
      </p>
      <label className="block">
        History network
        <select
          className="ml-2 rounded border p-2"
          value={chainId}
          onChange={(event) => {
            setChainId(Number(event.target.value));
          }}
        >
          {chains.map((chain) => (
            <option key={chain.id} value={chain.id}>
              {chain.name}
            </option>
          ))}
        </select>
      </label>
      {!address ? (
        <p>Connect your maker wallet to view its saved offers.</p>
      ) : !deployment ? (
        <p>Trading is not configured on this network.</p>
      ) : (
        <HistoryOrders
          key={`${address}:${String(deployment.id)}`}
          maker={address}
          deployment={deployment}
        />
      )}
    </section>
  );
}

function HistoryOrders({
  maker,
  deployment,
}: {
  maker: string;
  deployment: Deployment;
}) {
  const history = useMakerHistory(maker, deployment.id);
  const statuses = useOrderStatuses(
    deployment,
    history.orders.map((entry) => entry.orderId),
  );
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(BigInt(Math.floor(Date.now() / 1000)));
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  return (
    <div className="space-y-4">
      {history.error && <p role="alert">{history.error}</p>}
      {!history.available && !history.error && <p>Loading saved offers…</p>}
      {history.available && history.orders.length === 0 && (
        <p>No saved orders for this maker and network.</p>
      )}
      {history.orders.map((entry, index) => (
        <HistoryOrder
          key={entry.orderId}
          entry={entry}
          deployment={deployment}
          status={
            statuses[index]?.isSuccess && !statuses[index].isFetching
              ? statuses[index].data
              : undefined
          }
          now={now}
        />
      ))}
    </div>
  );
}

function HistoryOrder({
  entry,
  deployment,
  status,
  now,
}: {
  entry: StoredOrder;
  deployment: Deployment;
  status: OrderStatus | undefined;
  now: bigint;
}) {
  const { order } = entry.signed;
  const send = useTokenMetadata(deployment.chainId, order.makerToken);
  const receive = useTokenMetadata(deployment.chainId, order.takerToken);
  return (
    <article
      aria-label={`Order ${entry.orderId}`}
      className="space-y-2 rounded border p-3"
    >
      <p className="break-all">Order: {entry.orderId}</p>
      <p>Status: {tradeStatus(status, order.expiration, now)}</p>
      <p>
        Maker sends:{" "}
        {send.decimals.isSuccess
          ? formatAmount(order.makerAmount, send.decimals.data)
          : `${order.makerAmount.toString()} base units (decimals unavailable)`}
      </p>
      <p className="break-all">Maker token: {order.makerToken}</p>
      <p>
        Taker sends:{" "}
        {receive.decimals.isSuccess
          ? formatAmount(order.takerAmount, receive.decimals.data)
          : `${order.takerAmount.toString()} base units (decimals unavailable)`}
      </p>
      <p className="break-all">Taker token: {order.takerToken}</p>
      <OrderExpiration expiration={order.expiration} now={now} />
      <CopyTradeLink payload={entry.payload} />
      <Link className="underline" href={`/trade#${entry.payload}`}>
        View trade
      </Link>
    </article>
  );
}
