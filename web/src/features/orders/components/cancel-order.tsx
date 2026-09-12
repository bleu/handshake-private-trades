"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Deployment } from "@/config/deployments";
import type { StoredOrder } from "@/infrastructure/storage";
import { useCancelOrder } from "../hooks/use-cancel-order";

export function CancelOrder({
  entry,
  deployment,
  ready,
}: {
  entry: StoredOrder;
  deployment: Deployment;
  ready: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const { cancel, busy } = useCancelOrder(entry, deployment);
  return confirming ? (
    <section
      aria-label="Confirm cancellation"
      className="space-y-2 rounded border p-3"
    >
      <h2>Cancel this order?</h2>
      <p className="break-all">Order: {entry.orderId}</p>
      <p>
        Cancellation takes effect when confirmed onchain. The order may still be
        filled before then.
      </p>
      <Button
        disabled={busy || !ready}
        onClick={() => {
          void cancel();
        }}
      >
        Confirm cancellation
      </Button>
      <Button
        disabled={busy}
        onClick={() => {
          setConfirming(false);
        }}
      >
        Keep order
      </Button>
    </section>
  ) : (
    <Button
      disabled={busy || !ready}
      onClick={() => {
        setConfirming(true);
      }}
    >
      Cancel order
    </Button>
  );
}
