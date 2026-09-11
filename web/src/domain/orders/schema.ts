import { z } from "zod";
import { getAddress, zeroAddress } from "viem";
import { MAX_UINT256 } from "./amounts.ts";

export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value) => getAddress(value.toLowerCase()));
const nonzeroAddress = addressSchema.refine((value) => value !== zeroAddress);
export const uint256Schema = z.bigint().min(0n).max(MAX_UINT256);
const bytes32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase() as `0x${string}`);

export const orderSchema = z
  .strictObject({
    maker: nonzeroAddress,
    restrictedTaker: addressSchema,
    makerToken: nonzeroAddress,
    takerToken: nonzeroAddress,
    makerAmount: uint256Schema.refine((value) => value > 0n),
    takerAmount: uint256Schema.refine((value) => value > 0n),
    expiration: uint256Schema,
    salt: bytes32,
  })
  .refine((order) => order.makerToken !== order.takerToken, {
    message: "Tokens must be different.",
  });

export type Order = z.infer<typeof orderSchema>;
