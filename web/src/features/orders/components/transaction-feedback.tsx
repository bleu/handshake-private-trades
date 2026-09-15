"use client";
import { Notice } from "@/components/ui/notice";
import {
  useTransactions,
  type Transaction,
} from "@/infrastructure/chain/transactions";
export function TransactionFeedback() {
  const { activity, recoveries } = useTransactions();
  return (
    <>
      {activity && <Feedback activity={activity} />}
      {recoveries
        .filter((entry) => entry.originalHash !== activity?.originalHash)
        .map((entry) => (
          <Feedback key={entry.originalHash} activity={entry} />
        ))}
    </>
  );
}
function Feedback({ activity }: { activity: Transaction }) {
  return (
    <Notice
      key={`${activity.phase}:${activity.message}:${activity.hash ?? ""}`}
      kind={
        activity.phase === "confirmed"
          ? "success"
          : activity.phase === "failed"
            ? "error"
            : "info"
      }
    >
      <p>{activity.message}</p>
      <details className="transaction-details">
        <summary>Transaction details</summary>
        <p className="break-all text-sm">
          Account: {activity.account} · Chain: {activity.chainId}
        </p>
        {activity.originalHash && activity.originalHash !== activity.hash && (
          <p className="break-all">
            Original transaction: {activity.originalHash}
          </p>
        )}
        {activity.hash &&
          (activity.chainId === 100 ? (
            <a
              className="break-all underline"
              href={`https://gnosisscan.io/tx/${activity.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              {activity.hash}
            </a>
          ) : (
            <p className="break-all">Transaction: {activity.hash}</p>
          ))}
      </details>
    </Notice>
  );
}
