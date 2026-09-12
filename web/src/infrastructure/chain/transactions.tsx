"use client";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import type { Address, Hash } from "viem";
import type { CreationDraft, SignedOrderLink } from "@/domain/orders";
export type SignedResult = {
  url: string;
  signed: SignedOrderLink;
  draft: CreationDraft;
  expired: boolean;
  warning?: string;
};
type SignatureRequest = {
  chainId: number;
  account: Address;
  execute: (awaitingWallet: () => void) => Promise<SignedResult>;
};

type Transaction = {
  label: string;
  chainId: number;
  account: Address;
  hash?: Hash;
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
export class ActionError extends Error {}
type Transactions = {
  activity: Transaction | undefined;
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
  const locked = useRef(false);
  const [signedResult, setSignedResult] = useState<SignedResult>();
  const sign = async (request: SignatureRequest) => {
    if (locked.current) return;
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
    if (locked.current) return;
    locked.current = true;
    let current: Transaction = {
      label: request.label,
      chainId: request.chainId,
      account: request.account,
      phase: "checking",
      message: `Checking ${request.label.toLowerCase()}…`,
    };
    setActivity(current);
    try {
      const prepared = await request.prepare();
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
        phase: "pending",
        message: `${request.label} pending.`,
      };
      setActivity(current);
      const receipt = await waitForTransactionReceipt(config, {
        chainId: request.chainId,
        hash,
      });
      if (receipt.status !== "success")
        throw new ActionError(
          `${request.label} reverted. Review the current state and retry.`,
        );
      await client.invalidateQueries({ queryKey: ["readContract"] });
      await prepared.verify();
      current = {
        ...current,
        phase: "confirmed",
        message: `${request.label} confirmed.`,
      };
      setActivity(current);
    } catch (error) {
      setActivity({
        ...current,
        phase: "failed",
        message:
          error instanceof ActionError
            ? error.message
            : `${request.label} failed or was rejected. Check your wallet, network and token, then retry.`,
      });
      await client.invalidateQueries({ queryKey: ["readContract"] });
    } finally {
      locked.current = false;
    }
  };
  const busy =
    activity !== undefined &&
    ["checking", "awaiting-wallet", "pending"].includes(activity.phase);
  return (
    <Context.Provider value={{ activity, busy, run, sign, signedResult }}>
      {children}
    </Context.Provider>
  );
}
export function useTransactions() {
  const value = useContext(Context);
  if (!value) throw new Error("Transaction provider is missing.");
  return value;
}
