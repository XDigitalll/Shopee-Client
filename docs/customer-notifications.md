# Order attention alerts

ShopeeX Cliente treats customer notifications as an internal order event log. The customer-facing experience is centered on `Pedidos`.

- `useOrdersAttention()` fetches `/customer/orders/attention-summary` when the authenticated shell loads.
- The hook refreshes on app data changes, browser focus, visible tab changes, and every 60 seconds.
- The desktop header shows a badge only on `Pedidos`.
- The mobile menu button shows a badge only when at least one order needs attention; inside the menu only `Pedidos` gets the count.
- `/notifications` redirects to `/orders`.
- `/orders` uses the order fields `unreadUpdatesCount`, `requiresAction`, `attentionLabel`, `nextActionLabel`, and `nextActionUrl`.
- One order counts once in the badge, even if it has multiple unread events.
- Opening an order history or following an order action calls `/customer/orders/{id}/mark-updates-seen`.

Old updates should not trigger automatic popups. The badge on `Pedidos` and the inline order card label are the primary signals.
