import type { Config } from "wagmi";
import { readContractQueryOptions } from "wagmi/query";
import type { QueryClient } from "@tanstack/react-query";
import { erc20Abi, type Address } from "viem";
import { deployments, type Deployment } from "@/config/deployments";
import {
  approvalPlan,
  type ApprovalInput,
  type KnownOrder,
} from "@/domain/orders";
import { readOrderStatus } from "@/infrastructure/chain/order-status";
import { browserStorage } from "@/infrastructure/storage";

export async function readApprovalPlan(
  config: Config,
  client: QueryClient,
  input: {
    deployment: Deployment;
    maker: Address;
    token: Address;
    amount: bigint;
    mode: ApprovalInput["mode"];
  },
) {
  const { deployment, maker, token } = input;
  const history = await browserStorage.readOrders(
    maker,
    deployment.id,
    deployments,
  );
  const known = await Promise.all(
    history.value.map(async (entry): Promise<KnownOrder> => {
      const status = await readOrderStatus(
        config,
        client,
        deployment,
        entry.orderId,
      );
      return {
        order: entry.signed.order,
        orderId: entry.orderId,
        deploymentId: entry.signed.deploymentId,
        status,
      };
    }),
  );
  const contract = {
    chainId: deployment.chainId,
    address: token,
    abi: erc20Abi,
  } as const;
  const [balance, allowance] = await Promise.all([
    client
      .query({
        ...readContractQueryOptions(config, {
          ...contract,
          functionName: "balanceOf",
          args: [maker],
        }),
        staleTime: 0,
      })
      .catch(() => undefined),
    client
      .query({
        ...readContractQueryOptions(config, {
          ...contract,
          functionName: "allowance",
          args: [maker, deployment.address],
        }),
        staleTime: 0,
      })
      .catch(() => undefined),
  ]);
  return approvalPlan({
    ...input,
    deploymentId: deployment.id,
    now: BigInt(Math.floor(Date.now() / 1000)),
    known,
    historyAvailable: !history.error,
    balance,
    allowance,
  });
}
