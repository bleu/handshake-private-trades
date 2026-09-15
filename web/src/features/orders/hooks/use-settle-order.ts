"use client";
import { useConfig } from "wagmi";
import { getAccount, simulateContract, writeContract } from "wagmi/actions";
import { readContractQueryOptions } from "wagmi/query";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi, type Address } from "viem";
import type { Deployment } from "@/config/deployments";
import { readOrderStatus } from "@/infrastructure/chain/order-status";
import { settlementReadiness } from "@/domain/orders";
import { browserStorage, type StoredOrder } from "@/infrastructure/storage";
import { deployments } from "@/config/deployments";
import {
  ActionError,
  useTransactions,
} from "@/infrastructure/chain/transactions";

export function useSettleOrder(
  entry: StoredOrder,
  deployment: Deployment,
  taker: Address,
  decimals: { maker: number | undefined; taker: number | undefined },
  onHistoryWarning: (warning: string | undefined) => void,
) {
  const config = useConfig();
  const client = useQueryClient();
  const transactions = useTransactions();
  const { order, signature } = entry.signed;
  const requireWallet = () => {
    const wallet = getAccount(config);
    if (
      wallet.address?.toLowerCase() !== taker.toLowerCase() ||
      wallet.chainId !== deployment.chainId
    )
      throw new ActionError(
        "Wallet or network changed. Review the trade before retrying.",
      );
  };
  const status = () =>
    readOrderStatus(config, client, deployment, entry.orderId);
  const funding = async (token: Address, owner: Address) => {
    const contract = {
      chainId: deployment.chainId,
      address: token,
      abi: erc20Abi,
    } as const;
    return Promise.all([
      client.query({
        ...readContractQueryOptions(config, {
          ...contract,
          functionName: "balanceOf",
          args: [owner],
        }),
        staleTime: 0,
      }),
      client.query({
        ...readContractQueryOptions(config, {
          ...contract,
          functionName: "allowance",
          args: [owner, deployment.address],
        }),
        staleTime: 0,
      }),
      client.query({
        ...readContractQueryOptions(config, {
          ...contract,
          functionName: "decimals",
        }),
        staleTime: 0,
      }),
    ]);
  };
  const settle = () =>
    transactions.run({
      label: "Settlement",
      chainId: deployment.chainId,
      account: taker,
      prepare: async () => {
        requireWallet();
        const [current, makerFunding, takerFunding] = await Promise.all([
          status(),
          funding(order.makerToken, order.maker),
          funding(order.takerToken, taker),
        ]);
        const reason = settlementReadiness({
          order,
          caller: taker,
          status: current,
          now: BigInt(Math.floor(Date.now() / 1000)),
          makerBalance: makerFunding[0],
          makerAllowance: makerFunding[1],
          takerBalance: takerFunding[0],
          takerAllowance: takerFunding[1],
        });
        if (reason) throw new ActionError(reason);
        if (
          makerFunding[2] !== decimals.maker ||
          takerFunding[2] !== decimals.taker
        )
          throw new ActionError(
            "Token decimals changed. Review the updated amounts before accepting.",
          );
        const simulation = await simulateContract(config, {
          chainId: deployment.chainId,
          account: taker,
          address: deployment.address,
          abi: deployment.abi,
          functionName: "settle",
          args: [order, signature],
        });
        requireWallet();
        return {
          send: async () => {
            requireWallet();
            return writeContract(config, simulation.request);
          },
          verify: async () => {
            const current = await status();
            if (current !== 1)
              throw new ActionError(
                "Settlement receipt confirmed, but order status is unavailable or changed. Refresh before continuing.",
              );
            const saved = await browserStorage.saveFilledOrder(
              entry.payload,
              taker,
              deployments,
            );
            onHistoryWarning(saved.ok ? undefined : saved.error);
          },
        };
      },
    });
  return { settle, busy: transactions.busy };
}
