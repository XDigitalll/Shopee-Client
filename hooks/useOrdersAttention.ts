"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, CLIENT_DATA_CHANGED_EVENT } from "@/lib/api-client";
import { useAuth } from "@/components/auth-provider";

export type OrderAttentionItem = {
  orderId: number;
  orderCode?: string | null;
  unreadCount: number;
  requiresAction: boolean;
  attentionLabel?: string | null;
  actionUrl?: string | null;
  severity?: string | null;
};

export type OrdersAttentionSummary = {
  attentionCount: number;
  orders: OrderAttentionItem[];
};

const EMPTY_SUMMARY: OrdersAttentionSummary = { attentionCount: 0, orders: [] };

export function useOrdersAttention() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<OrdersAttentionSummary>(EMPTY_SUMMARY);

  const refresh = useCallback(async () => {
    if (!token) {
      setSummary(EMPTY_SUMMARY);
      return;
    }
    const data = await apiFetch<OrdersAttentionSummary>("customer/orders/attention-summary", { token });
    setSummary(data ?? EMPTY_SUMMARY);
  }, [token]);

  useEffect(() => {
    void refresh().catch(() => setSummary(EMPTY_SUMMARY));
  }, [refresh]);

  useEffect(() => {
    if (!token) return;
    const run = () => void refresh().catch(() => null);
    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    const intervalId = window.setInterval(run, 10_000);
    window.addEventListener("focus", run);
    window.addEventListener(CLIENT_DATA_CHANGED_EVENT, run);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", run);
      window.removeEventListener(CLIENT_DATA_CHANGED_EVENT, run);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, token]);

  return { summary, attentionCount: summary.attentionCount, refresh };
}
