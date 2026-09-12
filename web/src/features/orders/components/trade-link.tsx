"use client";
import { zeroAddress } from "viem";
import { useChains, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/button";
import { deployments, type Deployment } from "@/config/deployments";
import { formatAmount } from "@/domain/orders";
import type { StoredOrder } from "@/infrastructure/storage";
import { TokenNotice } from "@/features/tokens";
import { useTradeFragment } from "../hooks/use-trade-fragment";
import { useVerifiedTrade } from "../hooks/use-verified-trade";
import { useRestoreOrder } from "../hooks/use-restore-order";
import { useTradeState } from "../hooks/use-trade-state";
import { OrderExpiration } from "./order-expiration";
import { CancelOrder } from "./cancel-order";
import { MakerApprovalRepair } from "./maker-approval-repair";
import { TradeAcceptance } from "./trade-acceptance";
import { SignedTradeResult } from "./signed-trade-result";

export function TradeLink() {
  const payload = useTradeFragment();
  const verified = useVerifiedTrade(payload);
  const deployment = deployments.find(
    (item) => item.id === verified?.entry?.signed.deploymentId,
  );
  return (
    <section className="space-y-4">
      <h1>Review a trade</h1>
      {!payload ? (
        <p>Open a trade link to review its terms.</p>
      ) : verified?.error ? (
        <p role="alert">{verified.error}</p>
      ) : verified?.entry && deployment ? (
        <TradeDetails
          key={payload}
          entry={verified.entry}
          deployment={deployment}
        />
      ) : (
        <p>Verifying trade link…</p>
      )}
    </section>
  );
}

function TradeDetails({
  entry,
  deployment,
}: {
  entry: StoredOrder;
  deployment: Deployment;
}) {
  const state = useTradeState(entry, deployment);
  const chains = useChains();
  const { switchChain } = useSwitchChain();
  const restored = useRestoreOrder(entry, state.address);
  const { order } = entry.signed;
  const { makerToken, takerToken } = state;
  return (
    <div className="space-y-3">
      {restored && <p role="status">{restored}</p>}
      {state.address &&
        (state.address.toLowerCase() === order.maker.toLowerCase() ? (
          <p>This is your order.</p>
        ) : order.restrictedTaker !== zeroAddress &&
          state.address.toLowerCase() !==
            order.restrictedTaker.toLowerCase() ? (
          <p role="alert">
            This order is restricted to another wallet. Switch to the restricted
            taker to accept.
          </p>
        ) : (
          <p>You can review this trade as its taker.</p>
        ))}
      {state.address && state.chainId !== deployment.chainId && (
        <Button
          onClick={() => {
            switchChain({ chainId: deployment.chainId });
          }}
        >
          Switch to trade network
        </Button>
      )}
      <p>Order status: {state.label}</p>
      <p>
        Network:{" "}
        {chains.find((chain) => chain.id === deployment.chainId)?.name ??
          deployment.chainId}
      </p>
      <p className="break-all">Maker: {order.maker}</p>
      <p>
        Maker sends:{" "}
        {makerToken.decimals.isSuccess
          ? formatAmount(order.makerAmount, makerToken.decimals.data)
          : `${order.makerAmount.toString()} base units (decimals unavailable)`}
      </p>
      <p className="break-all">Maker token: {order.makerToken}</p>
      <TokenNotice chainId={deployment.chainId} address={order.makerToken} />
      <p>
        Taker sends:{" "}
        {takerToken.decimals.isSuccess
          ? formatAmount(order.takerAmount, takerToken.decimals.data)
          : `${order.takerAmount.toString()} base units (decimals unavailable)`}
      </p>
      <p className="break-all">Taker token: {order.takerToken}</p>
      <TokenNotice chainId={deployment.chainId} address={order.takerToken} />
      <p className="break-all">
        Restricted taker:{" "}
        {order.restrictedTaker === zeroAddress ? "None" : order.restrictedTaker}
      </p>
      {order.restrictedTaker === zeroAddress && (
        <p>Anyone can accept this order. The first successful trade wins.</p>
      )}
      <OrderExpiration expiration={order.expiration} now={state.now} />
      <Funding
        label="Maker"
        funding={state.makerFunding}
        amount={order.makerAmount}
      />
      {state.address &&
      state.address.toLowerCase() !== order.maker.toLowerCase() ? (
        <Funding
          label="Your"
          funding={state.takerFunding}
          amount={order.takerAmount}
        />
      ) : !state.address ? (
        <p>Connect a wallet to accept this trade or manage your order.</p>
      ) : null}
      <Button
        onClick={() => {
          void state.refresh();
        }}
      >
        Refresh trade
      </Button>
      {state.address &&
        state.address.toLowerCase() !== order.maker.toLowerCase() &&
        (order.restrictedTaker === zeroAddress ||
          state.address.toLowerCase() ===
            order.restrictedTaker.toLowerCase()) &&
        !["Filled", "Cancelled", "Expired"].includes(state.label) && (
          <TradeAcceptance
            key={state.address}
            entry={entry}
            deployment={deployment}
            state={state}
            taker={state.address}
          />
        )}
      {state.address?.toLowerCase() === order.maker.toLowerCase() &&
        !["Filled", "Cancelled", "Expired"].includes(state.label) && (
          <>
            <MakerApprovalRepair
              entry={entry}
              deployment={deployment}
              state={state}
            />
            <CancelOrder
              entry={entry}
              deployment={deployment}
              ready={
                state.label === "Open" && state.chainId === deployment.chainId
              }
            />
          </>
        )}
      <SignedTradeResult
        historyHandled={
          state.address?.toLowerCase() === order.maker.toLowerCase()
        }
      />
    </div>
  );
}

function Funding({
  label,
  funding,
  amount,
}: {
  label: string;
  funding: ReturnType<typeof useTradeState>["makerFunding"];
  amount: bigint;
}) {
  return (
    <div>
      {(["balance", "allowance"] as const).map((kind) => {
        const query = funding[kind];
        return (
          <p key={kind}>
            {!query.isSuccess || query.isFetching
              ? `${label} ${kind} unavailable.`
              : query.data < amount
                ? `${label} ${kind} is insufficient.`
                : `${label} ${kind} is sufficient.`}
          </p>
        );
      })}
    </div>
  );
}
