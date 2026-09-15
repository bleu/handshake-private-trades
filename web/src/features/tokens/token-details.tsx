"use client";
import { Spinner } from "@/components/ui/spinner";

import { Notice } from "@/components/ui/notice";
import { useState } from "react";
import { browserStorage } from "@/infrastructure/storage";
import { TokenWarning } from "./token-warning";
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
  onSaved,
  selection = true,
}: {
  onSaved?: (token: ListedToken) => void;
  selection?: boolean;
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
  const [saveAttempt, setSaveAttempt] = useState(0);
  const readable = decimals.isSuccess;
  const fallback = `${token.address.slice(0, 6)}…${token.address.slice(-4)}`;
  const symbol =
    token.symbol?.trim() ||
    (chainSymbol.isSuccess && chainSymbol.data.trim()) ||
    fallback;
  const displayName =
    token.name?.trim() || (name.isSuccess && name.data.trim()) || fallback;
  return (
    <div role="region" aria-label="Token details" className="space-y-2">
      <TokenLogo key={token.logoURI} source={token.logoURI} symbol={symbol} />
      <p>{displayName}</p>
      <TokenWarning
        membership={membership}
        chainId={token.chainId}
        address={token.address}
        name={displayName}
        symbol={symbol}
      />
      {canImport && (
        <Button
          className="token-import-submit"
          disabled={!readable}
          onClick={() => {
            setSaveAttempt((attempt) => attempt + 1);
            const result = browserStorage.saveImport(token);
            setSaved(result.ok ? "Import saved." : result.error);
            if (result.ok) onSaved?.({ ...token, name: displayName, symbol });
          }}
        >
          Save
        </Button>
      )}
      {saved && (
        <Notice
          key={saveAttempt}
          kind={saved === "Import saved." ? "success" : "error"}
        >
          <p>{saved}</p>
        </Notice>
      )}
      <p className="break-all font-mono text-sm">{token.address}</p>
      {readable && <p>Decimals (onchain): {decimals.data}</p>}
      {decimals.isPending && <Spinner label="Reading token decimals" />}
      {decimals.isError && (
        <p role="alert">Decimals unavailable. This token cannot be used.</p>
      )}
      {!account && <p>Connect a wallet to see balance and allowance.</p>}
      {account && (
        <>
          <p>
            Balance:{" "}
            {readable && balance.isSuccess
              ? `${formatAmount(balance.data, decimals.data)} ${symbol}`
              : "Unavailable"}
          </p>
          <p>
            Allowance:{" "}
            {readable && deployment && allowance.isSuccess
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
        {selection && (
          <Button
            className="token-import-submit"
            disabled={!readable}
            onClick={() => {
              onSelect({ ...token, name: displayName, symbol });
            }}
          >
            Use token
          </Button>
        )}
      </div>
    </div>
  );
}
