"use client";
import useSWR from "swr";
import { addressSchema } from "@/domain/orders";
import { useTokenMetadata } from "@/infrastructure/chain/token-metadata";
import {
  COW_LIST_URL,
  fetchCowTokens,
  type ListedToken,
} from "@/infrastructure/http/cow-list";
import { TokenWarning } from "./token-warning";

export function TokenNotice({
  chainId,
  address,
}: {
  chainId: number;
  address: string;
}) {
  const { data, error } = useSWR<ListedToken[], Error>(
    [COW_LIST_URL, chainId] as const,
    fetchCowTokens,
  );
  const listed =
    data &&
    !error &&
    data.some((token) => token.address.toLowerCase() === address.toLowerCase());
  const parsed = addressSchema.safeParse(address);
  const metadata = useTokenMetadata(
    chainId,
    parsed.success ? parsed.data : undefined,
    !listed,
  );
  if (!parsed.success) return null;
  return (
    <TokenWarning
      membership={listed ? "listed" : !data || error ? "unknown" : "unlisted"}
      chainId={chainId}
      address={parsed.data}
      name={
        metadata.name.isSuccess ? metadata.name.data : "Token name unavailable"
      }
      symbol={
        metadata.symbol.isSuccess ? metadata.symbol.data : "Symbol unavailable"
      }
    />
  );
}
