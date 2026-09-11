import { z } from "zod";

const environment = z
  .object({
    projectId: z
      .string()
      .regex(/^[a-fA-F0-9]{32}$/)
      .or(z.literal("")),
    gnosisRpc: z.url().refine((value) => new URL(value).protocol === "https:"),
    anvil: z.enum(["true", "false"]),
  })
  .parse({
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
    gnosisRpc:
      process.env.NEXT_PUBLIC_GNOSIS_RPC_URL || "https://rpc.gnosischain.com",
    anvil: process.env.NEXT_PUBLIC_ENABLE_ANVIL ?? "false",
  });

if (process.env.NODE_ENV === "production" && environment.anvil === "true") {
  throw new Error("Anvil must not be enabled in public builds.");
}

export const walletSettings = {
  projectId: environment.projectId,
  gnosisRpc: environment.gnosisRpc,
  enableAnvil:
    environment.anvil === "true" && process.env.NODE_ENV !== "production",
};
