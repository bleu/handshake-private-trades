export function TokenWarning({
  membership,
  chainId,
  address,
  name,
  symbol,
}: {
  membership: "listed" | "unlisted" | "unknown";
  chainId: number;
  address: string;
  name: string;
  symbol: string;
}) {
  if (membership === "listed") return null;
  return (
    <details className="token-warning">
      <summary>
        {membership === "unknown"
          ? "List membership unknown."
          : "Outside whitelist"}
      </summary>
      <div role="note">
        <strong>
          {name} ({symbol})
        </strong>
        <p>Verify the contract before trading.</p>
        {chainId === 100 ? (
          <a
            href={`https://gnosisscan.io/address/${address}`}
            target="_blank"
            rel="noreferrer"
          >
            {address}
          </a>
        ) : (
          <>
            <code>{address}</code>
            <p>No public explorer is available for this network.</p>
          </>
        )}
      </div>
    </details>
  );
}
