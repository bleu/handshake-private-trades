"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
type Region = { node: HTMLDivElement; depth: number };
type NoticeDestination = {
  target: HTMLDivElement | null;
  depth: number;
  register: (node: HTMLDivElement, depth: number) => () => void;
};
const NoticeContext = createContext<NoticeDestination | null>(null);

/** All notices follow the deepest active dialog, including workflow feedback. */
export function NoticeRegion({ children }: { children: ReactNode }) {
  const parent = useContext(NoticeContext);
  return parent ? (
    <NoticeScope destination={{ ...parent, depth: parent.depth + 1 }}>
      {children}
    </NoticeScope>
  ) : (
    <NoticeRoot>{children}</NoticeRoot>
  );
}
function NoticeRoot({ children }: { children: ReactNode }) {
  const [regions, setRegions] = useState<Region[]>([]);
  const register = useCallback((node: HTMLDivElement, depth: number) => {
    setRegions((previous) => [...previous, { node, depth }]);
    return () => {
      setRegions((previous) =>
        previous.filter((region) => region.node !== node),
      );
    };
  }, []);
  const active = regions.reduce<Region | undefined>(
    (deepest, region) =>
      !deepest || region.depth >= deepest.depth ? region : deepest,
    undefined,
  );
  return (
    <NoticeScope
      destination={{ target: active?.node ?? null, depth: 0, register }}
    >
      {children}
    </NoticeScope>
  );
}
function NoticeScope({
  destination,
  children,
}: {
  destination: NoticeDestination;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { register, depth } = destination;
  useEffect(() => {
    if (ref.current) return register(ref.current, depth);
  }, [register, depth]);
  return (
    <NoticeContext value={destination}>
      {children}
      <div className="notice-region" aria-label="Notifications" ref={ref} />
    </NoticeContext>
  );
}
export function Notice({
  kind,
  children,
}: {
  kind: "success" | "info" | "warning" | "error";
  children: ReactNode;
}) {
  const target = useContext(NoticeContext)?.target;
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const content = (
    <aside
      role={kind === "error" ? "alert" : "status"}
      className={`handshake-notice notice-${kind}`}
    >
      <button
        type="button"
        aria-label="Dismiss notification"
        className="notice-dismiss"
        onClick={() => {
          setDismissed(true);
        }}
      >
        ×
      </button>
      <strong className="sr-only">
        {kind === "success"
          ? "Success"
          : kind === "error"
            ? "Error"
            : kind === "warning"
              ? "Warning"
              : "In progress"}
      </strong>
      {children}
    </aside>
  );
  return target ? createPortal(content, target) : content;
}
