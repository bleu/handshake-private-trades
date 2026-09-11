import { z } from "zod";
import { addressSchema } from "@/domain/orders";

export const COW_LIST_URL = "https://files.cow.fi/tokens/CowSwap.json";
const tokenSchema = z.object({
  chainId: z.number().int().positive(),
  address: addressSchema,
  decimals: z.number().int().min(0).max(255),
  name: z.string().optional(),
  symbol: z.string().optional(),
  logoURI: z.string().optional(),
});
const listSchema = z.object({
  name: z.string(),
  timestamp: z.iso.datetime({ offset: true }),
  version: z.object({
    major: z.number().int().nonnegative(),
    minor: z.number().int().nonnegative(),
    patch: z.number().int().nonnegative(),
  }),
  tokens: z.array(tokenSchema),
});
export type ListedToken = Omit<z.infer<typeof tokenSchema>, "decimals">;

export async function fetchCowTokens([source, chainId]: readonly [
  string,
  number,
]): Promise<ListedToken[]> {
  const response = await fetch(source);
  if (!response.ok) throw new Error("Token list unavailable.");
  const list = listSchema.parse(await response.json());
  return list.tokens
    .filter((token) => token.chainId === chainId)
    .map((token) => ({
      chainId: token.chainId,
      address: token.address,
      name: token.name,
      symbol: token.symbol,
      logoURI: token.logoURI,
    }));
}
