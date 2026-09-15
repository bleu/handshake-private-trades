import type { CSSProperties } from "react";

export function Icon({
  name,
}: {
  name: "chevron-down" | "arrow-left" | "close" | "copy";
}) {
  const paths = {
    copy: "M9 9h11v11H9zM15 9V4H4v11h5",
    "chevron-down": "m6 9 6 6 6-6",
    "arrow-left": "m12 5-7 7 7 7M5 12h14",
    close: "m6 6 12 12M6 18 18 6",
  };
  const style: CSSProperties = { width: "1em", height: "1em", flexShrink: 0 };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
