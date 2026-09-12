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
  useEffect(() => {
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ["readContract"] });
    };
    // TanStack's visibility refresh does not cover focus between visible windows.
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
    };
  }, [client]);
  return null;
}
