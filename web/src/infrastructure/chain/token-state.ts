"use client";

import { z } from "zod";
import { useAccount, useReadContract } from "wagmi";
import { erc20Abi, zeroAddress } from "viem";
import type { Address } from "viem";
import { deployments } from "@/config/deployments";

const refreshPolicy = {
  staleTime: 0,
  refetchOnMount: "always",
  refetchOnWindowFocus: "always",
  refetchInterval: 15_000,
  retry: false,
} as const;

export function useTokenState(
  chainId: number,
  address: Address,
  readMetadata = false,
) {
  const { address: account } = useAccount();
  const deployment = deployments.find((entry) => entry.chainId === chainId);
  // Direct reads also work on fresh Anvil without a Multicall3 deployment.
  const contract = { chainId, address, abi: erc20Abi, batch: false } as const;
  const decimals = useReadContract({
    ...contract,
    functionName: "decimals",
    query: {
      ...refreshPolicy,
      select: (value) => z.number().int().min(0).max(255).parse(value),
    },
  });
  const balance = useReadContract({
    ...contract,
    functionName: "balanceOf",
    args: [account ?? zeroAddress],
    query: { ...refreshPolicy, enabled: !!account },
  });
  const allowance = useReadContract({
    ...contract,
    functionName: "allowance",
    args: [account ?? zeroAddress, deployment?.address ?? zeroAddress],
    query: { ...refreshPolicy, enabled: !!account && !!deployment },
  });
  const name = useReadContract({
    ...contract,
    functionName: "name",
    query: { ...refreshPolicy, enabled: readMetadata },
  });
  const symbol = useReadContract({
    ...contract,
    functionName: "symbol",
    query: { ...refreshPolicy, enabled: readMetadata },
  });
  const refresh = async () => {
    await Promise.all([
      decimals.refetch(),
      ...(readMetadata ? [name.refetch(), symbol.refetch()] : []),
      ...(account ? [balance.refetch()] : []),
      ...(account && deployment ? [allowance.refetch()] : []),
    ]);
  };
  return {
    decimals,
    balance,
    allowance,
    account,
    deployment,
    refresh,
    name,
    symbol,
  };
}
