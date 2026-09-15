"use client";
import { Spinner } from "@/components/ui/spinner";
import { useState } from "react";
import Link from "next/link";
import { zeroAddress } from "viem";
import { useChains, useSwitchChain } from "wagmi";
import { ConnectWalletAction } from "@/features/wallet/connect-action";
import { Button } from "@/components/ui/button";
import { TokenNotice } from "@/features/tokens";
import { Notice } from "@/components/ui/notice";
import { Tooltip } from "@/components/ui/tooltip";
import { deployments, type Deployment } from "@/config/deployments";
import type { StoredOrder } from "@/infrastructure/storage";
import { useTradeFragment } from "../hooks/use-trade-fragment";
import { useVerifiedTrade } from "../hooks/use-verified-trade";
import { useRestoreOrder } from "../hooks/use-restore-order";
import { useTradeState } from "../hooks/use-trade-state";
import { CopyTradeLink } from "./copy-trade-link";
import { OrderReceipt } from "./order-receipt";
import { TradeLinkEntry } from "./trade-link-entry";
import { OrderExpiration } from "./order-expiration";
import { CancelOrder } from "./cancel-order";
import { TradeAcceptance } from "./trade-acceptance";
import { SignedTradeResult } from "./signed-trade-result";

export function TradeLink() {
  const [entering, setEntering] = useState(false);
  const payload = useTradeFragment();
  const verified = useVerifiedTrade(payload);
  const deployment = deployments.find(
    (item) => item.id === verified?.entry?.signed.deploymentId,
  );
  const open = () => {
    setEntering(true);
  };
  return (
    <section className="trade-screen">
      {entering && (
        <TradeLinkEntry
          onClose={() => {
            setEntering(false);
          }}
        />
      )}
      {verified?.entry && deployment ? (
        <TradeDetails
          key={payload}
          entry={verified.entry}
          deployment={deployment}
          onOpen={open}
        />
      ) : (
        <>
          <TradeHeading title="Review trade" onOpen={open} />
          {!payload ? (
            <div className="trade-details empty-state">
              <div className="success-mark" aria-hidden="true">
                ↗
              </div>
              <h2>Open a trade link</h2>
              <Button className="primary-action" onClick={open}>
                Paste trade link
              </Button>
              <Button asChild className="text-action">
                <Link href="/">Create an order</Link>
              </Button>
            </div>
          ) : verified?.error ? (
            <div className="trade-details signed-view">
              <div
                className="success-mark"
                aria-hidden="true"
                data-status="Invalid"
              >
                !
              </div>
              <div className="panel-heading">
                <h2>Invalid trade link</h2>
              </div>
              <Notice kind="error">
                <p>{verified.error}</p>
              </Notice>
              <Button className="primary-action" onClick={open}>
                Paste trade link
              </Button>
            </div>
          ) : (
            <Spinner label="Verifying trade link" />
          )}
        </>
      )}
    </section>
  );
}
function TradeHeading({
  title,
  onOpen,
}: {
  title: string;
  onOpen: () => void;
}) {
  return (
    <div className="screen-heading">
      <h1>{title}</h1>
      <Button
        className="text-action"
        aria-label="Open trade link"
        onClick={onOpen}
      >
        Open link ↗
      </Button>
    </div>
  );
}
function TradeDetails({
  entry,
  deployment,
  onOpen,
}: {
  entry: StoredOrder;
  deployment: Deployment;
  onOpen: () => void;
}) {
  const [historyWarning, setHistoryWarning] = useState<string>();
  const state = useTradeState(entry, deployment);
  const chains = useChains();
  const { switchChain } = useSwitchChain();
  const restored = useRestoreOrder(entry, state.address);
  const { order } = entry.signed;
  const ownOrder = state.address?.toLowerCase() === order.maker.toLowerCase();
  const wrongWallet =
    !!state.address &&
    !ownOrder &&
    order.restrictedTaker !== zeroAddress &&
    state.address.toLowerCase() !== order.restrictedTaker.toLowerCase();
  const terminal = ["Filled", "Cancelled", "Expired"].includes(state.label);
  const shareable = ownOrder && state.label === "Open";
  const title =
    state.label === "Filled"
      ? "Trade complete"
      : state.label === "Cancelled"
        ? "Order cancelled"
        : state.label === "Expired"
          ? "Order expired"
          : shareable
            ? "Ready to share."
            : ownOrder
              ? "Your order"
              : "Review trade";
  const network =
    chains.find((chain) => chain.id === deployment.chainId)?.name ??
    deployment.chainId;
  return (
    <>
      <TradeHeading title={title} onOpen={onOpen} />
      <div className="trade-details signed-view">
        <div
          className="success-mark"
          aria-hidden="true"
          data-status={state.label}
        >
          {state.label === "Filled" || (shareable && state.label === "Open")
            ? "✓"
            : state.label === "Cancelled"
              ? "×"
              : state.label === "Expired"
                ? "◷"
                : state.label === "Status unavailable"
                  ? "!"
                  : "↗"}
        </div>
        <div className="panel-heading">
          <h2>
            {shareable
              ? "Your trade link is ready"
              : terminal
                ? title
                : ownOrder
                  ? "Your offer"
                  : "An offer for you"}
          </h2>
          <p className="status-badge" data-status={state.label}>
            <span className="sr-only">Order status: </span>
            {state.label}
          </p>
        </div>
        {historyWarning && (
          <Notice kind="error">
            <p>{historyWarning}</p>
          </Notice>
        )}
        {restored?.startsWith("Order history") && (
          <Notice kind="error">
            <p>{restored}</p>
          </Notice>
        )}
        <OrderReceipt
          chainId={deployment.chainId}
          order={order}
          perspective={ownOrder ? "maker" : "taker"}
        />
        <TokenNotice chainId={deployment.chainId} address={order.makerToken} />
        <TokenNotice chainId={deployment.chainId} address={order.takerToken} />
        <dl className="order-facts">
          <div>
            <dt>From</dt>
            <dd title={order.maker}>
              {ownOrder
                ? "You"
                : `${order.maker.slice(0, 6)}…${order.maker.slice(-4)}`}
            </dd>
          </div>
          <div>
            <dt>
              Who can accept{" "}
              <Tooltip
                label="About who can accept"
                text={
                  order.restrictedTaker === zeroAddress
                    ? "Anyone with an unrestricted link can accept. The first successful trade wins."
                    : "Only the designated wallet can accept this order."
                }
              />
            </dt>
            <dd title={order.restrictedTaker}>
              {order.restrictedTaker === zeroAddress
                ? "Anyone with the link"
                : `${order.restrictedTaker.slice(0, 6)}…${order.restrictedTaker.slice(-4)}`}
            </dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>
              <OrderExpiration expiration={order.expiration} now={state.now} />
            </dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{network}</dd>
          </div>
        </dl>
        {state.address && state.chainId !== deployment.chainId && !terminal && (
          <Button
            className="primary-action"
            onClick={() => {
              switchChain({ chainId: deployment.chainId });
            }}
          >
            Switch to trade network
          </Button>
        )}
        {!state.address && !terminal && <ConnectWalletAction />}
        {state.address && !ownOrder && !wrongWallet && !terminal && (
          <TradeAcceptance
            key={state.address}
            entry={entry}
            deployment={deployment}
            state={state}
            taker={state.address}
            onHistoryWarning={setHistoryWarning}
          />
        )}
        <SignedTradeResult historyHandled={ownOrder} />
        {ownOrder && <CopyTradeLink payload={entry.payload} />}
        {ownOrder && !terminal && (
          <>
            <CancelOrder
              entry={entry}
              deployment={deployment}
              now={state.now}
              refresh={state.refresh}
              ready={
                state.label === "Open" && state.chainId === deployment.chainId
              }
            />
          </>
        )}
        {wrongWallet && !terminal && (
          <Button disabled className="action-error primary-action">
            This trade is not for you
          </Button>
        )}
        {terminal && (
          <Button
            disabled
            className={
              state.label === "Filled"
                ? "primary-action completed-action"
                : "action-error primary-action"
            }
          >
            Trade {state.label.toLowerCase()}
          </Button>
        )}
      </div>
    </>
  );
}
