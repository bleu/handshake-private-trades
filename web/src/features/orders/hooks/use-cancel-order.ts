"use client";
import { useConfig } from "wagmi";
import { getAccount, simulateContract, writeContract } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import type { Deployment } from "@/config/deployments";
import { tradeStatus } from "@/domain/orders";
import type { StoredOrder } from "@/infrastructure/storage";
import { readOrderStatus } from "@/infrastructure/chain/order-status";
import {
  ActionError,
  useTransactions,
} from "@/infrastructure/chain/transactions";

export function useCancelOrder(entry: StoredOrder, deployment: Deployment) {
  const config = useConfig();
  const client = useQueryClient();
  const transactions = useTransactions();
  const { order } = entry.signed;
  const requireMaker = () => {
    const wallet = getAccount(config);
    if (
      wallet.address?.toLowerCase() !== order.maker.toLowerCase() ||
      wallet.chainId !== deployment.chainId
    )
      throw new ActionError(
        "Switch to the maker wallet and trade network before cancelling.",
      );
  };
  const cancel = () =>
    transactions.run({
      label: "Cancellation",
      chainId: deployment.chainId,
      account: order.maker,
      prepare: async () => {
        requireMaker();
        const status = await readOrderStatus(
          config,
          client,
          deployment,
          entry.orderId,
        );
        if (
          tradeStatus(
            status,
            order.expiration,
            BigInt(Math.floor(Date.now() / 1000)),
          ) !== "Open"
        )
          throw new ActionError(
            "Order is no longer open or its status is unavailable. No cancellation was sent.",
          );
        const simulation = await simulateContract(config, {
          chainId: deployment.chainId,
          account: order.maker,
          address: deployment.address,
          abi: deployment.abi,
          functionName: "cancel",
          args: [order],
        });
        requireMaker();
        return {
          send: async () => {
            requireMaker();
            return writeContract(config, simulation.request);
          },
          verify: async () => {
            if (
              (await readOrderStatus(
                config,
                client,
                deployment,
                entry.orderId,
              )) !== 2
            )
              throw new ActionError(
                "Cancellation receipt confirmed, but order status is unavailable or changed. Refresh before continuing.",
              );
          },
        };
      },
    });
  return { cancel, busy: transactions.busy };
}
