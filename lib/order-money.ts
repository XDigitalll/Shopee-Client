import type { Order } from "@/lib/types";

type MoneyOrder = Pick<Order, "type" | "totalAmount" | "totalAfterDiscount" | "quote" | "payment">;

function positive(value: unknown) {
  const amount = Number(value || 0);
  return amount > 0 ? amount : undefined;
}

export function orderVisibleTotal(order?: MoneyOrder | null) {
  const isExternal = String(order?.type ?? "").toUpperCase() === "EXTERNAL";
  return Number(
    (isExternal ? positive(order?.quote?.finalAmountWithDeliveryMzn) : undefined)
      || (isExternal ? positive(order?.quote?.finalAmountMzn) : undefined)
      || positive(order?.totalAfterDiscount)
      || positive(order?.totalAmount)
      || positive(order?.payment?.amount)
      || 0
  );
}

export function rawOrderVisibleTotal(order: Record<string, unknown>) {
  const payment = order.payment as Record<string, unknown> | undefined;
  const quote = order.quote as Record<string, unknown> | undefined;
  const isExternal = String(order.type ?? "").toUpperCase() === "EXTERNAL";

  return Number(
    (isExternal ? positive(quote?.finalAmountWithDeliveryMzn) : undefined)
      || (isExternal ? positive(quote?.finalAmountMzn) : undefined)
      || positive(order.totalAfterDiscount)
      || positive(order.totalAmount)
      || positive(payment?.amount)
      || 0
  );
}
