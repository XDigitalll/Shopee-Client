export type CustomerNotificationSeverity = "INFO" | "SUCCESS" | "WARNING" | "ACTION_REQUIRED";

export type CustomerNotificationType =
  | "ORDER_QUOTE_READY"
  | "ORDER_PAYMENT_APPROVED"
  | "ORDER_PAYMENT_REJECTED"
  | "ORDER_READY_FOR_PAYMENT"
  | "ORDER_READY_FOR_DELIVERY"
  | "ORDER_OUT_FOR_DELIVERY"
  | "ORDER_DELIVERED"
  | "ORDER_CANCELLED"
  | "ACTION_REQUIRED";

export type CustomerNotificationSummary = {
  unreadTotal: number;
  ordersUnread: number;
  criticalUnread: number;
};

export type CustomerNotification = {
  id: number;
  orderId?: number | null;
  orderCode?: string | null;
  type: CustomerNotificationType;
  title: string;
  message: string;
  severity: CustomerNotificationSeverity;
  readAt?: string | null;
  createdAt: string;
  actionUrl?: string | null;
  metadataJson?: string | null;
};

export type CustomerNotificationPage = {
  content: CustomerNotification[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
};

export type CustomerOrderNotificationSummary = {
  orderId: number;
  orderCode?: string | null;
  unreadCount: number;
  latestCreatedAt?: string | null;
};

export const EMPTY_CUSTOMER_NOTIFICATION_SUMMARY: CustomerNotificationSummary = {
  unreadTotal: 0,
  ordersUnread: 0,
  criticalUnread: 0,
};
