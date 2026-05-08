import type { Order } from "@/lib/types";

type MoneyOrder = Pick<Order, "totalAmount" | "quote" | "payment">;

export function orderVisibleTotal(order?: MoneyOrder | null) {
  return Number(
    order?.payment?.amount
      || order?.quote?.finalAmountWithDeliveryMzn
      || order?.quote?.finalAmountMzn
      || order?.totalAmount
      || 0
  );
}

export function rawOrderVisibleTotal(order: Record<string, unknown>) {
  const payment = order.payment as Record<string, unknown> | undefined;
  const quote = order.quote as Record<string, unknown> | undefined;

  return Number(
    payment?.amount
      || quote?.finalAmountWithDeliveryMzn
      || quote?.finalAmountMzn
      || order.totalAmount
      || 0
  );
}
