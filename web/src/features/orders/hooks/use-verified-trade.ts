"use client";
import { useEffect, useState } from "react";
import { decodeOrderLink, orderId } from "@/domain/orders";
import { deployments } from "@/config/deployments";
import type { StoredOrder } from "@/infrastructure/storage";

export function useVerifiedTrade(payload: string) {
  const [result, setResult] = useState<{
    payload: string;
    entry?: StoredOrder;
    error?: string;
  }>();
  useEffect(() => {
    let active = true;
    if (payload)
      void decodeOrderLink(payload, deployments).then(
        (signed) => {
          const deployment = deployments.find(
            (entry) => entry.id === signed.deploymentId,
          );
          if (active && deployment)
            setResult({
              payload,
              entry: {
                payload,
                signed,
                orderId: orderId(signed.order, deployment.domain),
              },
            });
        },
        () => {
          if (active)
            setResult({
              payload,
              error:
                "Invalid or unsupported trade link. Check the complete link with its maker.",
            });
        },
      );
    return () => {
      active = false;
    };
  }, [payload]);
  return result?.payload === payload ? result : undefined;
}
