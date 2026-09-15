import { MAX_UINT256 } from "@/domain/orders";

export function OrderExpiration({
  expiration,
  now,
}: {
  expiration: bigint;
  now: bigint;
}) {
  return (
    <span className="expiration-value">
      <span>
        <span className="sr-only">Expiration: </span>
        {expiration === MAX_UINT256
          ? "Unlimited"
          : expiration <= 8640000000000n
            ? new Date(Number(expiration) * 1000).toLocaleString(undefined, {
                timeZoneName: "short",
              })
            : `Unix timestamp ${expiration.toString()} seconds (beyond calendar range)`}
      </span>
      {expiration !== MAX_UINT256 && now >= expiration && (
        <small>Deadline reached</small>
      )}
    </span>
  );
}
