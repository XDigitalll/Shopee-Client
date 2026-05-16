import { clearStoredSession, refreshStoredSession } from "@/lib/auth";
import { normalizeClientError } from "@/lib/client-errors";
import { getCsrfToken, XSRF_HEADER } from "@/lib/csrf";

export const CLIENT_DATA_CHANGED_EVENT = "client:data-changed";

export function emitClientDataChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(CLIENT_DATA_CHANGED_EVENT));
}

type ApiOptions = RequestInit & {
  token?: string | null;
};

function isMutation(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method);
}

function getApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const message = record.message;

  if (typeof message === "string" && message.trim()) {
    return message;
  }

  const messages = record.messages;

  if (messages && typeof messages === "object") {
    const firstValidationMessage = Object.values(messages as Record<string, unknown>).find(
      (value) => typeof value === "string" && value.trim()
    );

    if (typeof firstValidationMessage === "string") {
      return firstValidationMessage;
    }
  }

  const error = record.error;

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return null;
}

function statusFallbackMessage(status: number): string {
  if (status === 401) return "A tua sessão expirou. Inicia sessão novamente para continuar.";
  if (status === 403) return "Não tens permissão para esta ação.";
  if (status === 404) return "Não encontrámos esse recurso.";
  if (status === 409) return "Não foi possível completar a operação. Verifica os dados e tenta novamente.";
  if (status === 429) return "Muitas tentativas. Aguarda um pouco e tenta novamente.";
  if (status === 502) return "Não conseguimos contactar o servidor agora. Tenta novamente.";
  if (status >= 500) return "Não conseguimos concluir agora. Tenta novamente.";
  return "Não foi possível concluir a operação.";
}

async function performRequest(path: string, options: ApiOptions = {}) {
  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  if (!headers.has("Content-Type") && options.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  headers.delete("Authorization");

  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers.set(XSRF_HEADER, csrfToken);
    }
  }

  return fetch(`/api/xdigital/${path.replace(/^\/+/, "")}`, {
    ...options,
    headers,
    cache: "no-store",
    credentials: "same-origin",
  });
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const mutation = isMutation(method);
  const csrfBeforeRequest = getCsrfToken();
  let response = await performRequest(path, options);

  if (response.status === 401 && path !== "auth/refresh") {
    const refreshed = await refreshStoredSession();
    if (refreshed) {
      response = await performRequest(path, options);
    }
  }

  if (mutation && response.status === 403) {
    const csrfAfterResponse = getCsrfToken();

    if (csrfAfterResponse && csrfAfterResponse !== csrfBeforeRequest) {
      response = await performRequest(path, options);
    } else if (path !== "auth/refresh") {
      const refreshed = await refreshStoredSession();
      if (refreshed) {
        response = await performRequest(path, options);
      }
    }
  }

  if (response.status === 204) {
    return null as T;
  }

  const payload = await response.json().catch(() => null);

  if (response.status === 401) {
    clearStoredSession();
  }

  if (!response.ok) {
    const apiMessage = getApiErrorMessage(payload);
    const message = normalizeClientError(
      apiMessage ?? statusFallbackMessage(response.status),
      statusFallbackMessage(response.status),
      response.status
    ).message;
    throw new Error(message);
  }

  if (mutation) {
    emitClientDataChanged();
  }

  return payload as T;
}
