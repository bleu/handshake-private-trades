import { zeroAddress } from "viem";
import type { StoredOrder } from "@/infrastructure/storage";
import type { Deployment } from "@/config/deployments";
import { TokenNotice } from "@/features/tokens";
import { OrderReceipt } from "./order-receipt";
import { OrderExpiration } from "./order-expiration";

/** Exact saved terms shared by inspection and cancellation confirmation. */
export function OrderTerms({
  entry,
  deployment,
  now,
  perspective = "maker",
}: {
  entry: StoredOrder;
  deployment: Deployment;
  now: bigint;
  perspective?: "maker" | "taker";
}) {
  const { order } = entry.signed;
  const counterparty =
    perspective === "taker" ? order.maker : order.restrictedTaker;
  return (
    <div className="order-terms">
      <OrderReceipt
        chainId={deployment.chainId}
        order={order}
        perspective={perspective}
      />
      <dl className="order-facts">
        <div>
          <dt>Saved</dt>
          <dd>
            {entry.savedAt === undefined
              ? "Unavailable"
              : new Date(entry.savedAt).toLocaleString(undefined, {
                  timeZoneName: "short",
                })}
          </dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>
            <OrderExpiration expiration={order.expiration} now={now} />
          </dd>
        </div>
        <div>
          <dt>Counterparty</dt>
          <dd title={counterparty}>
            <span className="sr-only">
              {perspective === "taker" ? "Maker: " : "Restricted taker: "}
            </span>
            {counterparty === zeroAddress ? "None" : counterparty}
          </dd>
        </div>
      </dl>
      <TokenNotice chainId={deployment.chainId} address={order.makerToken} />
      <TokenNotice chainId={deployment.chainId} address={order.takerToken} />
      <details className="order-technical">
        <summary>Order details</summary>
        <p>Order: {entry.orderId}</p>
        <p>Maker: {order.maker}</p>
        <p>Maker token: {order.makerToken}</p>
        <p>Taker token: {order.takerToken}</p>
      </details>
    </div>
  );
}
