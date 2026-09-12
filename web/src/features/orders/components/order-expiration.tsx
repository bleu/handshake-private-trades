import { MAX_UINT256 } from "@/domain/orders";

export function OrderExpiration({
  expiration,
  now,
}: {
  expiration: bigint;
  now: bigint;
}) {
  return (
    <>
      <p>
        Expiration:{" "}
        {expiration === MAX_UINT256
          ? "Unlimited"
          : expiration <= 8640000000000n
            ? new Date(Number(expiration) * 1000).toLocaleString(undefined, {
                timeZoneName: "short",
              })
            : `Unix timestamp ${expiration.toString()} seconds (beyond calendar range)`}
      </p>
      {expiration !== MAX_UINT256 && (
        <p>
          {now >= expiration
            ? "Deadline reached"
            : `${(expiration - now).toString()} seconds remaining`}
        </p>
      )}
    </>
  );
}
