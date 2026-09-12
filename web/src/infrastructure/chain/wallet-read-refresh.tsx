"use client";
import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";

export function WalletReadRefresh() {
  const { address, chainId } = useAccount();
  const client = useQueryClient();
  useEffect(() => {
    void client.invalidateQueries({ queryKey: ["readContract"] });
  }, [address, chainId, client]);
  return null;
}
