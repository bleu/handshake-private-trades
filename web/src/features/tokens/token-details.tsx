"use client";

import { TokenLogo } from "./token-logo";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/domain/orders";
import { useTokenState } from "@/infrastructure/chain/token-state";
import type { ListedToken } from "@/infrastructure/http/cow-list";

export function TokenDetails({
  token,
  onSelect,
}: {
  token: ListedToken;
  onSelect: (token: ListedToken) => void;
}) {
  const { decimals, balance, allowance, account, deployment, refresh } =
    useTokenState(token.chainId, token.address);
  const readable = decimals.isSuccess && !decimals.isFetching;
  const fallback = `${token.address.slice(0, 6)}…${token.address.slice(-4)}`;
  const symbol = token.symbol?.trim() || fallback;
  return (
    <div className="space-y-2">
      <TokenLogo key={token.logoURI} source={token.logoURI} symbol={symbol} />
      <p>{token.name?.trim() || fallback}</p>
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
            onSelect(token);
          }}
        >
          Use token
        </Button>
      </div>
    </div>
  );
}
