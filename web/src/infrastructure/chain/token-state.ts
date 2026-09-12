"use client";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import { useTokenFunding } from "./token-funding";
import { useTokenMetadata } from "./token-metadata";

export function useTokenState(
  chainId: number,
  address: Address | undefined,
  readMetadata = false,
) {
  const { address: account } = useAccount();
  const funding = useTokenFunding(chainId, address, account);
  const metadata = useTokenMetadata(chainId, address, readMetadata);
  const refresh = async () => {
    await Promise.all([funding.refresh(), metadata.refresh()]);
  };
  return { ...funding, ...metadata, account, refresh };
}
