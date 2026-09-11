import { MAX_UINT256 } from "./amounts.ts";
import { uint256Schema } from "./schema.ts";

const seconds = {
  "1 hour": 3600n,
  "1 day": 86400n,
  "1 week": 604800n,
  "1 month": 2592000n,
  "1 year": 31536000n,
  Unlimited: MAX_UINT256,
} as const;

export type DurationChoice = keyof typeof seconds;

/** The caller supplies the timestamp captured at the explicit signature request. */
export function expirationAtSignature(
  choice: DurationChoice,
  now: bigint,
): bigint {
  uint256Schema.parse(now);
  return choice === "Unlimited"
    ? MAX_UINT256
    : uint256Schema.parse(now + seconds[choice]);
}
