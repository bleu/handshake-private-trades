import type { TransactionReceipt } from "viem";
import { ActionError } from "./action-error";
import type { ReceiptSearch } from "./receipt-search";

/** Apply the same receipt/outcome policy during initial inclusion and recovery. */
export async function verifyReceiptOutcome(
  label: string,
  reason: ReceiptSearch["reason"],
  receipt: TransactionReceipt,
  verify: () => Promise<void>,
) {
  if (reason === "cancelled")
    throw new ActionError(
      "Wallet transaction cancelled. The order was not cancelled.",
    );
  if (reason === "replaced")
    throw new ActionError(
      "Wallet transaction replaced with a different action. Review the resulting order and token state before retrying.",
    );
  if (receipt.status !== "success")
    throw new ActionError(
      `${label} reverted. Review the current state and retry.`,
    );
  await verify();
}
