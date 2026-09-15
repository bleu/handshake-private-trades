import type { CSSProperties } from "react";

export function Icon({
  name,
}: {
  name: "chevron-down" | "arrow-left" | "close" | "copy" | "github" | "heart";
}) {
  const paths = {
    copy: "M9 9h11v11H9zM15 9V4H4v11h5",
    "chevron-down": "m6 9 6 6 6-6",
    "arrow-left": "m12 5-7 7 7 7M5 12h14",
    close: "m6 6 12 12M6 18 18 6",
    github:
      "M9 19c-4.3 1.3-4.3-2.5-6-3m12 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 19 4.77 5.07 5.07 0 0 0 18.91 1S17.73.65 15 2.48a13.38 13.38 0 0 0-7 0C5.27.65 4.09 1 4.09 1A5.07 5.07 0 0 0 4 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 8 18.13V22",
    heart:
      "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z",
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
