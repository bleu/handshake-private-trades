import { z } from "zod";
import { zeroAddress } from "viem";
import {
  addressSchema,
  decodeOrderLink,
  orderId,
  type LinkDeployment,
  type SignedOrderLink,
  creationDraftSchema,
} from "../../domain/orders/index.ts";

export type StoragePort = Pick<
  Storage,
  "length" | "key" | "getItem" | "setItem"
>;
const tokenSchema = z.object({
  chainId: z.number().int().positive(),
  address: addressSchema.refine((value) => value !== zeroAddress),
});
export type TokenImport = z.infer<typeof tokenSchema>;
export type ReadResult<T> = { value: T; error?: string };
export type WriteResult = { ok: true } | { ok: false; error: string };
const importRecord = z.object({ version: z.literal(1), token: tokenSchema });
const importKey = (token: TokenImport) =>
  `ptl:imports:${String(token.chainId)}:${token.address.toLowerCase()}`;

const deploymentIdSchema = z.union([z.literal(1), z.literal(2)]);
const draftRecordSchema = z.strictObject({
  version: z.literal(1),
  revision: z.uuid(),
  draft: creationDraftSchema,
});
export type SavedDraft = z.infer<typeof draftRecordSchema>;
const draftKey = (deploymentId: number) =>
  `ptl:draft:${String(deploymentIdSchema.parse(deploymentId))}`;

export type StoredOrder = {
  payload: string;
  orderId: `0x${string}`;
  signed: SignedOrderLink;
  savedAt?: number;
};
const historyRecordSchema = z.strictObject({
  version: z.literal(1),
  payload: z.string(),
  filledBy: addressSchema.optional(),
  savedAt: z.number().int().nonnegative().max(8640000000000000).optional(),
});
const historyPrefix = (maker: string, deploymentId: number) =>
  `ptl:history:${String(deploymentIdSchema.parse(deploymentId))}:${addressSchema.parse(maker).toLowerCase()}:`;
async function verifiedEntry(
  payload: string,
  registry: readonly LinkDeployment[],
): Promise<StoredOrder> {
  const signed = await decodeOrderLink(payload, registry);
  const deployment = registry.find((entry) => entry.id === signed.deploymentId);
  if (!deployment) throw new Error("Unsupported deployment.");
  return { payload, orderId: orderId(signed.order, deployment.domain), signed };
}

const displayBalanceSchema = z.object({
  amount: z
    .string()
    .regex(/^(0|[1-9][0-9]{0,77})$/)
    .refine((value) => BigInt(value) < 1n << 256n),
  decimals: z.number().int().min(0).max(255),
});
export type DisplayBalance = z.infer<typeof displayBalanceSchema>;
const displayBalanceKey = (chainId: number, token: string, owner: string) =>
  `ptl:display-balance:${String(z.number().int().positive().parse(chainId))}:${addressSchema.parse(token).toLowerCase()}:${addressSchema.parse(owner).toLowerCase()}`;

