"use client";
import { useTradeFragment } from "../hooks/use-trade-fragment";
import { useTransactions } from "@/infrastructure/chain/transactions";

export function SignedTradeResult({
  historyHandled = false,
}: {
  historyHandled?: boolean;
}) {
  const { signedResult } = useTransactions();
  const fragment = useTradeFragment();
  if (!signedResult || signedResult.url !== `/trade#${fragment}`) return null;
  return (
    <div className="signed-result space-y-3">
      {!historyHandled && signedResult.historyWarning && (
        <p role="alert">{signedResult.historyWarning}</p>
      )}
      {signedResult.cleanupWarning && (
        <p role="alert">{signedResult.cleanupWarning}</p>
      )}
      {signedResult.expired && <p>Expired</p>}
    </div>
  );
}
