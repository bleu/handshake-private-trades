"use client";
import { Spinner } from "@/components/ui/spinner";

import { addressSchema } from "@/domain/orders";
import { zeroAddress } from "viem";
import { useImports } from "./use-imports";
import { Notice } from "@/components/ui/notice";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { useId, useState } from "react";
import useSWR from "swr";
import { useListBalances } from "./use-list-balances";
import { TokenOption } from "./token-option";
import { TokenDetails } from "./token-details";
import type { ListedToken } from "@/infrastructure/http/cow-list";
import { COW_LIST_URL, fetchCowTokens } from "@/infrastructure/http/cow-list";

export function TokenSelector({
  chainId,
  label,
  onSelect,
  mode = "select",
  onImportView,
  importView,
}: {
  importView?: boolean;
  onImportView?: (importing: boolean) => void;
  mode?: "select" | "inspect";
  chainId: number;
  label: string;
  onSelect: (token: ListedToken) => void;
}) {
  const id = useId();
  const [address, setAddress] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(40);
  const [localImporting, setImporting] = useState(false);
  const importing = importView ?? localImporting;
  const [savedToken, setSavedToken] = useState<string>();
  const showImport = (value: boolean) => {
    setImporting(value);
    onImportView?.(value);
  };
  const { data, error, isLoading, isValidating, mutate } = useSWR<
    ListedToken[],
    Error
  >([COW_LIST_URL, chainId] as const, fetchCowTokens);
  const imports = useImports(chainId);
  const [input, setInput] = useState("");
  const [candidate, setCandidate] = useState<ListedToken>();
  const parsedInput = addressSchema.safeParse(input.trim());
  const inputProblem =
    !parsedInput.success || parsedInput.data === zeroAddress
      ? "Enter a nonzero token address."
      : undefined;
  const tokens: ListedToken[] = [
    ...(data ?? []),
    ...imports.value.filter(
      (token) => !data?.some((item) => item.address === token.address),
    ),
  ];
  const listBalances = useListBalances(
    chainId,
    mode === "select" ? tokens : [],
  );
  const orderedTokens =
    mode === "select" ? listBalances.rows.map((row) => row.token) : tokens;
  const searchText = search.trim().toLowerCase();
  const candidates = orderedTokens.filter(
    (token) =>
      !token.symbol ||
      !token.name ||
      `${token.symbol} ${token.name} ${token.address}`
        .toLowerCase()
        .includes(searchText),
  );
  // Unknown identities must be resolved before a search can exclude them.
  // Keep fully described list entries paged to bound balance reads.
  const visibleTokens = searchText
    ? [
        ...candidates
          .filter((token) => token.symbol && token.name)
          .slice(0, limit),
        ...candidates.filter((token) => !token.symbol || !token.name),
      ]
    : candidates.slice(0, limit);
  const selected =
    tokens.find((token) => token.address === address) ?? candidate;
  const membership =
    !data || error
      ? "unknown"
      : data.some((item) => item.address === selected?.address)
        ? "listed"
        : "unlisted";
  return (
    <section className="token-selector space-y-3">
      {isLoading && <Spinner label="Loading CoW token list" />}
      {error && (
        <p role="alert">
          {data
            ? "Token list unavailable. Showing a stale list; membership is unverified."
            : "Token list unavailable. Membership is unknown."}
        </p>
      )}
      {data?.length === 0 && <p>No listed tokens on this network.</p>}
      {mode === "inspect" && (
        <Button
          className="text-action token-refresh"
          disabled={isValidating}
          onClick={() => {
            void mutate().catch(() => undefined);
          }}
        >
          <span aria-hidden="true">↻</span>
          <span className="sr-only">Refresh token list</span>
        </Button>
      )}
      {!importing && (
        <>
          <input
            className="token-search"
            aria-label="Search tokens"
            placeholder="Search name, symbol or address"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
          <div className="token-list-heading" aria-hidden="true">
            <span>Token</span>
            <span>Balance</span>
          </div>
          {mode === "select" && listBalances.loading && (
            <Spinner label="Loading balances" />
          )}
          {mode === "select" && listBalances.failed && (
            <p role="status">Some balances could not be loaded.</p>
          )}
          <div
            role="listbox"
            aria-label={label}
            id={id}
            className="token-options"
            onKeyDown={(event) => {
              const options = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="option"]:not(:disabled)',
                ),
              ];
              const current = options.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                event.key === "ArrowDown"
                  ? Math.min(current + 1, options.length - 1)
                  : event.key === "ArrowUp"
                    ? Math.max(current - 1, 0)
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? options.length - 1
                        : undefined;
              if (next !== undefined) {
                event.preventDefault();
                options[next]?.focus();
              }
            }}
          >
            {!listBalances.loading && (
              <p className="no-tokens">No matching tokens.</p>
            )}
            {(listBalances.loading ? [] : visibleTokens).map((token) => (
              <TokenOption
                key={token.address}
                token={token}
                compact={mode === "select"}
                balance={
                  listBalances.rows.find(
                    (row) => row.token.address === token.address,
                  )?.value
                }
                search={search}
                selected={address === token.address}
                membership={
                  !data || error
                    ? "unknown"
                    : data.some((item) => item.address === token.address)
                      ? "listed"
                      : "unlisted"
                }
                requireReadable={mode === "select"}
                onSelect={
                  mode === "select"
                    ? onSelect
                    : () => {
                        setAddress(token.address);
                        setCandidate(undefined);
                      }
                }
              />
            ))}
          </div>
          {candidates.length > visibleTokens.length && (
            <Button
              onClick={() => {
                setLimit(limit + 40);
              }}
            >
              Show more tokens
            </Button>
          )}
          <Button
            aria-label="Import token"
            className="import-token-action"
            onClick={() => {
              showImport(true);
              setAddress("");
              setCandidate(undefined);
            }}
          >
            Import token
          </Button>
        </>
      )}
      {savedToken && (
        <Notice key={savedToken} kind="success">
          <p>Import saved.</p>
        </Notice>
      )}
      {imports.error && <p role="alert">{imports.error}</p>}
      {importing && (
        <>
          {!onImportView && (
            <Button
              aria-label="Back to tokens"
              className="token-back-button"
              onClick={() => {
                showImport(false);
                setAddress("");
                setCandidate(undefined);
              }}
            >
              <Icon name="arrow-left" />
            </Button>
          )}
          {!onImportView && <h3>Import token</h3>}
          <label className="block" htmlFor={`${id}-address`}>
            Token address
          </label>
          <input
            id={`${id}-address`}
            className="w-full rounded border p-2"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setAddress("");
              setCandidate(undefined);
            }}
          />
          <Button
            disabled={!!inputProblem}
            className={`token-import-submit ${inputProblem && input ? "action-error" : ""}`}
            onClick={() => {
              if (!parsedInput.success || parsedInput.data === zeroAddress)
                return;
              setAddress(parsedInput.data);
              setCandidate({ chainId, address: parsedInput.data });
            }}
          >
            {inputProblem ?? "Import information"}
          </Button>
        </>
      )}
      {selected && (mode === "inspect" || importing) && (
        <TokenDetails
          key={selected.address}
          token={selected}
          onSelect={onSelect}
          selection={mode === "inspect"}
          {...(mode === "select"
            ? {
                onSaved: (token: ListedToken) => {
                  setSavedToken(token.address);
                  showImport(false);
                  setInput("");
                  setAddress("");
                  setCandidate(undefined);
                  setSearch(token.address);
                },
              }
            : {})}
          membership={membership}
          canImport={
            membership !== "listed" &&
            !imports.value.some((token) => token.address === selected.address)
          }
        />
      )}
    </section>
  );
}
