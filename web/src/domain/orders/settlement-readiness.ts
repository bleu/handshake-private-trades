import { zeroAddress } from "viem";
import type { Order } from "./schema.ts";
import type { OrderStatus } from "./readiness.ts";
import { tradeStatus } from "./status.ts";

export type SettlementReadiness = {
  order: Order;
  caller: string | undefined;
  status: OrderStatus | undefined;
  now: bigint;
  makerBalance: bigint | undefined;
  makerAllowance: bigint | undefined;
  takerBalance: bigint | undefined;
  takerAllowance: bigint | undefined;
};
/** A selected order depends only on its own funding, never aggregate commitments. */
export function settlementReadiness(
  input: SettlementReadiness,
): string | undefined {
  const status = tradeStatus(input.status, input.order.expiration, input.now);
  if (status === "Status unavailable") return "Status unavailable.";
  if (status !== "Open") return `Order is ${status.toLowerCase()}.`;
  if (!input.caller) return "Connect a wallet to accept this trade.";
  if (input.caller.toLowerCase() === input.order.maker.toLowerCase())
    return "The maker cannot accept their own order.";
  if (
    input.order.restrictedTaker !== zeroAddress &&
    input.caller.toLowerCase() !== input.order.restrictedTaker.toLowerCase()
  )
    return "This order is restricted to another wallet.";
  for (const [label, value, amount] of [
    ["Maker balance", input.makerBalance, input.order.makerAmount],
    ["Maker allowance", input.makerAllowance, input.order.makerAmount],
    ["Your balance", input.takerBalance, input.order.takerAmount],
    ["Your allowance", input.takerAllowance, input.order.takerAmount],
  ] as const) {
    if (value === undefined) return `${label} is unavailable.`;
    if (value < amount) return `${label} is insufficient.`;
  }
  return undefined;
}
