import { z } from "zod";
import { zeroAddress } from "viem";
import { parseAmount } from "./amounts.ts";
import { orderSchema } from "./schema.ts";

export const durationChoices = [
  "1 hour",
  "1 day",
  "1 week",
  "1 month",
  "1 year",
  "Unlimited",
] as const;
export const creationDraftSchema = z.strictObject({
  makerToken: z.string().default(""),
  takerToken: z.string().default(""),
  makerAmount: z.string().default(""),
  takerAmount: z.string().default(""),
  restrictedTaker: z.string().default(""),
  duration: z.enum(durationChoices).default("1 day"),
  stage: z.enum(["edit", "review"]).default("edit"),
});
export type CreationDraft = z.infer<typeof creationDraftSchema>;

export function validateCreation(
  input: unknown,
  maker: string,
  decimals: { maker: number; taker: number },
) {
  const draft = creationDraftSchema.parse(input);
  const terms = {
    maker: orderSchema.shape.maker.parse(maker),
    makerToken: orderSchema.shape.makerToken.parse(draft.makerToken),
    takerToken: orderSchema.shape.takerToken.parse(draft.takerToken),
    makerAmount: orderSchema.shape.makerAmount.parse(
      parseAmount(draft.makerAmount, decimals.maker),
    ),
    takerAmount: orderSchema.shape.takerAmount.parse(
      parseAmount(draft.takerAmount, decimals.taker),
    ),
    restrictedTaker: orderSchema.shape.restrictedTaker.parse(
      draft.restrictedTaker || zeroAddress,
    ),
    duration: draft.duration,
  };
  if (terms.makerToken === terms.takerToken)
    throw new Error("Tokens must be different.");
  if (terms.restrictedTaker === terms.maker)
    throw new Error("Restricted taker must differ from the maker.");
  return terms;
}
