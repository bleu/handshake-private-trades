"use client";
import { useQueries } from "@tanstack/react-query";
import { useConfig } from "wagmi";
import { readContractQueryOptions } from "wagmi/query";
import { erc20Abi, type Address } from "viem";
import { chainReadPolicy } from "./read-policy";

/** Search metadata for the whole history, including tokens on other pages. */
export function useTokenNames(
  chainId: number,
  addresses: Address[],
  enabled: boolean,
) {
  const config = useConfig();
  const tokens = [...new Set(addresses)];
  const requests = tokens.flatMap((address) =>
    (["name", "symbol"] as const).map((functionName) => ({
      address,
      functionName,
    })),
  );
  const queries = useQueries({
    queries: requests.map(({ address, functionName }) => ({
      ...readContractQueryOptions(config, {
        chainId,
        address,
        abi: erc20Abi,
        functionName,
      }),
      ...chainReadPolicy,
      enabled,
    })),
  });
  return new Map(
    tokens.map((address, index) => [
      address.toLowerCase(),
      [queries[index * 2]?.data, queries[index * 2 + 1]?.data].filter(
        (value): value is string => typeof value === "string",
      ),
    ]),
  );
}
