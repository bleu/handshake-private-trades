"use client";
import { useEffect } from "react";
import { useQueries } from "@tanstack/react-query";
import { useAccount, useConfig } from "wagmi";
import { readContractQueryOptions } from "wagmi/query";
import { erc20Abi, zeroAddress } from "viem";
import { z } from "zod";
import type { ListedToken } from "@/infrastructure/http/cow-list";
import { chainReadPolicy } from "@/infrastructure/chain/read-policy";
import { browserStorage } from "@/infrastructure/storage";

import { useCachedBalances } from "./use-cached-balances";
export function useListBalances(chainId: number, tokens: ListedToken[]) {
  const config = useConfig();
  const { address: owner } = useAccount();
  const cached = useCachedBalances(
    chainId,
    tokens.map((token) => token.address),
    owner,
  );
  const balances = useQueries({
    queries: tokens.map((token) => ({
      ...readContractQueryOptions(config, {
        chainId,
        address: token.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner ?? zeroAddress],
      }),
      ...chainReadPolicy,
      enabled: !!owner,
    })),
  });
  const precisions = useQueries({
    queries: tokens.map((token) => ({
      ...readContractQueryOptions(config, {
        chainId,
        address: token.address,
        abi: erc20Abi,
        functionName: "decimals",
      }),
      ...chainReadPolicy,
      select: (value: number) => z.number().int().min(0).max(255).parse(value),
    })),
  });
  useEffect(() => {
    if (!owner) return;
    tokens.forEach((token, index) => {
      const balance = balances[index],
        decimals = precisions[index];
      if (
        balance?.isSuccess &&
        !balance.isFetching &&
        decimals?.isSuccess &&
        !decimals.isFetching
      )
        browserStorage.saveDisplayBalance(chainId, token.address, owner, {
          amount: balance.data.toString(),
          decimals: decimals.data,
        });
    });
  }, [balances, precisions, tokens, chainId, owner]);
  const rows = tokens.map((token, index) => {
    const balance = balances[index],
      decimals = precisions[index];
    const value = owner
      ? balance?.data !== undefined && decimals?.data !== undefined
        ? { amount: balance.data.toString(), decimals: decimals.data }
        : cached[index]
      : undefined;
    return {
      token,
      value,
      pending: !!owner && !value && (balance?.isPending || decimals?.isPending),
      failed: !!owner && !value && (balance?.isError || decimals?.isError),
    };
  });
  return {
    loading: rows.some((row) => row.pending),
    failed: rows.some((row) => row.failed),
    rows: rows.sort((a, b) => {
      if (a.value && b.value) {
        const left = BigInt(a.value.amount) * 10n ** BigInt(b.value.decimals);
        const right = BigInt(b.value.amount) * 10n ** BigInt(a.value.decimals);
        if (left !== right) return left > right ? -1 : 1;
      } else if (a.value || b.value) return a.value ? -1 : 1;
      return (
        (a.token.symbol ?? a.token.address).localeCompare(
          b.token.symbol ?? b.token.address,
        ) || a.token.address.localeCompare(b.token.address)
      );
    }),
  };
}
