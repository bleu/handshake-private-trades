"use client";
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
    <aside
      aria-live="polite"
      className="mx-auto max-w-5xl rounded border bg-white p-4"
      role={activity.phase === "failed" ? "alert" : "status"}
    >
      <p>{activity.message}</p>
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
    </aside>
  );
}
