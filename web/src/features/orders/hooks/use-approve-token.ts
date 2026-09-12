"use client";
import { useConfig } from "wagmi";
import { getAccount, writeContract } from "wagmi/actions";
import { readContractQueryOptions } from "wagmi/query";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi, type Address } from "viem";
import type { Deployment } from "@/config/deployments";
import type { ApprovalInput, KnownOrder } from "@/domain/orders";
import {
  ActionError,
  useTransactions,
} from "@/infrastructure/chain/transactions";
import { readApprovalPlan } from "./read-approval-plan";
export type ApprovalChoice = "necessary" | "maximum";
export function useApproveToken({
  deployment,
  maker,
  token,
  amount,
  decimals,
  mode,
  viewed,
}: {
  deployment: Deployment;
  maker: Address;
  token: Address;
  amount: bigint;
  decimals: number;
  mode: ApprovalInput["mode"];
  viewed?: KnownOrder;
}) {
  const config = useConfig();
  const client = useQueryClient();
  const transactions = useTransactions();
  const requireWallet = () => {
    const wallet = getAccount(config);
    if (
      wallet.address?.toLowerCase() !== maker.toLowerCase() ||
      wallet.chainId !== deployment.chainId
    )
      throw new ActionError(
        "Wallet or network changed. Review the trade before retrying.",
      );
  };

  const approve = (choice: ApprovalChoice) => {
    return transactions.run({
      label: "Approval",
      chainId: deployment.chainId,
      account: maker,
      prepare: async () => {
        requireWallet();
        const fresh = await readApprovalPlan(config, client, {
          deployment,
          maker,
          token,
          amount,
          mode,
          ...(viewed ? { viewed } : {}),
        });
        if (fresh.balanceSufficient !== true)
          throw new ActionError(
            "Balance is insufficient or unavailable. Refresh and review before approving.",
          );
        if (fresh.needsApproval === false)
          throw new ActionError(
            "Allowance is already sufficient. No approval was sent.",
          );
        const target =
          choice === "maximum" ? fresh.maximumTarget : fresh.exactTarget;
        if (target === undefined || fresh.needsApproval === undefined)
          throw new ActionError(
            "Required approval data is unavailable. Refresh and retry.",
          );
        const freshDecimals = await client.query({
          ...readContractQueryOptions(config, {
            chainId: deployment.chainId,
            address: token,
            abi: erc20Abi,
            functionName: "decimals",
          }),
          staleTime: 0,
        });
        if (freshDecimals !== decimals)
          throw new ActionError(
            "Token decimals changed. Review the updated amounts before approving.",
          );
        requireWallet();
        return {
          send: async () => {
            requireWallet();
            return writeContract(config, {
              chainId: deployment.chainId,
              account: maker,
              address: token,
              abi: erc20Abi,
              functionName: "approve",
              args: [deployment.address, target],
            });
          },
          verify: async () => {
            const allowance = await client
              .query({
                ...readContractQueryOptions(config, {
                  chainId: deployment.chainId,
                  address: token,
                  abi: erc20Abi,
                  functionName: "allowance",
                  args: [maker, deployment.address],
                }),
                staleTime: 0,
              })
              .catch(() => undefined);
            if (allowance === undefined)
              throw new ActionError(
                "Approval confirmed, but allowance is unavailable. Refresh before continuing.",
              );
            if (allowance < target)
              throw new ActionError(
                "Approval confirmed, but allowance is still insufficient. This token's direct approval did not establish the requested allowance.",
              );
          },
        };
      },
    });
  };
  return { approve, busy: transactions.busy };
}
