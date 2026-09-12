import type { OrderStatus } from "./readiness.ts";

export function tradeStatus(
  status: OrderStatus | undefined,
  expiration: bigint,
  now: bigint,
) {
  if (status === 1) return "Filled";
  if (status === 2) return "Cancelled";
  if (status === undefined) return "Status unavailable";
  return now >= expiration ? "Expired" : "Open";
}
