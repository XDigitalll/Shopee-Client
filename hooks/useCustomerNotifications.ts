"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { CLIENT_DATA_CHANGED_EVENT, apiFetch } from "@/lib/api-client";
import {
  EMPTY_CUSTOMER_NOTIFICATION_SUMMARY,
  type CustomerNotificationSummary,
} from "@/lib/customer-notifications";

export function useCustomerNotifications() {
  const { token, isReady } = useAuth();
  const [summary, setSummary] = useState<CustomerNotificationSummary>(EMPTY_CUSTOMER_NOTIFICATION_SUMMARY);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setSummary(EMPTY_CUSTOMER_NOTIFICATION_SUMMARY);
      return;
    }

    setIsLoading(true);
    try {
      const data = await apiFetch<CustomerNotificationSummary>("customer/notifications/summary", { token });
      setSummary(data ?? EMPTY_CUSTOMER_NOTIFICATION_SUMMARY);
    } catch {
      setSummary(EMPTY_CUSTOMER_NOTIFICATION_SUMMARY);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const markAsRead = useCallback(async (id: number) => {
    if (!token) return;
    await apiFetch(`customer/notifications/${id}/read`, { method: "PATCH", token });
    await refresh();
  }, [refresh, token]);

  const markAllAsRead = useCallback(async () => {
    if (!token) return;
    const data = await apiFetch<CustomerNotificationSummary>("customer/notifications/read-all", { method: "PATCH", token });
    setSummary(data ?? EMPTY_CUSTOMER_NOTIFICATION_SUMMARY);
  }, [token]);

  useEffect(() => {
    if (!isReady) return;
    void refresh();
  }, [isReady, refresh]);

  useEffect(() => {
    if (!token) return;

    const onFocus = () => {
      void refresh();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    const intervalId = window.setInterval(onFocus, 60000);
    window.addEventListener("focus", onFocus);
    window.addEventListener(CLIENT_DATA_CHANGED_EVENT, onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(CLIENT_DATA_CHANGED_EVENT, onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, token]);

  return {
    summary,
    unreadTotal: summary.unreadTotal,
    isLoading,
    refresh,
    markAsRead,
    markAllAsRead,
  };
}
