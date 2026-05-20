"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClientSectionSkeleton } from "@/components/client-feedback-state";
import { useCustomerNotifications } from "@/hooks/useCustomerNotifications";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { CustomerNotification, CustomerNotificationPage } from "@/lib/customer-notifications";

const RED = "#E8431A";

const FILTERS = [
  { key: "ALL", label: "Todas" },
  { key: "UNREAD", label: "Não lidas" },
  { key: "ORDERS", label: "Pedidos" },
  { key: "ACTION_REQUIRED", label: "Ações necessárias" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function severityMeta(severity: CustomerNotification["severity"]) {
  if (severity === "SUCCESS") return { bg: "#ECFDF5", color: "#047857", label: "Atualizacao" };
  if (severity === "WARNING") return { bg: "#FEF2F2", color: "#B91C1C", label: "Atencao" };
  if (severity === "ACTION_REQUIRED") return { bg: "#FFF7ED", color: "#C2410C", label: "Acao necessaria" };
  return { bg: "#EFF6FF", color: "#1D4ED8", label: "Informacao" };
}

export default function CustomerNotificationsPage() {
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { markAsRead, markAllAsRead, refresh, unreadTotal } = useCustomerNotifications();

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<CustomerNotificationPage>(`customer/notifications?filter=${filter}&page=0&size=50`);
      setNotifications(data.content ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Nao foi possivel carregar notificacoes.");
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const grouped = useMemo(() => {
    const byOrder = new Map<string, CustomerNotification[]>();
    const standalone: CustomerNotification[] = [];

    notifications.forEach((notification) => {
      if (!notification.orderId) {
        standalone.push(notification);
        return;
      }
      const key = String(notification.orderId);
      byOrder.set(key, [...(byOrder.get(key) ?? []), notification]);
    });

    return [
      ...Array.from(byOrder.values()).map((items) => ({ key: `order-${items[0].orderId}`, items })),
      ...standalone.map((item) => ({ key: `notification-${item.id}`, items: [item] })),
    ];
  }, [notifications]);

  const openNotification = async (notification: CustomerNotification) => {
    if (!notification.readAt) {
      await markAsRead(notification.id);
      await loadNotifications();
    }
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl;
    }
  };

  const handleReadAll = async () => {
    await markAllAsRead();
    await refresh();
    await loadNotifications();
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border bg-white p-5 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: RED }}>Centro de atualizações</p>
            <h1 className="mt-1 text-3xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Notificações</h1>
            <p className="mt-2 text-sm" style={{ color: "#6B7280" }}>Atualizações discretas sobre pedidos, pagamentos e entregas.</p>
          </div>
          {unreadTotal > 0 ? (
            <button
              type="button"
              onClick={handleReadAll}
              className="rounded-2xl px-4 py-2.5 text-sm font-black text-white"
              style={{ background: RED }}
            >
              Marcar todas como lidas
            </button>
          ) : null}
        </div>
      </section>

      <section className="flex flex-wrap gap-3">
        {FILTERS.map((item) => {
          const active = filter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className="rounded-full px-4 py-2 text-sm font-bold"
              style={{ background: active ? RED : "white", color: active ? "white" : "#6B7280", border: `1px solid ${active ? RED : "#F2D4CC"}` }}
            >
              {item.label}
            </button>
          );
        })}
      </section>

      {error ? (
        <section className="rounded-[24px] border px-4 py-3 text-sm font-semibold" style={{ background: "#FEF2F2", borderColor: "#FCA5A5", color: "#B91C1C" }}>
          {error}
        </section>
      ) : null}

      <section className="space-y-3">
        {isLoading ? (
          <ClientSectionSkeleton title="A carregar notificacoes" message="Estamos a buscar as atualizacoes mais recentes." rows={3} />
        ) : grouped.length === 0 ? (
          <div className="rounded-[28px] border-2 border-dashed bg-white px-6 py-14 text-center" style={{ borderColor: "#F2D4CC" }}>
            <h2 className="text-xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Sem notificações por agora</h2>
            <p className="mt-2 text-sm" style={{ color: "#6B7280" }}>Quando um pedido avançar, aparece aqui sem interromper a tua navegação.</p>
          </div>
        ) : (
          grouped.map(({ key, items }) => {
            const first = items[0];
            const latest = items[0];
            const meta = severityMeta(latest.severity);
            const unreadCount = items.filter((item) => !item.readAt).length;
            const title = items.length > 1 && first.orderCode
              ? `${items.length} atualizações no pedido ${first.orderCode}`
              : latest.title;
            const target = latest.actionUrl || "/orders";

            return (
              <button
                key={key}
                type="button"
                onClick={() => openNotification(latest)}
                className="block w-full rounded-[24px] border bg-white p-4 text-left shadow-sm transition hover:border-[#E8431A]"
                style={{ borderColor: unreadCount > 0 ? "#FDBA74" : "#F2D4CC" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {unreadCount > 0 ? <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#F97316" }} /> : null}
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-black" style={{ background: meta.bg, color: meta.color }}>
                        {meta.label}
                      </span>
                      {first.orderCode ? <span className="text-xs font-bold" style={{ color: "#9CA3AF" }}>{first.orderCode}</span> : null}
                    </div>
                    <h2 className="mt-2 text-base font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{title}</h2>
                    <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>{items.length > 1 ? latest.message : first.message}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold" style={{ color: "#9CA3AF" }}>{formatDate(latest.createdAt)}</span>
                </div>
                <span className="mt-3 inline-flex text-sm font-black" style={{ color: RED }} data-target={target}>
                  Abrir
                </span>
              </button>
            );
          })
        )}
      </section>
    </div>
  );
}
