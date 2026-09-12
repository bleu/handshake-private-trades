import { z } from "zod";
import { zeroAddress } from "viem";
import {
  addressSchema,
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

export function createStorageAdapter(
  getStorage: () => StoragePort,
  onChange: () => void = () => {},
) {
  return {
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
