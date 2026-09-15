"use client";
import { useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
  };
}
export function useTradeFragment() {
  // App Router navigation can change the hash via pushState without emitting
  // hashchange. Its URL context also triggers a fresh browser snapshot.
  useSearchParams();
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash.slice(1),
    () => "",
  );
}
