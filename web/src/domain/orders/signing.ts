import { validateCreation } from "./creation.ts";
import { expirationAtSignature } from "./durations.ts";
import { orderSchema } from "./schema.ts";

/** Capture validated terms using the clock and fresh salt supplied at signature request. */
export function signingOrder(
  draft: unknown,
  maker: string,
  decimals: { maker: number; taker: number },
  now: bigint,
  salt: string,
) {
  const { duration, ...terms } = validateCreation(draft, maker, decimals);
  return Object.freeze(
    orderSchema.parse({
      ...terms,
      expiration: expirationAtSignature(duration, now),
      salt,
    }),
  );
}
