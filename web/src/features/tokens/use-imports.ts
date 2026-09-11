"use client";

import { useMemo, useSyncExternalStore } from "react";
import { browserStorage, subscribeStorage } from "@/infrastructure/storage";
import type { ReadResult, TokenImport } from "@/infrastructure/storage";
const empty: ReadResult<TokenImport[]> = { value: [] };
function importsReader(chainId: number) {
  let previous = "";
  let cached = empty;
  return () => {
    const next = browserStorage.readImports(chainId);
    const serialized = JSON.stringify(next);
    if (serialized !== previous) {
      previous = serialized;
      cached = next;
    }
    return cached;
  };
}

export function useImports(chainId: number) {
  const read = useMemo(() => importsReader(chainId), [chainId]);
  return useSyncExternalStore(subscribeStorage, read, () => empty);
}
