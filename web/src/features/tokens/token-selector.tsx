"use client";

import { Button } from "@/components/ui/button";
import { useId, useState } from "react";
import useSWR from "swr";
import { TokenDetails } from "./token-details";
import type { ListedToken } from "@/infrastructure/http/cow-list";
import { COW_LIST_URL, fetchCowTokens } from "@/infrastructure/http/cow-list";

export function TokenSelector({
  chainId,
  label,
  onSelect,
}: {
  chainId: number;
  label: string;
  onSelect: (token: ListedToken) => void;
}) {
  const id = useId();
  const [address, setAddress] = useState("");
  const { data, error, isLoading, isValidating, mutate } = useSWR<
    ListedToken[],
    Error
  >([COW_LIST_URL, chainId] as const, fetchCowTokens);
  const selected = data?.find((token) => token.address === address);
  return (
    <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
      {isLoading && <p role="status">Loading CoW token list…</p>}
      {error && (
        <p role="alert">
          {data
            ? "Token list unavailable. Showing a stale list; membership is unverified."
            : "Token list unavailable. Membership is unknown."}
        </p>
      )}
      {data?.length === 0 && <p>No listed tokens on this network.</p>}
      <Button
        className="border border-zinc-300 bg-white text-foreground"
        disabled={isValidating}
        onClick={() => {
          void mutate().catch(() => undefined);
        }}
      >
        Refresh token list
      </Button>
      <label className="block" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={address}
        onChange={(event) => {
          setAddress(event.target.value);
        }}
        className="block w-full rounded border p-2"
      >
        <option value="">Choose a token</option>
        {data?.map((token) => (
          <option key={token.address} value={token.address}>
            {token.symbol || token.address} — {token.address}
          </option>
        ))}
      </select>
      {selected && (
        <TokenDetails
          key={selected.address}
          token={selected}
          onSelect={onSelect}
        />
      )}
    </section>
  );
}
