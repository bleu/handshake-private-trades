"use client";
import useSWR from "swr";
import {
  COW_LIST_URL,
  fetchCowTokens,
  type ListedToken,
} from "@/infrastructure/http/cow-list";

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
  if (
    data &&
    !error &&
    data.some((token) => token.address.toLowerCase() === address.toLowerCase())
  )
    return null;
  return (
    <p role="note">
      {!data || error ? "List membership unknown." : "Unlisted token."} Verify
      the address. Fee-on-transfer tokens are unsupported; received amounts are
      not guaranteed.
    </p>
  );
}
