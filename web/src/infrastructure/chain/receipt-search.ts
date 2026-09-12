import type { Config } from "wagmi";
import {
  TransactionReceiptNotFoundError,
  type Hash,
  type Transaction,
  type TransactionReceipt,
} from "viem";
import {
  getBlock,
  getBlockNumber,
  getTransaction,
  getTransactionCount,
  getTransactionReceipt,
} from "viem/actions";

export type ReceiptSearch = {
  originalHash: Hash;
  hash: Hash;
  original: Transaction | undefined;
  fromBlock: bigint | undefined;
  reason: "repriced" | "cancelled" | "replaced" | undefined;
};

export function receiptSearch(
  hash: Hash,
  fromBlock: bigint | undefined,
): ReceiptSearch {
  return {
    originalHash: hash,
    hash,
    original: undefined,
    fromBlock,
    reason: undefined,
  };
}

// Retain the original nonce even if a replaced hash becomes unqueryable. Locate
// nonce consumption on the current canonical chain rather than trusting scanned
// blocks forever: an RPC outage or reorg may put the replacement behind a cursor.
export async function pollReceipt(
  config: Config,
  chainId: number,
  search: ReceiptSearch,
): Promise<{ receipt: TransactionReceipt | undefined; unavailable: boolean }> {
  const client = config.getClient({ chainId });
  const readReceipt = async () =>
    getTransactionReceipt(client, { hash: search.hash }).catch(
      (error: unknown) => {
        if (error instanceof TransactionReceiptNotFoundError) return undefined;
        throw error;
      },
    );
  try {
    search.original ??= await getTransaction(client, {
      hash: search.originalHash,
    }).catch(() => undefined);
    const receipt = await readReceipt();
    if (receipt) return { receipt, unavailable: false };
    const original = search.original;
    if (!original) return { receipt: undefined, unavailable: true };
    const countAt = (blockNumber: bigint) =>
      getTransactionCount(client, { address: original.from, blockNumber });
    const latest = await getBlockNumber(client, { cacheTime: 0 });
    if ((await countAt(latest)) <= original.nonce)
      return { receipt: undefined, unavailable: false };
    let upper = latest;
    let lower =
      search.fromBlock !== undefined && search.fromBlock < latest
        ? search.fromBlock
        : latest;
    // A deep reorg can consume the nonce before the original submission height.
    // Find a recent lower bound before binary-searching the consuming block.
    let distance = 1n;
    while ((await countAt(lower)) > original.nonce) {
      if (lower === 0n) return { receipt: undefined, unavailable: true };
      upper = lower;
      lower = lower > distance ? lower - distance : 0n;
      distance *= 2n;
    }
    while (upper - lower > 1n) {
      const middle = (upper + lower) / 2n;
      if ((await countAt(middle)) > original.nonce) upper = middle;
      else lower = middle;
    }
    const block = await getBlock(client, {
      blockNumber: upper,
      includeTransactions: true,
    });
    const candidate = block.transactions.find(
      (transaction) =>
        transaction.from.toLowerCase() === original.from.toLowerCase() &&
        transaction.nonce === original.nonce,
    );
    if (!candidate) return { receipt: undefined, unavailable: true };
    search.hash = candidate.hash;
    search.reason =
      candidate.hash === search.originalHash
        ? undefined
        : candidate.to === original.to &&
            candidate.value === original.value &&
            candidate.input === original.input
          ? "repriced"
          : candidate.from === candidate.to && candidate.value === 0n
            ? "cancelled"
            : "replaced";
    const found = await readReceipt();
    return { receipt: found, unavailable: !found };
  } catch {
    return { receipt: undefined, unavailable: true };
  }
}
