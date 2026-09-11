export const MAX_UINT256 = (1n << 256n) - 1n;

function requireDecimals(decimals: number) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255)
    throw new Error("Invalid token decimals.");
}

export function parseAmount(value: string, decimals: number): bigint {
  requireDecimals(decimals);
  if (!/^\d+(?:\.\d+)?$/.test(value))
    throw new Error("Enter a decimal amount.");
  const [whole = "0", fraction = ""] = value.split(".");
  if (fraction.length > decimals)
    throw new Error("Amount exceeds token precision.");
  const amount = BigInt(whole + fraction.padEnd(decimals, "0"));
  if (amount > MAX_UINT256) throw new Error("Amount exceeds uint256.");
  return amount;
}

export function formatAmount(amount: bigint, decimals: number): string {
  requireDecimals(decimals);
  if (amount < 0n || amount > MAX_UINT256)
    throw new Error("Amount exceeds uint256.");
  if (decimals === 0) return amount.toString();
  const digits = amount.toString().padStart(decimals + 1, "0");
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return digits.slice(0, -decimals) + (fraction ? `.${fraction}` : "");
}
