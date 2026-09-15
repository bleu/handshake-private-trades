"use client";
import { Select } from "@/components/ui/select";

import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { Dialog } from "@/components/ui/dialog";
import { OrderReceipt } from "./order-receipt";
import { CreationReadiness } from "./creation-readiness";
import { useDraft } from "../hooks/use-draft";
import { useState } from "react";
import { useAccount, useChainId } from "wagmi";
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
import {
  TokenSelector,
  TokenNotice,
  TokenIdentity,
  TokenBalance,
} from "@/features/tokens";
import { useTransactions } from "@/infrastructure/chain/transactions";
import { useTokenState } from "@/infrastructure/chain/token-state";

export function CreateTrade() {
  const chainId = useChainId();
  const deployment = deployments.find((item) => item.chainId === chainId);
  return (
    <div className="space-y-4">
      <CreationForm key={chainId} chainId={chainId} deployment={deployment} />
    </div>
  );
}

function CreationForm({
  deployment,
  chainId,
}: {
  deployment: Deployment | undefined;
  chainId: number;
}) {
  const {
    draft,
    update: saveDraft,
    error: storageError,
    revision,
  } = useDraft(chainId === 100 ? 1 : 2);
  const { busy } = useTransactions();
  const [importingToken, setImportingToken] = useState(false);
  const [picker, setPicker] = useState<"makerToken" | "takerToken">();
  const [specificWallet, setSpecificWallet] = useState(false);
  const restricted = specificWallet || !!draft.restrictedTaker;
  const [error, setError] = useState("");
  const { address: maker } = useAccount();
  const makerAddress = addressSchema.safeParse(draft.makerToken);
  const takerAddress = addressSchema.safeParse(draft.takerToken);
  const send = useTokenState(
    chainId,
    makerAddress.success ? makerAddress.data : undefined,
  );
  const receive = useTokenState(
    chainId,
    takerAddress.success ? takerAddress.data : undefined,
  );
  const update = (change: Partial<CreationDraft>) => {
    saveDraft(change);
    setError("");
  };
  const freshDecimals = send.decimals.isSuccess && receive.decimals.isSuccess;
  let terms: ReturnType<typeof validateCreation> | undefined;
  let validationError = "Connect a wallet to review your trade.";
  if (maker) {
    if (send.decimals.isSuccess && receive.decimals.isSuccess) {
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
  if (
    restricted &&
    (!draft.restrictedTaker.trim() ||
      draft.restrictedTaker.trim() === zeroAddress)
  ) {
    terms = undefined;
    validationError = "Enter a nonzero counterparty address.";
  }
  const insufficientBalance =
    !!terms && send.balance.isSuccess && send.balance.data < terms.makerAmount;
  const balanceUnavailable = !!terms && !send.balance.isSuccess;
  const editReady =
    !!deployment &&
    !!terms &&
    freshDecimals &&
    !insufficientBalance &&
    !balanceUnavailable;
  const incomplete =
    (restricted && !draft.restrictedTaker.trim()) ||
    !draft.makerToken.trim() ||
    !draft.takerToken.trim() ||
    !draft.makerAmount.trim() ||
    !draft.takerAmount.trim();
  const editError = !deployment
    ? "Trading is not configured on this network."
    : incomplete
      ? "Fill all the inputs"
      : insufficientBalance
        ? "Insufficient send-token balance."
        : balanceUnavailable
          ? send.balance.isError
            ? "Send-token balance unavailable."
            : "Review trade"
          : !freshDecimals
            ? send.decimals.isError || receive.decimals.isError
              ? "Token decimals unavailable."
              : "Review trade"
            : validationError;
  if (draft.stage === "review" && deployment)
    return (
      <>
        <h1>Review order</h1>
        <section className="create-review space-y-3">
          {storageError && <p role="alert">{storageError}</p>}
          {terms && <OrderReceipt chainId={chainId} order={terms} />}
          <dl className="order-facts">
            <div>
              <dt>Counterparty</dt>
              <dd>{draft.restrictedTaker || "Anyone with the link"}</dd>
            </div>
            <div>
              <dt>
                Expires after{" "}
                <Tooltip
                  label="About expiration"
                  text="The expiration deadline is set when you request a signature."
                />
              </dt>
              <dd>{draft.duration}</dd>
            </div>
          </dl>
          <TokenNotice chainId={chainId} address={draft.makerToken} />
          <TokenNotice chainId={chainId} address={draft.takerToken} />
          {!busy && !terms && freshDecimals && (
            <p role="alert">{validationError}</p>
          )}
          {!busy && (send.decimals.isError || receive.decimals.isError) && (
            <p role="alert">Token decimals unavailable.</p>
          )}
          {!freshDecimals && <Button disabled>Review trade</Button>}
          {terms && send.decimals.isSuccess && receive.decimals.isSuccess && (
            <CreationReadiness
              deployment={deployment}
              maker={terms.maker}
              token={terms.makerToken}
              amount={terms.makerAmount}
              decimals={send.decimals.data}
              ready={freshDecimals}
              draft={draft}
              revision={revision}
              takerDecimals={receive.decimals.data}
            />
          )}
          <Button
            className="text-action"
            onClick={() => {
              update({ stage: "edit" });
            }}
          >
            Edit terms
          </Button>
        </section>
      </>
    );
  return (
    <>
      <h1 className="create-heading">Create an order</h1>
      <section className="create-panel">
        <h2>Set your trade</h2>
        {storageError && <p role="alert">{storageError}</p>}
        {(
          [
            ["makerToken", "Send"],
            ["takerToken", "Receive"],
          ] as const
        ).map(([field, label]) => {
          return (
            <div
              key={field}
              className={`amount-card ${field === "takerToken" ? "receive-card" : ""}`}
            >
              <div className="amount-label">You {label.toLowerCase()}</div>
              <div className="amount-row">
                <label className="amount-value">
                  <input
                    className="ml-2 rounded border p-2"
                    inputMode="decimal"
                    aria-label={`${label} amount`}
                    placeholder="0"
                    value={
                      draft[
                        field === "makerToken" ? "makerAmount" : "takerAmount"
                      ]
                    }
                    onChange={(event) => {
                      update({
                        [field === "makerToken"
                          ? "makerAmount"
                          : "takerAmount"]: event.target.value,
                      });
                    }}
                  />
                </label>
                <Button
                  aria-label={`Choose ${label} token`}
                  onClick={() => {
                    setImportingToken(false);
                    setPicker(field);
                  }}
                >
                  {draft[field] ? (
                    <TokenIdentity chainId={chainId} address={draft[field]} />
                  ) : (
                    "Select token"
                  )}
                  <Icon name="chevron-down" />
                </Button>
              </div>
              <div className="amount-footer">
                {draft[field] && (
                  <TokenNotice chainId={chainId} address={draft[field]} />
                )}
                <TokenBalance
                  chainId={chainId}
                  address={
                    field === "makerToken"
                      ? makerAddress.success
                        ? makerAddress.data
                        : undefined
                      : takerAddress.success
                        ? takerAddress.data
                        : undefined
                  }
                />
                {field === "makerToken" &&
                  maker &&
                  makerAddress.success &&
                  send.balance.isSuccess &&
                  send.balance.data > 0n && (
                    <Button
                      disabled={!send.decimals.isSuccess}
                      onClick={() => {
                        if (send.balance.isSuccess && send.decimals.isSuccess)
                          update({
                            makerAmount: formatAmount(
                              send.balance.data,
                              send.decimals.data,
                            ),
                          });
                      }}
                    >
                      Max
                    </Button>
                  )}
              </div>
            </div>
          );
        })}
        {picker && (
          <Dialog
            title={importingToken ? "Import token" : "Select token"}
            back={
              importingToken ? (
                <Button
                  aria-label="Back to tokens"
                  onClick={() => {
                    setImportingToken(false);
                  }}
                >
                  <Icon name="arrow-left" />
                </Button>
              ) : undefined
            }
            onClose={() => {
              setPicker(undefined);
            }}
          >
            <TokenSelector
              key={picker}
              chainId={chainId}
              label="Token"
              onImportView={setImportingToken}
              importView={importingToken}
              onSelect={(token) => {
                update({ [picker]: token.address });
                setPicker(undefined);
              }}
            />
          </Dialog>
        )}
        <div className="counterparty-heading">
          <h3>
            Who can accept?{" "}
            <Tooltip
              label="About counterparties"
              text="Only the specified wallet can accept a restricted order. Anyone with an unrestricted link can accept; the first successful trade wins. Both token transfers happen together."
            />
          </h3>
          <span>Counterparty</span>
        </div>
        <div
          className="counterparty-options"
          role="group"
          aria-label="Counterparty"
        >
          <Button
            aria-pressed={restricted}
            onClick={() => {
              setSpecificWallet(true);
            }}
          >
            Specific wallet
          </Button>
          <Button
            aria-pressed={!restricted}
            onClick={() => {
              setSpecificWallet(false);
              update({ restrictedTaker: "" });
            }}
          >
            Anyone with the link
          </Button>
        </div>
        {restricted && (
          <label className="counterparty-address">
            Counterparty address
            <input
              className="mt-1 block w-full rounded border p-2"
              value={draft.restrictedTaker}
              onChange={(event) => {
                update({ restrictedTaker: event.target.value });
              }}
            />
          </label>
        )}
        <label className="expiry-field">
          <span>Expires after</span>{" "}
          <Tooltip
            label="About expiration"
            text="The expiration deadline is set when you request a signature."
          />
          <Select
            aria-label="Duration"
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
          </Select>
        </label>
        {error && <p role="alert">{error}</p>}
        <Button
          className={`primary-action ${deployment && !incomplete && insufficientBalance ? "action-error" : ""}`}
          disabled={!editReady}
          onClick={() => {
            if (editReady) update({ stage: "review" });
            else setError(validationError);
          }}
        >
          {editReady ? "Review trade" : editError}
        </Button>
      </section>
    </>
  );
}
