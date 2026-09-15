"use client";
import useSWR from "swr";
import { addressSchema } from "@/domain/orders";
import { useTokenMetadata } from "@/infrastructure/chain/token-metadata";
import {
  COW_LIST_URL,
  fetchCowTokens,
  type ListedToken,
} from "@/infrastructure/http/cow-list";
import { TokenLogo } from "./token-logo";

export function TokenIdentity({
  chainId,
  address,
}: {
  chainId: number;
  address: string;
}) {
  const parsed = addressSchema.safeParse(address);
  const { data } = useSWR<ListedToken[], Error>(
    [COW_LIST_URL, chainId] as const,
    fetchCowTokens,
  );
  const listed = data?.find(
    (token) => token.address.toLowerCase() === address.toLowerCase(),
  );
  const metadata = useTokenMetadata(
    chainId,
    parsed.success ? parsed.data : undefined,
    !listed,
  );
  const symbol =
    listed?.symbol ||
    (metadata.symbol.isSuccess ? metadata.symbol.data : "Token");
  return (
    <span className="token-identity">
      <TokenLogo
        key={listed?.logoURI}
        source={listed?.logoURI}
        symbol={symbol}
      />
      <span>{symbol}</span>
    </span>
  );
}
