# Customer notifications

ShopeeX Cliente uses quiet notification badges instead of automatic popups.

- `useCustomerNotifications()` fetches `/customer/notifications/summary` when the authenticated shell loads.
- The hook refreshes on app data changes, browser focus, visible tab changes, and every 60 seconds.
- Desktop header badges show order updates on `Pedidos` and critical/action-required updates on profile.
- Mobile shows the total unread count on the menu button, then separate counts for `Pedidos` and `Notificacoes`.
- `/notifications` lists recent notifications with filters and marks an item as read when the user opens it.
- `/orders` fetches `/customer/orders/notification-summary` and marks orders with unread updates using a small inline dot and `Nova atualizacao`.

Notification toasts are intentionally avoided for old updates. Badges are the default signal; direct toasts should only be used for a new event observed while the customer is already online.
