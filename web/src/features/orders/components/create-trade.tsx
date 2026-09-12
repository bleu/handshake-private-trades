"use client";

import { useDraft } from "../hooks/use-draft";
import { useState } from "react";
import { useAccount, useChains } from "wagmi";
import { zeroAddress } from "viem";
import { Button } from "@/components/ui/button";
import { deployments, type Deployment } from "@/config/deployments";
import {
  creationDraftSchema,
  durationChoices,
  validateCreation,
  addressSchema,
  formatAmount,
  type CreationDraft,
} from "@/domain/orders";
import { TokenSelector, TokenNotice } from "@/features/tokens";
import { useTokenState } from "@/infrastructure/chain/token-state";

export function CreateTrade() {
  const [chainId, setChainId] = useState(deployments[0]?.chainId ?? 100);
  const chains = useChains();
  const deployment = deployments.find((item) => item.chainId === chainId);
  return (
    <div className="space-y-4">
      <h1>Create a trade</h1>
      <label className="block">
        Trade network
        <select
          className="ml-2 rounded border p-2"
          value={chainId}
          onChange={(event) => {
            setChainId(Number(event.target.value) as 100 | 31337);
          }}
        >
          {chains.map((chain) => (
            <option key={chain.id} value={chain.id}>
              {chain.name}
            </option>
          ))}
        </select>
      </label>
      {deployment ? (
        <CreationForm
          key={deployment.id}
          deployment={deployment}
          network={
            chains.find((chain) => chain.id === chainId)?.name ??
            String(chainId)
          }
        />
      ) : (
        <p role="alert">Trading is not configured on this network.</p>
      )}
    </div>
  );
}

function CreationForm({
  deployment,
  network,
}: {
  deployment: Deployment;
  network: string;
}) {
  const {
    draft,
    update: saveDraft,
    error: storageError,
  } = useDraft(deployment.id);
  const [picker, setPicker] = useState<"makerToken" | "takerToken">();
  const [error, setError] = useState("");
  const { address: maker } = useAccount();
  const makerAddress = addressSchema.safeParse(draft.makerToken);
  const takerAddress = addressSchema.safeParse(draft.takerToken);
  const send = useTokenState(
    deployment.chainId,
    makerAddress.success ? makerAddress.data : undefined,
  );
  const receive = useTokenState(
    deployment.chainId,
    takerAddress.success ? takerAddress.data : undefined,
  );
  const update = (change: Partial<CreationDraft>) => {
    saveDraft(change);
    setError("");
  };
  let terms: ReturnType<typeof validateCreation> | undefined;
  let validationError = "Connect a wallet to review your trade.";
  if (maker) {
    if (
      send.decimals.isSuccess &&
      !send.decimals.isFetching &&
      receive.decimals.isSuccess &&
      !receive.decimals.isFetching
    ) {
      try {
        terms = validateCreation(draft, maker, {
          maker: send.decimals.data,
          taker: receive.decimals.data,
        });
      } catch (cause) {
        validationError =
          cause instanceof Error && !cause.message.startsWith("[")
            ? cause.message
            : "Enter valid token addresses, positive amounts and an optional taker address.";
      }
    } else
      validationError =
        "Select both tokens and wait for fresh onchain decimals.";
  }
  if (draft.stage === "review")
    return (
      <section className="space-y-3">
        <h2>Review trade</h2>
        {storageError && <p role="alert">{storageError}</p>}
        <p>Network: {network}</p>
        <p className="break-all">Maker: {maker ?? "Connect your wallet"}</p>
        <p>
          You send:{" "}
          {terms && send.decimals.isSuccess
            ? formatAmount(terms.makerAmount, send.decimals.data)
            : draft.makerAmount}
        </p>
        <p className="break-all">Token sent: {draft.makerToken}</p>
        <TokenNotice chainId={deployment.chainId} address={draft.makerToken} />
        <p>
          You receive:{" "}
          {terms && receive.decimals.isSuccess
            ? formatAmount(terms.takerAmount, receive.decimals.data)
            : draft.takerAmount}
        </p>
        <p className="break-all">Token received: {draft.takerToken}</p>
        <TokenNotice chainId={deployment.chainId} address={draft.takerToken} />
        <p className="break-all">
          Restricted taker: {draft.restrictedTaker || "None"}
        </p>
        {(!draft.restrictedTaker || terms?.restrictedTaker === zeroAddress) && (
          <p>Anyone can accept this order. The first successful trade wins.</p>
        )}
        <p>Duration: {draft.duration}</p>
        <p>The expiration deadline will be set when you request a signature.</p>
        {!terms && <p role="alert">{validationError}</p>}
        <Button
          onClick={() => {
            update({ stage: "edit" });
          }}
        >
          Edit terms
        </Button>
      </section>
    );
  return (
    <section className="space-y-4">
      {storageError && <p role="alert">{storageError}</p>}
      {(
        [
          ["makerToken", "Send"],
          ["takerToken", "Receive"],
        ] as const
      ).map(([field, label]) => (
        <div key={field} className="space-y-2">
          <Button
            onClick={() => {
              setPicker(field);
            }}
          >
            Choose {label} token
          </Button>
          {draft[field] && (
            <p className="break-all">
              {label} token: {draft[field]}
            </p>
          )}
          <label className="block">
            {label} amount
            <input
              className="ml-2 rounded border p-2"
              inputMode="decimal"
              value={
                draft[field === "makerToken" ? "makerAmount" : "takerAmount"]
              }
              onChange={(event) => {
                update({
                  [field === "makerToken" ? "makerAmount" : "takerAmount"]:
                    event.target.value,
                });
              }}
            />
          </label>
        </div>
      ))}
      {picker && (
        <TokenSelector
          key={picker}
          chainId={deployment.chainId}
          label="Token"
          onSelect={(token) => {
            update({ [picker]: token.address });
            setPicker(undefined);
          }}
        />
      )}
      <label className="block">
        Restricted taker (optional)
        <input
          className="mt-1 block w-full rounded border p-2"
          value={draft.restrictedTaker}
          onChange={(event) => {
            update({ restrictedTaker: event.target.value });
          }}
        />
      </label>
      <label className="block">
        Duration
        <select
          className="ml-2 rounded border p-2"
          value={draft.duration}
          onChange={(event) => {
            update({
              duration: creationDraftSchema.shape.duration.parse(
                event.target.value,
              ),
            });
          }}
        >
          {durationChoices.map((choice) => (
            <option key={choice}>{choice}</option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      <Button
        onClick={() => {
          if (terms) update({ stage: "review" });
          else setError(validationError);
        }}
      >
        Review trade
      </Button>
    </section>
  );
}
