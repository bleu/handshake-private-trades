"use client";
import dynamic from "next/dynamic";
export const ConnectWalletAction = dynamic(
  () => import("./connect-wallet-action"),
  { ssr: false },
);
