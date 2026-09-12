"use client";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};
const originSnapshot = () => window.location.origin;
export function CopyTradeLink({ payload }: { payload: string }) {
  const origin = useSyncExternalStore(subscribe, originSnapshot, () => "");
  const [message, setMessage] = useState("");
  const link = `${origin}/trade#${payload}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Link copied.");
    } catch {
      setMessage("Copy failed. Select and copy the link above.");
    }
  };
  return (
    <div className="space-y-2">
      <label className="block">
        Trade link
        <input
          className="block w-full rounded border p-2"
          readOnly
          value={link}
        />
      </label>
      <Button
        onClick={() => {
          void copy();
        }}
      >
        Copy link
      </Button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
