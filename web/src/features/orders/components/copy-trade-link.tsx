"use client";
import { useId, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};
const originSnapshot = () => window.location.origin;
export function CopyTradeLink({
  payload,
  compact = false,
}: {
  payload: string;
  compact?: boolean;
}) {
  const inputId = useId();
  const origin = useSyncExternalStore(subscribe, originSnapshot, () => "");
  const [message, setMessage] = useState("");
  const link = `${origin}/trade#${payload}`;
  const copy = async () => {
    setMessage("");
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Link copied.");
    } catch {
      setMessage("Copy failed. Select and copy the link above.");
    }
  };
  return (
    <div className="space-y-2">
      {(!compact || message.startsWith("Copy failed")) && (
        <label className="block" htmlFor={inputId}>
          Trade link
        </label>
      )}
      <div className={compact ? undefined : "trade-link-field"}>
        {(!compact || message.startsWith("Copy failed")) && (
          <input id={inputId} className="block w-full" readOnly value={link} />
        )}
        <Button
          className={compact ? undefined : "copy-link-icon"}
          aria-label="Copy link"
          title="Copy link"
          onClick={() => {
            void copy();
          }}
        >
          {compact ? "Copy link" : <Icon name="copy" />}
        </Button>
      </div>
      {message && (
        <Notice kind={message === "Link copied." ? "success" : "error"}>
          <p>{message}</p>
        </Notice>
      )}
    </div>
  );
}
