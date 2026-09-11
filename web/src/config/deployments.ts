import { z } from "zod";
import { getAddress, zeroAddress } from "viem";
import { settlementAbi } from "../generated/private-trade-settlement.ts";

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value) => getAddress(value))
  .refine((value) => value !== zeroAddress);
const settingsSchema = z.object({
  gnosisAddress: address.optional(),
  enableAnvil: z.boolean(),
  publicBuild: z.boolean(),
});

export type Deployment = Readonly<{
  id: 1 | 2;
  chainId: 100 | 31337;
  address: `0x${string}`;
  abi: typeof settlementAbi;
  domain: Readonly<{
    name: "Private Trade Links";
    version: "1";
    chainId: number;
    verifyingContract: `0x${string}`;
  }>;
}>;

/** Allocate once: published IDs must never be remapped in later releases. */
export function createDeploymentRegistry(
  input: z.input<typeof settingsSchema>,
) {
  const settings = settingsSchema.parse(input);
  if (
    settings.publicBuild &&
    (settings.enableAnvil || !settings.gnosisAddress)
  ) {
    throw new Error(
      "Public builds require the Gnosis settlement address and reject Anvil.",
    );
  }
  const entries: Deployment[] = [];
  const add = (
    id: Deployment["id"],
    chainId: Deployment["chainId"],
    contract: `0x${string}`,
  ) =>
    entries.push(
      Object.freeze({
        id,
        chainId,
        address: contract,
        abi: settlementAbi,
        domain: Object.freeze({
          name: "Private Trade Links" as const,
          version: "1" as const,
          chainId,
          verifyingContract: contract,
        }),
      }),
    );
  if (settings.gnosisAddress) add(1, 100, settings.gnosisAddress);
  if (settings.enableAnvil)
    add(2, 31337, "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0");
  return Object.freeze(entries);
}

export const deployments = createDeploymentRegistry({
  ...(process.env.NEXT_PUBLIC_GNOSIS_SETTLEMENT_ADDRESS
    ? { gnosisAddress: process.env.NEXT_PUBLIC_GNOSIS_SETTLEMENT_ADDRESS }
    : {}),
  enableAnvil: process.env.NEXT_PUBLIC_ENABLE_ANVIL === "true",
  publicBuild: process.env.NODE_ENV === "production",
});
