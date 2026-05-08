import type { Order } from "@/lib/types";

export function orderDisplayCode(order: Pick<Order, "id" | "code"> | null | undefined) {
  if (order?.code) {
    return order.code;
  }
  return order?.id ? `#${order.id}` : "--";
}
