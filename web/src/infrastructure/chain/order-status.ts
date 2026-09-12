"use client";
import { useQueries } from "@tanstack/react-query";
import { useConfig } from "wagmi";
import { readContractQueryOptions } from "wagmi/query";
import { z } from "zod";
import type { Deployment } from "@/config/deployments";
import { chainReadPolicy } from "./read-policy";

const statusSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export function useOrderStatuses(
  deployment: Deployment,
  ids: readonly `0x${string}`[],
) {
  const config = useConfig();
  return useQueries({
    queries: ids.map((id) => ({
      ...readContractQueryOptions(config, {
        chainId: deployment.chainId,
        address: deployment.address,
        abi: deployment.abi,
        functionName: "orderStatus",
        args: [id],
      }),
      ...chainReadPolicy,
      select: (status: number) => statusSchema.parse(status),
    })),
  });
}
