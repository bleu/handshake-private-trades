"use client";

import { z } from "zod";
import { useAccount, useReadContract } from "wagmi";
import { erc20Abi, zeroAddress } from "viem";
import type { Address } from "viem";
import { useTokenFunding } from "./token-funding";

import { chainReadPolicy as refreshPolicy } from "./read-policy";

export function useTokenState(
  chainId: number,
  address: Address | undefined,
  readMetadata = false,
) {
  const { address: account } = useAccount();
  const funding = useTokenFunding(chainId, address, account);
  const { balance, allowance, deployment } = funding;
  // Direct reads also work on fresh Anvil without a Multicall3 deployment.
  const contract = {
    chainId,
    address: address ?? zeroAddress,
    abi: erc20Abi,
  } as const;
  const decimals = useReadContract({
    ...contract,
    functionName: "decimals",
    query: {
      ...refreshPolicy,
      enabled: !!address,
      select: (value) => z.number().int().min(0).max(255).parse(value),
    },
  });
  const name = useReadContract({
    ...contract,
    functionName: "name",
    query: { ...refreshPolicy, enabled: !!address && readMetadata },
  });
  const symbol = useReadContract({
    ...contract,
    functionName: "symbol",
    query: { ...refreshPolicy, enabled: !!address && readMetadata },
  });
  const refresh = async () => {
    await Promise.all([
      decimals.refetch(),
      ...(readMetadata ? [name.refetch(), symbol.refetch()] : []),
      funding.refresh(),
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
