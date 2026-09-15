"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletControls } from "@/features/wallet";
import { NoticeRegion } from "@/components/ui/notice";
import { Providers } from "./providers";

export default function WalletShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <NoticeRegion>
      <Providers>
        <div className="handshake-shell">
          <div
            className="contract-warning"
            role="note"
            aria-label="Contract risk warning"
          >
            <span aria-hidden="true" className="contract-warning-icon">
              !
            </span>
            <p>This contract has not been audited. Use at your own risk.</p>
            <Link href="/help#contract-risk">Learn more</Link>
          </div>
          <header className="handshake-header">
            <Link
              href="/"
              className="handshake-brand"
              aria-label="Handshake home"
            >
              <svg
                aria-hidden="true"
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m3 8 4-4 4 1 2-1 4 1 4 4-3 7-4 4-4-1-6-6Z" />
                <path d="m11 5-4 4 2 2 4-3 5 5M10 14l4 4M7 16l3 3M18 13l-2 3" />
              </svg>
              Handshake
            </Link>
            <nav aria-label="Main navigation">
              {[
                ["/", "Create"],
                ["/trade", "Trade link"],
                ["/history", "History"],
                ["/help", "Help"],
              ].map(([href, label]) => (
                <Link
                  key={href}
                  href={href ?? "/"}
                  aria-current={pathname === href ? "page" : undefined}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <WalletControls />
          </header>
          <main
            className={`handshake-main ${pathname === "/history" ? "history-main" : pathname === "/help" ? "help-main" : ""}`}
          >
            {children}
          </main>
        </div>
      </Providers>
    </NoticeRegion>
  );
}
