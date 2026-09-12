"use client";
import { useRouter } from "next/navigation";
import { useTradeFragment } from "../hooks/use-trade-fragment";
import { beginDraft } from "../hooks/use-draft";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { useTransactions } from "@/infrastructure/chain/transactions";

const subscribe = () => () => {};
const originSnapshot = () => window.location.origin;
export function SignedTradeResult({
  historyHandled = false,
}: {
  historyHandled?: boolean;
}) {
  const { signedResult } = useTransactions();
  const router = useRouter();
  const fragment = useTradeFragment();
  const origin = useSyncExternalStore(subscribe, originSnapshot, () => "");
  const [copied, setCopied] = useState("");
  if (!signedResult || signedResult.url !== `/trade#${fragment}`) return null;
  const link = origin + signedResult.url;
  return (
    <section className="space-y-3">
      {!historyHandled && signedResult.historyWarning && (
        <p role="alert">{signedResult.historyWarning}</p>
      )}
      {signedResult.cleanupWarning && (
        <p role="alert">{signedResult.cleanupWarning}</p>
      )}
      {signedResult.expired && <p>Expired</p>}
      <label className="block">
        Trade link
        <input
          className="block w-full rounded border p-2"
          readOnly
          value={link}
        />
      </label>
      <Button
        onClick={() => {
          void navigator.clipboard.writeText(link).then(
            () => {
              setCopied("Link copied.");
            },
            () => {
              setCopied("Copy failed. Select and copy the link above.");
            },
          );
        }}
      >
        Copy link
      </Button>
      <Button
        onClick={() => {
          beginDraft(signedResult.signed.deploymentId, signedResult.draft);
          router.push("/");
        }}
      >
        Create new order
      </Button>
      {copied && <p role="status">{copied}</p>}
    </section>
  );
}