export function createStorageAdapter(
  getStorage: () => StoragePort,
  onChange: () => void = () => {},
) {
  return {
    readDisplayBalance(
      chainId: number,
      token: string,
      owner: string,
    ): DisplayBalance | undefined {
      try {
        return displayBalanceSchema.parse(
          JSON.parse(
            getStorage().getItem(displayBalanceKey(chainId, token, owner)) ??
              "null",
          ),
        );
      } catch {
        return undefined;
      }
    },
    saveDisplayBalance(
      chainId: number,
      token: string,
      owner: string,
      value: DisplayBalance,
    ) {
      try {
        const key = displayBalanceKey(chainId, token, owner);
        const serialized = JSON.stringify(displayBalanceSchema.parse(value));
        const storage = getStorage();
        if (storage.getItem(key) !== serialized) {
          storage.setItem(key, serialized);
          onChange();
        }
      } catch {
        /* Display caching is best effort and never supplies transaction readiness. */
      }
    },
    async saveOrder(
      payload: string,
      maker: string,
      registry: readonly LinkDeployment[],
    ) {
      const entry = await verifiedEntry(payload, registry);
      if (addressSchema.parse(maker) !== entry.signed.order.maker)
        throw new Error("Only the maker can restore this order to history.");
      const key =
        historyPrefix(maker, entry.signed.deploymentId) + entry.orderId;
      try {
        const storage = getStorage();
        const previous = storage.getItem(key);
        // Restoring a legacy record must not invent its original save time.
        let savedAt: number | undefined;
        if (previous === null) savedAt = Date.now();
        else {
          try {
            savedAt = historyRecordSchema.parse(JSON.parse(previous)).savedAt;
          } catch {
            savedAt = Date.now();
          }
        }
        if (savedAt !== undefined) entry.savedAt = savedAt;
        storage.setItem(
          key,
          JSON.stringify({
            version: 1,
            payload,
            ...(savedAt !== undefined ? { savedAt } : {}),
          }),
        );
        onChange();
        return { ok: true as const, entry, url: `/trade#${payload}` };
      } catch {
        return {
          ok: false as const,
          entry,
          url: `/trade#${payload}`,
          error:
            "Order history could not be saved. Keep this link; clearing storage does not cancel an order.",
        };
      }
    },
    async saveFilledOrder(
      payload: string,
      taker: string,
      registry: readonly LinkDeployment[],
    ) {
      const entry = await verifiedEntry(payload, registry);
      const owner = addressSchema.parse(taker);
      if (
        owner === entry.signed.order.maker ||
        (entry.signed.order.restrictedTaker !== zeroAddress &&
          entry.signed.order.restrictedTaker !== owner)
      )
        throw new Error("This wallet cannot be the taker of this order.");
      try {
        const key =
          historyPrefix(owner, entry.signed.deploymentId) + entry.orderId;
        const storage = getStorage();
        const previous = historyRecordSchema.safeParse(
          JSON.parse(storage.getItem(key) ?? "null"),
        );
        storage.setItem(
          key,
          JSON.stringify({
            version: 1,
            payload,
            filledBy: owner,
            savedAt: previous.success ? previous.data.savedAt : Date.now(),
          }),
        );
        onChange();
        return { ok: true as const };
      } catch {
        return {
          ok: false as const,
          error: "Filled trade history could not be saved. Keep this link.",
        };
      }
    },
    async readOrders(
      maker: string,
      deploymentId: number,
      registry: readonly LinkDeployment[],
      includeFilled = false,
    ): Promise<ReadResult<StoredOrder[]>> {
      const value: StoredOrder[] = [];
      let error: string | undefined;
      try {
        const storage = getStorage();
        const prefix = historyPrefix(maker, deploymentId);
        const records: { key: string; raw: string | null }[] = [];
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          if (key?.startsWith(prefix))
            records.push({ key, raw: storage.getItem(key) });
        }
        for (const { key, raw } of records) {
          try {
            const record = historyRecordSchema.parse(JSON.parse(raw ?? "null"));
            const entry = await verifiedEntry(record.payload, registry);
            if (
              key !==
              historyPrefix(
                record.filledBy ?? entry.signed.order.maker,
                entry.signed.deploymentId,
              ) +
                entry.orderId
            )
              throw new Error("Mismatched order identity.");
            if (record.filledBy) {
              if (
                record.filledBy === entry.signed.order.maker ||
                (entry.signed.order.restrictedTaker !== zeroAddress &&
                  record.filledBy !== entry.signed.order.restrictedTaker)
              )
                throw new Error("Invalid taker history.");
              if (!includeFilled) continue;
            }
            if (record.savedAt !== undefined) entry.savedAt = record.savedAt;
            value.push(entry);
          } catch {
            error =
              "Some saved orders are corrupt or unsupported and could not be loaded.";
          }
        }
      } catch {
        error = "Saved order history is unavailable.";
      }
      return { value, ...(error ? { error } : {}) };
    },
    saveDraft(
      deploymentId: number,
      input: z.input<typeof creationDraftSchema>,
    ): { ok: true; record: SavedDraft } | { ok: false; error: string } {
      try {
        const record = draftRecordSchema.parse({
          version: 1,
          revision: crypto.randomUUID(),
          draft: input,
        });
        getStorage().setItem(draftKey(deploymentId), JSON.stringify(record));
        onChange();
        return { ok: true, record };
      } catch {
        return {
          ok: false,
          error:
            "Draft could not be saved. Your current form is usable, but may not survive refresh.",
        };
      }
    },
    clearDraft(deploymentId: number, revision: string): WriteResult {
      try {
        // Mark only the completed revision. Never overwrite the draft head: a
        // concurrent tab may have saved newer terms while signing was pending.
        getStorage().setItem(
          `${draftKey(deploymentId)}:completed:${z.uuid().parse(revision)}`,
          JSON.stringify({ version: 1, completed: true }),
        );
        onChange();
        return { ok: true };
      } catch {
        return {
          ok: false,
          error:
            "Completed draft could not be cleared. The signed link remains valid.",
        };
      }
    },
    readDraft(deploymentId: number): ReadResult<SavedDraft | null> {
      try {
        const value = getStorage().getItem(draftKey(deploymentId));
        if (value === null) return { value: null };
        const record = draftRecordSchema.parse(JSON.parse(value));
        const completed = getStorage().getItem(
          `${draftKey(deploymentId)}:completed:${record.revision}`,
        );
        if (completed !== null) {
          z.strictObject({
            version: z.literal(1),
            completed: z.literal(true),
          }).parse(JSON.parse(completed));
          return { value: null };
        }
        return { value: record };
      } catch {
        return {
          value: null,
          error:
            "Saved draft is unavailable or corrupt. You can start a new draft.",
        };
      }
    },
    saveImport(input: z.input<typeof tokenSchema>): WriteResult {
      try {
        const token = tokenSchema.parse(input);
        getStorage().setItem(
          importKey(token),
          JSON.stringify({ version: 1, token }),
        );
        onChange();
        return { ok: true };
      } catch {
        return {
          ok: false,
          error:
            "Import could not be saved. It will not persist across sessions.",
        };
      }
    },
    readImports(chainId: number): ReadResult<TokenImport[]> {
      const value: TokenImport[] = [];
      let error: string | undefined;
      try {
        const storage = getStorage();
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          if (!key?.startsWith(`ptl:imports:${String(chainId)}:`)) continue;
          try {
            const record = importRecord.parse(
              JSON.parse(storage.getItem(key) ?? "null"),
            );
            if (
              record.token.chainId !== chainId ||
              key !== importKey(record.token)
            )
              throw new Error("Mismatched record.");
            value.push(record.token);
          } catch {
            error = "Some saved imports are corrupt and could not be loaded.";
          }
        }
      } catch {
        error = "Saved imports are unavailable.";
      }
      return { value, ...(error ? { error } : {}) };
    },
  };
}

export const browserStorage = createStorageAdapter(
  () => window.localStorage,
  () => window.dispatchEvent(new Event("ptl:storage")),
);
export function subscribeStorage(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("ptl:storage", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("ptl:storage", listener);
  };
}
