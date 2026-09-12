"use client";
import { useConfig } from "wagmi";
import { getAccount, signTypedData } from "wagmi/actions";
import { readContractQueryOptions } from "wagmi/query";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { erc20Abi, bytesToHex, type Address } from "viem";
import {
  creationDraftSchema,
  validateCreation,
  signingOrder,
  orderTypedData,
  encodeOrderLink,
  type CreationDraft,
} from "@/domain/orders";
import { deployments, type Deployment } from "@/config/deployments";
import { browserStorage } from "@/infrastructure/storage";
import {
  ActionError,
  useTransactions,
} from "@/infrastructure/chain/transactions";
import { clearTransientDraft } from "./use-draft";
import { readApprovalPlan } from "./read-approval-plan";

export function useSignOrder({
  deployment,
  maker,
  draft,
  revision,
  decimals,
}: {
  deployment: Deployment;
  maker: Address;
  draft: CreationDraft;
  revision: string | undefined;
  decimals: { maker: number; taker: number };
}) {
  const config = useConfig();
  const client = useQueryClient();
  const router = useRouter();
  const transactions = useTransactions();
  const sign = async () => {
    const captured = creationDraftSchema.parse(draft);
    const completedRevision = revision;
    const result = await transactions.sign({
      chainId: deployment.chainId,
      account: maker,
      execute: async (awaitingWallet) => {
        const requireWallet = () => {
          const account = getAccount(config);
          if (
            account.address?.toLowerCase() !== maker.toLowerCase() ||
            account.chainId !== deployment.chainId
          )
            throw new ActionError(
              "Wallet or network changed. Review the trade before signing.",
            );
        };
        requireWallet();
        const reviewed = validateCreation(captured, maker, decimals);
        const readDecimals = async (address: Address) =>
          client.query({
            ...readContractQueryOptions(config, {
              chainId: deployment.chainId,
              address,
              abi: erc20Abi,
              functionName: "decimals",
            }),
            staleTime: 0,
          });
        const [makerDecimals, takerDecimals] = await Promise.all([
          readDecimals(reviewed.makerToken),
          readDecimals(reviewed.takerToken),
        ]);
        if (
          makerDecimals !== decimals.maker ||
          takerDecimals !== decimals.taker
        )
          throw new ActionError(
            "Token decimals changed. Review the updated amounts before signing.",
          );
        const fresh = await readApprovalPlan(config, client, {
          deployment,
          maker,
          token: reviewed.makerToken,
          amount: reviewed.makerAmount,
          mode: "creation",
        });
        if (fresh.balanceSufficient !== true || fresh.needsApproval !== false)
          throw new ActionError(
            "Balance or allowance is insufficient or unavailable. Refresh and review before signing.",
          );
        requireWallet();
        const order = signingOrder(
          captured,
          maker,
          decimals,
          BigInt(Math.floor(Date.now() / 1000)),
          bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
        );
        awaitingWallet();
        const signature = await signTypedData(config, {
          ...orderTypedData(order, deployment.domain),
          account: maker,
        });
        const signed = { order, signature, deploymentId: deployment.id };
        const payload = await encodeOrderLink(signed, deployments);
        const saved = await browserStorage.saveOrder(
          payload,
          maker,
          deployments,
        );
        const cleanup = completedRevision
          ? browserStorage.clearDraft(deployment.id, completedRevision)
          : { ok: true as const };
        clearTransientDraft(deployment.id, draft);
        return {
          url: saved.url,
          signed,
          draft: captured,
          expired: order.expiration <= BigInt(Math.floor(Date.now() / 1000)),
          ...(saved.ok ? {} : { historyWarning: saved.error }),
          ...(cleanup.ok ? {} : { cleanupWarning: cleanup.error }),
        };
      },
    });
    if (result) router.push(result.url);
  };
  return { sign, busy: transactions.busy };
}
