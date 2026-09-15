import { MAX_UINT256 } from "./amounts.ts";
import type { Order } from "./schema.ts";
export type OrderStatus = 0 | 1 | 2;
export type KnownOrder = {
  order: Order;
  orderId: string;
  deploymentId: number;
  status: OrderStatus | undefined;
};
export type ApprovalInput = {
  mode: "creation" | "acceptance";
  maker: string;
  token: string;
  deploymentId: number;
  amount: bigint;
  balance: bigint | undefined;
  allowance: bigint | undefined;
  known: readonly KnownOrder[];
  now: bigint;
  historyAvailable: boolean;
};
export function approvalPlan(input: ApprovalInput) {
  let total = input.amount;
  let aggregateUnavailable = !input.historyAvailable;
  const seen = new Set<string>();
  for (const entry of input.known) {
    if (
      entry.deploymentId !== input.deploymentId ||
      entry.order.maker.toLowerCase() !== input.maker.toLowerCase() ||
      entry.order.makerToken.toLowerCase() !== input.token.toLowerCase() ||
      seen.has(entry.orderId)
    )
      continue;
    seen.add(entry.orderId);
    if (
      entry.status === 1 ||
      entry.status === 2 ||
      entry.order.expiration <= input.now
    )
      continue;
    if (entry.status === undefined) {
      aggregateUnavailable = true;
      continue;
    }
    total += entry.order.makerAmount;
  }
  return {
    total: aggregateUnavailable ? undefined : total,
    aggregateUnavailable,
    exactTarget:
      !aggregateUnavailable && total <= MAX_UINT256 ? total : undefined,
    maximumTarget: MAX_UINT256,
    balanceSufficient:
      input.balance === undefined ? undefined : input.balance >= input.amount,
    aggregateWarning:
      !aggregateUnavailable &&
      input.balance !== undefined &&
      total > input.balance,
    needsApproval:
      input.allowance === undefined
        ? undefined
        : input.allowance <
          (input.mode === "creation"
            ? aggregateUnavailable || total > MAX_UINT256
              ? MAX_UINT256
              : total
            : input.amount),
  };
}
