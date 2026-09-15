import { Spinner } from "@/components/ui/spinner";
import { Suspense } from "react";
import { TradeLink } from "@/features/orders/components/trade-link";
export default function Trade() {
  return (
    <Suspense fallback={<Spinner label="Loading trade" />}>
      <TradeLink />
    </Suspense>
  );
}
