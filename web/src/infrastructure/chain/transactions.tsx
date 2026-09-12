"use client";
import {
  createContext,
  useEffect,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConfig } from "wagmi";
import { ActionError } from "./action-error";
import { verifyReceiptOutcome } from "./receipt-outcome";
import { getBlockNumber } from "viem/actions";
import {
  pollReceipt,
  receiptSearch,
  type ReceiptSearch,
} from "./receipt-search";
import { useQueryClient } from "@tanstack/react-query";
import type { Address, Hash, TransactionReceipt } from "viem";
import type { CreationDraft, SignedOrderLink } from "@/domain/orders";
export type SignedResult = {
  url: string;
  signed: SignedOrderLink;
  draft: CreationDraft;
  expired: boolean;
  historyWarning?: string;
  cleanupWarning?: string;
};
type SignatureRequest = {
  chainId: number;
  account: Address;
  execute: (awaitingWallet: () => void) => Promise<SignedResult>;
};

export type Transaction = {
  label: string;
  chainId: number;
  account: Address;
  hash?: Hash;
  originalHash?: Hash;
  phase: "checking" | "awaiting-wallet" | "pending" | "confirmed" | "failed";
  message: string;
};
type Request = {
  label: string;
  chainId: number;
  account: Address;
  prepare: () => Promise<{
    send: () => Promise<Hash>;
    verify: () => Promise<void>;
  }>;
};
export { ActionError } from "./action-error";
type Transactions = {
  activity: Transaction | undefined;
  recoveries: Transaction[];
  busy: boolean;
  run: (request: Request) => Promise<void>;
  sign: (request: SignatureRequest) => Promise<SignedResult | undefined>;
  signedResult: SignedResult | undefined;
};
const Context = createContext<Transactions | null>(null);
export function TransactionProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  const client = useQueryClient();
  const [activity, setActivity] = useState<Transaction>();
  const [recoveries, setRecoveries] = useState<Transaction[]>([]);
  const locked = useRef(false);
  const mounted = useRef(true);
  const isMounted = () => mounted.current;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [signedResult, setSignedResult] = useState<SignedResult>();
  const observed = useRef<
    {
      activity: Transaction;
      verify: () => Promise<void>;
      search: ReceiptSearch;
      receipt: TransactionReceipt;
    }[]
  >([]);
  useEffect(() => {
    let active = true;
    const isActive = () => active;
    let checking = false;
    const refresh = async () => {
      if (checking) return;
      checking = true;
      try {
        await Promise.all(
          observed.current.map(async (tracked) => {
            if (!tracked.activity.hash) return;
            try {
              const { receipt } = await pollReceipt(
                config,
                tracked.activity.chainId,
                tracked.search,
              );
              if (!isActive()) return;
              tracked.activity = {
                ...tracked.activity,
                hash: tracked.search.hash,
              };
              if (!receipt) {
                tracked.activity = {
                  ...tracked.activity,
                  phase: "pending",
                  message: `${tracked.activity.label} pending/rechecking. Receipt unavailable.`,
                };
                publish();
                await client.invalidateQueries({ queryKey: ["readContract"] });
              } else if (
                tracked.activity.phase === "pending" ||
                tracked.receipt.blockHash !== receipt.blockHash ||
                tracked.receipt.status !== receipt.status ||
                tracked.receipt.transactionHash !== receipt.transactionHash
              ) {
                tracked.receipt = receipt;
                tracked.activity = {
                  ...tracked.activity,
                  phase: "pending",
                  message: `${tracked.activity.label} pending/rechecking. Receipt changed.`,
                };
                publish();
                await client.invalidateQueries({ queryKey: ["readContract"] });
                await verifyReceiptOutcome(
                  tracked.activity.label,
                  tracked.search.reason,
                  receipt,
                  tracked.verify,
                );
                if (!isActive()) return;
                tracked.activity = {
                  ...tracked.activity,
                  phase: "confirmed",
                  message: `${tracked.activity.label} confirmed.`,
                };
                publish();
              }
            } catch (error) {
              if (isActive()) {
                tracked.activity = {
                  ...tracked.activity,
                  phase: "failed",
                  message:
                    error instanceof ActionError
                      ? error.message
                      : "Receipt observed, but resulting state is unavailable. Refresh before continuing.",
                };
                publish();
              }
            }
            function publish() {
              setActivity((current) =>
                current?.originalHash === tracked.activity.originalHash
                  ? tracked.activity
                  : current,
              );
              setRecoveries(
                observed.current
                  .filter((entry) => entry.activity.phase === "pending")
                  .map((entry) => entry.activity),
              );
            }
          }),
        );
      } finally {
        checking = false;
      }
    };
    const onFocus = () => {
      void refresh();
    };
    const timer = window.setInterval(onFocus, 15000);
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [config, client]);

  const sign = async (request: SignatureRequest) => {
    if (
      locked.current ||
      observed.current.some((entry) => entry.activity.phase === "pending")
    )
      return;
    locked.current = true;
    const current: Transaction = {
      label: "Signature",
      chainId: request.chainId,
      account: request.account,
      phase: "checking",
      message: "Checking signature readiness…",
    };
    setActivity(current);
    try {
      const result = await request.execute(() => {
        setActivity({
          ...current,
          phase: "awaiting-wallet",
          message: "Awaiting wallet: signature.",
        });
      });
      setSignedResult(result);
      setActivity({
        ...current,
        phase: "confirmed",
        message: result.expired
          ? "Signature returned after expiration. The signed link is retained."
          : "Order signed.",
      });
      return result;
    } catch (error) {
      setActivity({
        ...current,
        phase: "failed",
        message:
          error instanceof ActionError
            ? error.message
            : "Signature failed or was rejected. Review the terms and retry.",
      });
    } finally {
      locked.current = false;
    }
  };
  const run = async (request: Request) => {
    if (
      locked.current ||
      observed.current.some((entry) => entry.activity.phase === "pending")
    )
      return;
    locked.current = true;
    let current: Transaction = {
      label: request.label,
      chainId: request.chainId,
      account: request.account,
      phase: "checking",
      message: `Checking ${request.label.toLowerCase()}…`,
    };
    setActivity(current);
    let completed:
      | {
          verify: () => Promise<void>;
          search: ReceiptSearch;
          receipt: TransactionReceipt;
        }
      | undefined;
    try {
      const prepared = await request.prepare();
      const fromBlock = await getBlockNumber(
        config.getClient({ chainId: request.chainId }),
        { cacheTime: 0 },
      ).catch(() => undefined);
      current = {
        ...current,
        phase: "awaiting-wallet",
        message: `Awaiting wallet: ${request.label.toLowerCase()}.`,
      };
      setActivity(current);
      const hash = await prepared.send();
      current = {
        ...current,
        hash,
        originalHash: hash,
        phase: "pending",
        message: `${request.label} pending.`,
      };
      setActivity(current);
      const search = receiptSearch(hash, fromBlock);
      let receipt: TransactionReceipt | undefined;
      while (isMounted() && !receipt) {
        const result = await pollReceipt(config, request.chainId, search);
        if (!isMounted()) return;
        receipt = result.receipt;
        current = {
          ...current,
          hash: search.hash,
          message: result.unavailable
            ? `${request.label} pending/rechecking. Receipt unavailable.`
            : `${request.label} pending.`,
        };
        setActivity(current);
        if (result.unavailable)
          await client.invalidateQueries({ queryKey: ["readContract"] });
        if (!receipt)
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 1000);
          });
      }
      if (!receipt || !isMounted()) return;
      completed = { verify: prepared.verify, search, receipt };
      await client.invalidateQueries({ queryKey: ["readContract"] });
      await verifyReceiptOutcome(
        request.label,
        search.reason,
        receipt,
        prepared.verify,
      );
      current = {
        ...current,
        phase: "confirmed",
        message: `${request.label} confirmed.`,
      };
      setActivity(current);
    } catch (error) {
      current = {
        ...current,
        phase: "failed",
        message:
          error instanceof ActionError
            ? error.message
            : `${request.label} failed or was rejected. Check your wallet, network and token, then retry.`,
      };
      setActivity(current);
      await client.invalidateQueries({ queryKey: ["readContract"] });
    } finally {
      if (completed && isMounted())
        observed.current.push({ ...completed, activity: current });
      locked.current = false;
    }
  };
  const busy =
    recoveries.length > 0 ||
    (activity !== undefined &&
      ["checking", "awaiting-wallet", "pending"].includes(activity.phase));
  return (
    <Context.Provider
      value={{ activity, recoveries, busy, run, sign, signedResult }}
    >
      {children}
    </Context.Provider>
  );
}
export function useTransactions() {
  const value = useContext(Context);
  if (!value) throw new Error("Transaction provider is missing.");
  return value;
}
