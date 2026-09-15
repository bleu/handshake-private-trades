"use client";
import Link from "next/link";
import { Spinner } from "@/components/ui/spinner";
import { Select } from "@/components/ui/select";
import { ConnectWalletAction } from "@/features/wallet/connect-action";
import { Tooltip } from "@/components/ui/tooltip";
import { TokenIdentity, TokenNotice } from "@/features/tokens";
import useSWR from "swr";
import {
  COW_LIST_URL,
  fetchCowTokens,
  type ListedToken,
} from "@/infrastructure/http/cow-list";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { deployments, type Deployment } from "@/config/deployments";
import { formatAmount, tradeStatus, type OrderStatus } from "@/domain/orders";
import type { StoredOrder } from "@/infrastructure/storage";
import { useOrderStatuses } from "@/infrastructure/chain/order-status";
import { useTokenNames } from "@/infrastructure/chain/token-names";
import { useTokenMetadata } from "@/infrastructure/chain/token-metadata";
import { useMakerHistory } from "../hooks/use-maker-history";
import { CopyTradeLink } from "./copy-trade-link";

export function MakerHistory() {
  const { address } = useAccount();
  const chainId = useChainId();
  const deployment = deployments.find((entry) => entry.chainId === chainId);
  return (
    <section className="history-screen space-y-4">
      <div className="history-heading">
        <h1>History</h1>
        <Tooltip
          label="About History"
          text="Saved orders and trades filled through this app belong to this browser, wallet and network. Clearing storage does not cancel orders. Dates show when an order was first saved here; older records may have no save date."
        />
        <Button asChild className="text-action history-create">
          <Link href="/">+ Create order</Link>
        </Button>
      </div>
      {!address ? (
        <div className="history-panel empty-state">
          <div className="success-mark" aria-hidden="true">
            ↗
          </div>
          <h2>Your orders, in one place</h2>
          <p>Connect your wallet to view its saved orders and filled trades.</p>
          <ConnectWalletAction />
        </div>
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
  const history = useMakerHistory(maker, deployment.id, true);
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
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const tokenNames = useTokenNames(
    deployment.chainId,
    history.orders.flatMap((entry) => [
      entry.signed.order.makerToken,
      entry.signed.order.takerToken,
    ]),
    !!search.trim(),
  );
  const { data: listed, isLoading: listLoading } = useSWR<ListedToken[], Error>(
    [COW_LIST_URL, deployment.chainId] as const,
    fetchCowTokens,
  );
  const [filter, setFilter] = useState("All");
  const rows = history.orders
    .map((entry, index) => {
      const query = statuses[index];
      // A cached Open value may predate a fill performed in another browser.
      const loading =
        !query ||
        query.isPending ||
        (query.isFetching && !query.isFetchedAfterMount);
      const status = !loading && query.isSuccess ? query.data : undefined;
      return {
        entry,
        status,
        loading,
        label: loading
          ? undefined
          : tradeStatus(status, entry.signed.order.expiration, now),
      };
    })
    .filter(
      (row) =>
        row.entry.signed.order.maker.toLowerCase() === maker.toLowerCase() ||
        row.status === 1 ||
        row.status === undefined,
    );
  const visible = rows
    .filter((row) => row.loading || filter === "All" || row.label === filter)
    .filter(({ entry }) => {
      const { order } = entry.signed;
      const addresses = [
        order.makerToken.toLowerCase(),
        order.takerToken.toLowerCase(),
      ];
      return [
        entry.orderId,
        order.maker,
        order.restrictedTaker,
        ...addresses,
        ...addresses.flatMap((address) => tokenNames.get(address) ?? []),
        ...(listed ?? [])
          .filter((token) => addresses.includes(token.address.toLowerCase()))
          .flatMap((token) => [token.name, token.symbol]),
      ].some((value) =>
        value?.toLowerCase().includes(search.trim().toLowerCase()),
      );
    })
    .sort((a, b) => {
      const first = a.entry.savedAt,
        second = b.entry.savedAt;
      if (first === undefined || second === undefined)
        return first === second
          ? a.entry.orderId.localeCompare(b.entry.orderId)
          : first === undefined
            ? 1
            : -1;
      return (
        (sort === "oldest" ? first - second : second - first) ||
        a.entry.orderId.localeCompare(b.entry.orderId)
      );
    });
  const pages = Math.max(1, Math.ceil(visible.length / 10));
  const currentPage = Math.min(page, pages);
  return (
    <div className="history-panel">
      {history.error && <p role="alert">{history.error}</p>}
      {!history.available && !history.error && (
        <div className="history-loading">
          <Spinner label="Loading saved orders" />
        </div>
      )}
      <div
        className="history-filters"
        role="group"
        aria-label="Filter by status"
      >
        {[
          "All",
          "Open",
          "Filled",
          "Cancelled",
          "Expired",
          "Status unavailable",
        ].map((label) => (
          <Button
            key={label}
            aria-pressed={filter === label}
            onClick={() => {
              setFilter(label);
              setPage(1);
            }}
          >
            {label}{" "}
            {
              rows.filter((row) => label === "All" || row.label === label)
                .length
            }
          </Button>
        ))}
      </div>
      <div className="history-search-row">
        <input
          aria-label="Search orders"
          placeholder="Search token, order ID or counterparty"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <Select
          aria-label="Sort orders"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value);
            setPage(1);
          }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
      </div>
      <div className="history-table">
        <div className="history-columns" aria-hidden="true">
          <span>Order</span>
          <span>You send</span>
          <span>You receive</span>
          <span>Status</span>
          <span>Link</span>
        </div>
        <div className="history-orders">
          {rows.length > 0 && visible.length === 0 && (
            <p className="no-orders">No matching orders.</p>
          )}
          {visible
            .slice((currentPage - 1) * 10, currentPage * 10)
            .map(({ entry, status, loading }) => (
              <HistoryOrder
                key={entry.orderId}
                entry={entry}
                owner={maker}
                deployment={deployment}
                status={status}
                now={now}
                loading={listLoading || loading}
              />
            ))}
        </div>
      </div>
      <nav className="history-pagination" aria-label="History pagination">
        <Button
          disabled={currentPage === 1}
          onClick={() => {
            setPage(currentPage - 1);
          }}
        >
          Previous page
        </Button>
        <span>
          Page {currentPage} of {pages}
        </span>
        <Button
          disabled={currentPage === pages}
          onClick={() => {
            setPage(currentPage + 1);
          }}
        >
          Next page
        </Button>
      </nav>
    </div>
  );
}

function HistoryOrder({
  entry,
  owner,
  deployment,
  status,
  now,
  loading,
}: {
  entry: StoredOrder;
  owner: string;
  deployment: Deployment;
  status: OrderStatus | undefined;
  now: bigint;
  loading: boolean;
}) {
  const original = entry.signed.order;
  const order =
    original.maker.toLowerCase() === owner.toLowerCase()
      ? original
      : {
          ...original,
          makerToken: original.takerToken,
          takerToken: original.makerToken,
          makerAmount: original.takerAmount,
          takerAmount: original.makerAmount,
        };
  const send = useTokenMetadata(deployment.chainId, order.makerToken, true);
  const receive = useTokenMetadata(deployment.chainId, order.takerToken, true);
  const pending =
    loading ||
    [send, receive].some((token) =>
      [token.decimals, token.name, token.symbol].some(
        (query) => query.isPending,
      ),
    );
  if (pending)
    return (
      <article
        aria-label={`Order ${entry.orderId}`}
        className="history-row"
        aria-busy="true"
      >
        <div className="history-loading">
          <Spinner label="Loading order details" />
        </div>
      </article>
    );
  return (
    <article aria-label={`Order ${entry.orderId}`} className="history-row">
      <div className="history-meta">
        <Link
          className="history-id"
          aria-label={`View order ${entry.orderId}`}
          title={entry.orderId}
          href={`/trade#${entry.payload}`}
        >
          <span className="sr-only">Order: </span>
          {entry.orderId.slice(0, 10)}…{entry.orderId.slice(-6)}
        </Link>
        <p>
          Saved:{" "}
          {entry.savedAt === undefined
            ? "Unavailable"
            : new Date(entry.savedAt).toLocaleString(undefined, {
                timeZoneName: "short",
              })}
        </p>
      </div>
      <div className="history-asset">
        <TokenIdentity
          chainId={deployment.chainId}
          address={order.makerToken}
        />
        <p>
          <span className="history-amount-label">You send: </span>
          {send.decimals.isSuccess
            ? formatAmount(order.makerAmount, send.decimals.data)
            : "Amount unavailable"}
        </p>
        <TokenNotice chainId={deployment.chainId} address={order.makerToken} />
      </div>
      <div className="history-asset">
        <TokenIdentity
          chainId={deployment.chainId}
          address={order.takerToken}
        />
        <p>
          <span className="history-amount-label">You receive: </span>
          {receive.decimals.isSuccess
            ? formatAmount(order.takerAmount, receive.decimals.data)
            : "Amount unavailable"}
        </p>
        <TokenNotice chainId={deployment.chainId} address={order.takerToken} />
      </div>
      <p
        className="history-status status-badge"
        data-status={tradeStatus(status, order.expiration, now)}
      >
        <span className="sr-only">Status: </span>
        {tradeStatus(status, order.expiration, now)}
      </p>
      <div className="history-actions">
        <CopyTradeLink payload={entry.payload} compact />
      </div>
    </article>
  );
}
