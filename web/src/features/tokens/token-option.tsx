"use client";
import { formatBalance } from "./format-balance";
import type { DisplayBalance } from "@/infrastructure/storage";
import { formatAmount } from "@/domain/orders";
import type { ListedToken } from "@/infrastructure/http/cow-list";
import { useTokenState } from "@/infrastructure/chain/token-state";
import { TokenLogo } from "./token-logo";

export function TokenOption({
  token,
  compact = false,
  balance,
  search,
  selected,
  membership,
  onSelect,
  requireReadable = true,
}: {
  compact?: boolean;
  balance: DisplayBalance | undefined;
  requireReadable?: boolean;
  token: ListedToken;
  search: string;
  selected: boolean;
  membership: "listed" | "unlisted" | "unknown";
  onSelect: (token: ListedToken) => void;
}) {
  const state = useTokenState(
    token.chainId,
    token.address,
    !token.symbol || !token.name,
  );
  const symbol =
    token.symbol ||
    (state.symbol.isSuccess
      ? state.symbol.data
      : `${token.address.slice(0, 6)}…${token.address.slice(-4)}`);
  const name = token.name || (state.name.isSuccess ? state.name.data : "Token");
  if (
    !`${symbol} ${name} ${token.address}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  )
    return null;
  return (
    <button
      type="button"
      role="option"
      aria-label={compact ? `${symbol} ${token.address}` : undefined}
      title={compact ? token.address : undefined}
      aria-selected={selected}
      className="token-option"
      disabled={requireReadable && !state.decimals.isSuccess}
      onClick={() => {
        onSelect({ ...token, symbol, name });
      }}
    >
      <TokenLogo key={token.logoURI} source={token.logoURI} symbol={symbol} />
      <span>
        <strong>{symbol}</strong>
        {!compact && (
          <>
            <small>{name}</small>
            <small>{token.address}</small>
            {membership !== "listed" && (
              <small>
                {membership === "unknown"
                  ? "Membership unknown"
                  : "Outside whitelist"}
              </small>
            )}
          </>
        )}
      </span>
      <span>
        {compact
          ? balance
            ? formatBalance(balance)
            : null
          : state.balance.isSuccess &&
              !state.balance.isFetching &&
              state.decimals.isSuccess &&
              !state.decimals.isFetching
            ? formatAmount(state.balance.data, state.decimals.data)
            : "—"}
      </span>
    </button>
  );
}
