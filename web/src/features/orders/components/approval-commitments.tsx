import {
  formatAmount,
  type approvalPlan,
  type ApprovalInput,
} from "@/domain/orders";

export function ApprovalCommitments({
  plan,
  decimals,
  historyError,
  mode = "creation",
}: {
  plan: ReturnType<typeof approvalPlan>;
  decimals: number | undefined;
  historyError: string | undefined;
  mode?: ApprovalInput["mode"];
}) {
  return (
    <>
      {plan.aggregateWarning && (
        <p role="note">
          Balance does not cover all known open orders. Funds are not reserved.
          {mode === "acceptance" &&
            " This selected trade is checked individually."}
        </p>
      )}
      <p>
        Orders missing from this browser&apos;s history are not included in
        aggregate commitments.
        {mode === "repair" && " This viewed order is counted once."}
      </p>
      {historyError && <p role="alert">{historyError}</p>}
      {plan.aggregateUnavailable && (
        <p role="alert">
          Aggregate status unavailable. The necessary allowance cannot be
          calculated.
        </p>
      )}
      {!plan.aggregateUnavailable && plan.exactTarget === undefined && (
        <p>
          The necessary total exceeds uint256. Maximum approval remains
          available without guaranteeing coverage of all commitments.
        </p>
      )}
      {plan.exactTarget !== undefined && decimals !== undefined && (
        <p>Necessary allowance: {formatAmount(plan.exactTarget, decimals)}</p>
      )}
    </>
  );
}
