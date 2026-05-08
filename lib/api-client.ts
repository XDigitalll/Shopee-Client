import { clearStoredSession, getStoredRefreshToken, refreshStoredSession } from "@/lib/auth";

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
  if (status === 401) return "Sessao expirada. Faz login novamente.";
  if (status === 403) return "Sem permissao para realizar esta operacao.";
  if (status === 404) return "Recurso nao encontrado no servidor.";
  if (status === 409) return "Ja existe uma conta com estes dados.";
  if (status === 429) return "Muitas tentativas num curto periodo. Aguarda um pouco e tenta novamente.";
  if (status === 502) return "Backend inacessivel. Confirma se o servidor esta a correr na porta 8080.";
  if (status >= 500) return "Erro interno do servidor.";
  return "Nao foi possivel concluir a operacao.";
}

async function performRequest(path: string, options: ApiOptions = {}, tokenOverride?: string | null) {
  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  if (!headers.has("Content-Type") && options.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  const token = tokenOverride ?? options.token;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(`/api/xdigital/${path.replace(/^\/+/, "")}`, {
    ...options,
    headers,
    cache: "no-store",
  });
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}) {
  let response = await performRequest(path, options);

  if (response.status === 401 && getStoredRefreshToken() && path !== "auth/refresh") {
    const refreshed = await refreshStoredSession();
    if (refreshed?.token) {
      response = await performRequest(path, options, refreshed.token);
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
    const message = apiMessage ?? statusFallbackMessage(response.status);
    throw new Error(message);
  }

  const method = String(options.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    emitClientDataChanged();
  }

  return payload as T;
}
