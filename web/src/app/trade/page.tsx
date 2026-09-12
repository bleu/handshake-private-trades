import { SignedTradeResult } from "@/features/orders/components/signed-trade-result";
export default function Trade() {
  return (
    <>
      <h1>Review a trade</h1>
      <p>Open a trade link to review its terms.</p>
      <SignedTradeResult />
    </>
  );
}
