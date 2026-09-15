"use client";
import type { Address } from "viem";
import { formatAmount } from "@/domain/orders";
import { useDisplayBalance } from "./use-display-balance";

export function TokenBalance({
  chainId,
  address,
}: {
  chainId: number;
  address: Address | undefined;
}) {
  const balance = useDisplayBalance(chainId, address);
  if (!balance) return null;
  return (
    <span>
      Balance: {formatAmount(BigInt(balance.amount), balance.decimals)}
    </span>
  );
}
