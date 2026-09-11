"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { WalletControls } from "@/features/wallet";
import { Button } from "@/components/ui/button";
import { Providers } from "./providers";

export default function WalletShell({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <div className="mx-auto max-w-5xl px-5 py-8">
        <header className="mb-12 flex flex-wrap items-start justify-between gap-6">
          <nav aria-label="Main navigation" className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/">Create</Link>
            </Button>
            <Button asChild>
              <Link href="/trade">Trade link</Link>
            </Button>
            <Button asChild>
              <Link href="/history">History</Link>
            </Button>
            <Button asChild>
              <Link href="/tokens">Tokens</Link>
            </Button>
          </nav>
          <WalletControls />
        </header>
        <main className="rounded-xl border border-zinc-200 bg-white p-6">
          {children}
        </main>
      </div>
    </Providers>
  );
}
