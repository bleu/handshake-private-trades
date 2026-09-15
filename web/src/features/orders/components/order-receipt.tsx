"use client";
import { Spinner } from "@/components/ui/spinner";
import type { Address } from "viem";
import { formatAmount, type Order } from "@/domain/orders";
import { TokenIdentity } from "@/features/tokens";
import { useTokenMetadata } from "@/infrastructure/chain/token-metadata";

type ReceiptOrder = Pick<
  Order,
  "makerToken" | "takerToken" | "makerAmount" | "takerAmount"
>;
export function OrderReceipt({
  chainId,
  order,
  perspective = "maker",
}: {
  chainId: number;
  order: ReceiptOrder;
  perspective?: "maker" | "taker";
}) {
  return (
    <div className="order-receipt">
      <ReceiptAmount
        chainId={chainId}
        address={perspective === "maker" ? order.makerToken : order.takerToken}
        amount={perspective === "maker" ? order.makerAmount : order.takerAmount}
        label="You send"
      />
      <ReceiptAmount
        chainId={chainId}
        address={perspective === "maker" ? order.takerToken : order.makerToken}
        amount={perspective === "maker" ? order.takerAmount : order.makerAmount}
        label="You receive"
      />
    </div>
  );
}
function ReceiptAmount({
  chainId,
  address,
  amount,
  label,
}: {
  chainId: number;
  address: Address;
  amount: bigint;
  label: string;
}) {
  const token = useTokenMetadata(chainId, address);
  return (
    <div className="receipt-row">
      <span aria-hidden="true">{label}</span>
      <div className="receipt-value">
        <p>
          <span className="sr-only">{label}: </span>
          {token.decimals.isSuccess ? (
            formatAmount(amount, token.decimals.data)
          ) : token.decimals.isPending ? (
            <Spinner label="Loading amount" />
          ) : (
            `${amount.toString()} base units (decimals unavailable)`
          )}
        </p>
        <TokenIdentity chainId={chainId} address={address} />
      </div>
    </div>
  );
}
