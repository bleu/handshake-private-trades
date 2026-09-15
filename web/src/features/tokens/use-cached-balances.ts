"use client";
import { useMemo, useSyncExternalStore } from "react";
import type { Address } from "viem";
import {
  browserStorage,
  subscribeStorage,
  type DisplayBalance,
} from "@/infrastructure/storage";

const empty: readonly (DisplayBalance | undefined)[] = [];
function balanceReader(
  chainId: number,
  key: string,
  owner: Address | undefined,
) {
  let serialized = "";
  let previous = empty;
  return () => {
    const next = key
      .split(",")
      .filter(Boolean)
      .map((address) =>
        owner
          ? browserStorage.readDisplayBalance(chainId, address, owner)
          : undefined,
      );
    const current = JSON.stringify(next);
    if (current !== serialized) {
      serialized = current;
      previous = next;
    }
    return previous;
  };
}
export function useCachedBalances(
  chainId: number,
  addresses: readonly Address[],
  owner: Address | undefined,
) {
  const key = addresses.join(",");
  const read = useMemo(
    () => balanceReader(chainId, key, owner),
    [chainId, key, owner],
  );
  return useSyncExternalStore(subscribeStorage, read, () => empty);
}
