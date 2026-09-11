import { z } from "zod";
import { zeroAddress } from "viem";
import { addressSchema } from "../../domain/orders/index.ts";

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

export function createStorageAdapter(
  getStorage: () => StoragePort,
  onChange: () => void = () => {},
) {
  return {
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
