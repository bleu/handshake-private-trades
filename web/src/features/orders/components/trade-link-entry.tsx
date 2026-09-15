"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useVerifiedTrade } from "../hooks/use-verified-trade";

export function TradeLinkEntry({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState("");
  let payload = "";
  try {
    const url = new URL(input.trim());
    if (
      ["http:", "https:"].includes(url.protocol) &&
      url.pathname === "/trade" &&
      !url.search
    )
      payload = url.hash.slice(1);
  } catch {
    /* Incomplete input is expected while typing. */
  }
  const verified = useVerifiedTrade(payload);
  const problem = !input
    ? "Paste a trade link."
    : !payload
      ? "Enter a complete trade link."
      : (verified?.error ??
        (!verified?.entry ? "Verifying trade link…" : undefined));
  return (
    <Dialog title="Open trade link" onClose={onClose}>
      <label>
        Paste trade link
        <input
          className="block w-full"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
          }}
        />
      </label>
      <Button
        className={
          input && (!payload || verified?.error)
            ? "action-error primary-action"
            : "primary-action"
        }
        disabled={!!problem}
        onClick={() => {
          if (!verified?.entry) return;
          window.location.hash = payload;
          onClose();
        }}
      >
        {problem ?? "Open trade"}
      </Button>
    </Dialog>
  );
}
