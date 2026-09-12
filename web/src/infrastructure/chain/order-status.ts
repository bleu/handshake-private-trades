"use client";
import { useQueries, type QueryClient } from "@tanstack/react-query";
import { useConfig, type Config } from "wagmi";
import { readContractQueryOptions } from "wagmi/query";
import { z } from "zod";
import type { Deployment } from "@/config/deployments";
import { chainReadPolicy } from "./read-policy";

const statusSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
function statusOptions(
  config: Config,
  deployment: Deployment,
  id: `0x${string}`,
) {
  return readContractQueryOptions(config, {
    chainId: deployment.chainId,
    address: deployment.address,
    abi: deployment.abi,
    functionName: "orderStatus",
    args: [id],
  });
}

/** Fresh, validated chain state. A failed read never falls back to cached status. */
export async function readOrderStatus(
  config: Config,
  client: QueryClient,
  deployment: Deployment,
  id: `0x${string}`,
) {
  return client
    .query({ ...statusOptions(config, deployment, id), staleTime: 0 })
    .then((status) => statusSchema.parse(status))
    .catch(() => undefined);
}

export function useOrderStatuses(
  deployment: Deployment,
  ids: readonly `0x${string}`[],
) {
  const config = useConfig();
  return useQueries({
    queries: ids.map((id) => ({
      ...statusOptions(config, deployment, id),
      ...chainReadPolicy,
      select: (status: number) => statusSchema.parse(status),
    })),
  });
}
