"use client";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
const WalletShell = dynamic(() => import("./wallet-shell"), { ssr: false });
export function ClientShell({ children }: { children: ReactNode }) {
  return <WalletShell>{children}</WalletShell>;
}
