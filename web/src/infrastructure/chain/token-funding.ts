"use client";
import { useReadContract } from "wagmi";
import { erc20Abi, zeroAddress, type Address } from "viem";
import { deployments } from "@/config/deployments";
import { chainReadPolicy } from "./read-policy";

export function useTokenFunding(
  chainId: number,
  address: Address | undefined,
  owner: Address | undefined,
) {
  const deployment = deployments.find((entry) => entry.chainId === chainId);
  const contract = {
    chainId,
    address: address ?? zeroAddress,
    abi: erc20Abi,
  } as const;
  const balance = useReadContract({
    ...contract,
    functionName: "balanceOf",
    args: [owner ?? zeroAddress],
    query: { ...chainReadPolicy, enabled: !!address && !!owner },
  });
  const allowance = useReadContract({
    ...contract,
    functionName: "allowance",
    args: [owner ?? zeroAddress, deployment?.address ?? zeroAddress],
    query: {
      ...chainReadPolicy,
      enabled: !!address && !!owner && !!deployment,
    },
  });
  const refresh = async () => {
    await Promise.all([
      ...(address && owner ? [balance.refetch()] : []),
      ...(address && owner && deployment ? [allowance.refetch()] : []),
    ]);
  };
  return { balance, allowance, deployment, refresh };
}
