"use client";

import { useState } from "react";
import { browserStorage } from "@/infrastructure/storage";
import { TokenLogo } from "./token-logo";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/domain/orders";
import { useTokenState } from "@/infrastructure/chain/token-state";
import type { ListedToken } from "@/infrastructure/http/cow-list";

export function TokenDetails({
  token,
  onSelect,
  membership = "listed",
  canImport = false,
}: {
  membership?: "listed" | "unlisted" | "unknown";
  canImport?: boolean;
  token: ListedToken;
  onSelect: (token: ListedToken) => void;
}) {
  const {
    decimals,
    balance,
    allowance,
    account,
    deployment,
    refresh,
    name,
    symbol: chainSymbol,
  } = useTokenState(token.chainId, token.address, membership !== "listed");
  const [saved, setSaved] = useState("");
  const readable = decimals.isSuccess && !decimals.isFetching;
  const fallback = `${token.address.slice(0, 6)}…${token.address.slice(-4)}`;
  const symbol =
    token.symbol?.trim() ||
    (chainSymbol.isSuccess && chainSymbol.data.trim()) ||
    fallback;
  const displayName =
    token.name?.trim() || (name.isSuccess && name.data.trim()) || fallback;
  return (
    <div className="space-y-2">
      <TokenLogo key={token.logoURI} source={token.logoURI} symbol={symbol} />
      <p>{displayName}</p>
      {membership !== "listed" && (
        <p role="note">
          {membership === "unknown"
            ? "List membership unknown."
            : "Unlisted token."}{" "}
          Verify the address. Fee-on-transfer tokens are unsupported; received
          amounts are not guaranteed.
        </p>
      )}
      {canImport && (
        <Button
          disabled={!readable}
          onClick={() => {
            const result = browserStorage.saveImport(token);
            setSaved(result.ok ? "Import saved." : result.error);
          }}
        >
          Save import
        </Button>
      )}
      {saved && <p role="status">{saved}</p>}
      <p className="break-all font-mono text-sm">{token.address}</p>
      {readable && <p>Decimals (onchain): {decimals.data}</p>}
      {decimals.isFetching && <p role="status">Reading token decimals…</p>}
      {decimals.isError && (
        <p role="alert">Decimals unavailable. This token cannot be used.</p>
      )}
      {!account && <p>Connect a wallet to see balance and allowance.</p>}
      {account && (
        <>
          <p>
            Balance:{" "}
            {readable && balance.isSuccess && !balance.isFetching
              ? `${formatAmount(balance.data, decimals.data)} ${symbol}`
              : "Unavailable"}
          </p>
          <p>
            Allowance:{" "}
            {readable &&
            deployment &&
            allowance.isSuccess &&
            !allowance.isFetching
              ? `${formatAmount(allowance.data, decimals.data)} ${symbol}`
              : "Unavailable"}
          </p>
          {!deployment && (
            <p>
              Trading is not configured on this network; allowance is
              unavailable.
            </p>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          className="border border-zinc-300 bg-white text-foreground"
          onClick={() => {
            void refresh();
          }}
        >
          Refresh token data
        </Button>
        <Button
          disabled={!readable}
          onClick={() => {
            onSelect({ ...token, name: displayName, symbol });
          }}
        >
          Use token
        </Button>
      </div>
    </div>
  );
}
