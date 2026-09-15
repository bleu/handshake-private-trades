"use client";
import { useEffect } from "react";
import type { Address } from "viem";
import { browserStorage } from "@/infrastructure/storage";
import { useCachedBalances } from "./use-cached-balances";
import { useTokenState } from "@/infrastructure/chain/token-state";

/** Cached quantities are display-only; they never enter transaction queries or readiness. */
export function useDisplayBalance(
  chainId: number,
  address: Address | undefined,
) {
  const state = useTokenState(chainId, address);
  const owner = state.account;
  const cached = useCachedBalances(chainId, address ? [address] : [], owner)[0];
  const amount =
    state.balance.isSuccess && !state.balance.isFetching
      ? state.balance.data
      : undefined;
  const decimals =
    state.decimals.isSuccess && !state.decimals.isFetching
      ? state.decimals.data
      : undefined;
  useEffect(() => {
    if (address && owner && amount !== undefined && decimals !== undefined)
      browserStorage.saveDisplayBalance(chainId, address, owner, {
        amount: amount.toString(),
        decimals,
      });
  }, [chainId, address, owner, amount, decimals]);
  if (!owner) return undefined;
  return state.balance.data !== undefined && state.decimals.data !== undefined
    ? { amount: state.balance.data.toString(), decimals: state.decimals.data }
    : cached;
}
