import type { Order } from "@/lib/types";

type MoneyOrder = Pick<Order, "type" | "totalAmount" | "quote" | "payment">;

export function orderVisibleTotal(order?: MoneyOrder | null) {
  const isExternal = String(order?.type ?? "").toUpperCase() === "EXTERNAL";
  return Number(
    order?.payment?.amount
      || (isExternal ? order?.quote?.finalAmountWithDeliveryMzn : undefined)
      || (isExternal ? order?.quote?.finalAmountMzn : undefined)
      || order?.totalAmount
      || 0
  );
}

export function rawOrderVisibleTotal(order: Record<string, unknown>) {
  const payment = order.payment as Record<string, unknown> | undefined;
  const quote = order.quote as Record<string, unknown> | undefined;
  const isExternal = String(order.type ?? "").toUpperCase() === "EXTERNAL";

  return Number(
    payment?.amount
      || (isExternal ? quote?.finalAmountWithDeliveryMzn : undefined)
      || (isExternal ? quote?.finalAmountMzn : undefined)
      || order.totalAmount
      || 0
  );
}
