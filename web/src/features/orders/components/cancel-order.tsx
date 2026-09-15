"use client";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { OrderTerms } from "./order-terms";
import { Button } from "@/components/ui/button";
import type { Deployment } from "@/config/deployments";
import type { StoredOrder } from "@/infrastructure/storage";
import { useCancelOrder } from "../hooks/use-cancel-order";

export function CancelOrder({
  entry,
  deployment,
  ready,
  now,
  refresh,
}: {
  entry: StoredOrder;
  deployment: Deployment;
  ready: boolean;
  now: bigint;
  refresh: () => Promise<unknown>;
}) {
  const [confirming, setConfirming] = useState(false);
  const { cancel, busy } = useCancelOrder(entry, deployment);
  return (
    <>
      <Button
        className="danger-action primary-action"
        disabled={busy || !ready}
        onClick={() => {
          setConfirming(true);
        }}
      >
        Cancel order
      </Button>
      {confirming && (
        <Dialog
          title="Cancel this order?"
          onClose={() => {
            setConfirming(false);
          }}
        >
          <OrderTerms entry={entry} deployment={deployment} now={now} />
          <p>
            Cancellation takes effect when confirmed onchain. The order may
            still be filled before then.
          </p>
          <Button
            className="danger-action primary-action"
            disabled={busy || !ready}
            onClick={() => {
              void cancel();
            }}
          >
            Confirm cancellation
          </Button>
          <Button
            className="text-action"
            disabled={busy}
            onClick={() => {
              setConfirming(false);
            }}
          >
            Keep order
          </Button>
          <Button
            className="text-action"
            onClick={() => {
              void refresh();
            }}
          >
            Refresh trade
          </Button>
        </Dialog>
      )}
    </>
  );
}
