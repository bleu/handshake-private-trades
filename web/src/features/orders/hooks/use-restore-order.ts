"use client";
import { useEffect, useState } from "react";
import { deployments } from "@/config/deployments";
import { browserStorage, type StoredOrder } from "@/infrastructure/storage";

export function useRestoreOrder(
  entry: StoredOrder,
  account: string | undefined,
) {
  const maker =
    account?.toLowerCase() === entry.signed.order.maker.toLowerCase()
      ? entry.signed.order.maker
      : undefined;
  const [result, setResult] = useState<{ payload: string; message: string }>();
  useEffect(() => {
    let active = true;
    if (maker)
      void browserStorage.saveOrder(entry.payload, maker, deployments).then(
        (saved) => {
          if (active)
            setResult({
              payload: entry.payload,
              message: saved.ok
                ? "Order saved in your local maker history."
                : saved.error,
            });
        },
        () => {
          if (active)
            setResult({
              payload: entry.payload,
              message: "Order history could not be saved. Keep this link.",
            });
        },
      );
    return () => {
      active = false;
    };
  }, [entry.payload, maker]);
  return maker && result?.payload === entry.payload
    ? result.message
    : undefined;
}
