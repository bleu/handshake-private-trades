"use client";
import { useRouter } from "next/navigation";
import { useTradeFragment } from "../hooks/use-trade-fragment";
import { beginDraft } from "../hooks/use-draft";
import { CopyTradeLink } from "./copy-trade-link";
import { Button } from "@/components/ui/button";
import { useTransactions } from "@/infrastructure/chain/transactions";

export function SignedTradeResult({
  historyHandled = false,
}: {
  historyHandled?: boolean;
}) {
  const { signedResult } = useTransactions();
  const router = useRouter();
  const fragment = useTradeFragment();
  if (!signedResult || signedResult.url !== `/trade#${fragment}`) return null;
  return (
    <section className="space-y-3">
      {!historyHandled && signedResult.historyWarning && (
        <p role="alert">{signedResult.historyWarning}</p>
      )}
      {signedResult.cleanupWarning && (
        <p role="alert">{signedResult.cleanupWarning}</p>
      )}
      {signedResult.expired && <p>Expired</p>}
      <CopyTradeLink payload={fragment} />
      <Button
        onClick={() => {
          beginDraft(signedResult.signed.deploymentId, signedResult.draft);
          router.push("/");
        }}
      >
        Create new order
      </Button>
    </section>
  );
}
