"use client";

import Image from "next/image";
import { useState } from "react";

export function TokenLogo({
  source,
  symbol,
}: {
  source: string | undefined;
  symbol: string;
}) {
  const [failed, setFailed] = useState(false);
  const validSource =
    source && URL.canParse(source) && new URL(source).protocol === "https:";
  if (!validSource || failed)
    return (
      <span
        role="img"
        aria-label="Token logo unavailable"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100"
      >
        ?
      </span>
    );
  return (
    <Image
      unoptimized
      src={source}
      alt={`${symbol} logo`}
      width={32}
      height={32}
      onError={() => {
        setFailed(true);
      }}
    />
  );
}
