"use client";
import { useEffect, useState } from "react";
import { deployments } from "@/config/deployments";
import {
  browserStorage,
  subscribeStorage,
  type ReadResult,
  type StoredOrder,
} from "@/infrastructure/storage";

export function useMakerHistory(
  maker: string,
  deploymentId: number,
  includeFilled = false,
) {
  const scope = `${String(deploymentId)}:${maker.toLowerCase()}:${String(includeFilled)}`;
  const [result, setResult] = useState<{
    scope: string;
    data: ReadResult<StoredOrder[]>;
  }>();
  useEffect(() => {
    let active = true;
    let generation = 0;
    const read = () => {
      const current = ++generation;
      void browserStorage
        .readOrders(maker, deploymentId, deployments, includeFilled)
        .then((data) => {
          if (active && current === generation) setResult({ scope, data });
        });
    };
    const unsubscribe = subscribeStorage(read);
    read();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [scope, maker, deploymentId, includeFilled]);
  return {
    orders: result?.scope === scope ? result.data.value : [],
    available: result?.scope === scope && !result.data.error,
    error: result?.scope === scope ? result.data.error : undefined,
  };
}
