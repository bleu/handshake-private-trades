import Image from "next/image";

export function ChainIcon({ chainId }: { chainId: number }) {
  return chainId === 100 ? (
    <Image
      unoptimized
      src="/chain-icons/gnosis.svg"
      alt="Gnosis logo"
      width={20}
      height={20}
      className="chain-icon"
    />
  ) : (
    <svg
      role="img"
      aria-label="Network icon"
      className="chain-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c6 5 6 13 0 18-6-5-6-13 0-18Z" />
    </svg>
  );
}
