import { formatAmount } from "@/domain/orders";
import type { DisplayBalance } from "@/infrastructure/storage";

/** Truncate display quantities only; signed amounts and Max remain exact. */
export function formatBalance(balance: DisplayBalance) {
  const amount = BigInt(balance.amount);
  if (balance.decimals <= 2) return formatAmount(amount, balance.decimals);
  const cents = amount / 10n ** BigInt(balance.decimals - 2);
  if (amount > 0n && cents === 0n) return "<0.01";
  return formatAmount(cents, 2);
}
