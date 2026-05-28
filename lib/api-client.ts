import { AuthExpiredError, expireStoredSession, refreshStoredSession } from "@/lib/auth";
import { normalizeClientError } from "@/lib/client-errors";
import { getCsrfToken, XSRF_HEADER } from "@/lib/csrf";

export const CLIENT_DATA_CHANGED_EVENT = "client:data-changed";

export class ApiRequestError extends Error {
  status?: number;
  code?: string;
  channel?: string;

  constructor(message: string, status?: number, code?: string, channel?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.channel = channel;
  }
}

export function emitClientDataChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(CLIENT_DATA_CHANGED_EVENT));
}

type ApiOptions = RequestInit & {
  token?: string | null;
};

function isFormDataBody(body: BodyInit | null | undefined) {
  if (!body || typeof FormData === "undefined") return false;
  if (body instanceof FormData) return true;
  const candidate = body as unknown as {
    append?: unknown;
    entries?: unknown;
    get?: unknown;
    [Symbol.toStringTag]?: string;
  };
  return candidate[Symbol.toStringTag] === "FormData"
    || (typeof candidate.append === "function"
      && typeof candidate.entries === "function"
      && typeof candidate.get === "function");
}

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
  if (status === 400) return "Os dados enviados são inválidos. Verifica o formulário.";
  if (status === 401) return "A tua sessão expirou. Inicia sessão novamente.";
  if (status === 403) return "Não tens permissão para esta ação.";
  if (status === 404) return "Não encontrámos o que procuras.";
  if (status === 409) return "Operação em conflito. Verifica os dados e tenta novamente.";
  if (status === 410) return "Este recurso já não está disponível.";
  if (status === 422) return "Verifica os dados preenchidos e tenta novamente.";
  if (status === 429) return "Demasiadas tentativas. Aguarda um pouco e tenta de novo.";
  if (status === 502 || status === 503 || status === 504)
    return "O servidor está temporariamente indisponível. Tenta novamente.";
  if (status >= 500) return "Ocorreu um erro interno. A equipa foi notificada. Tenta mais tarde.";
  return "Não foi possível concluir a operação.";
}

async function performRequest(path: string, options: ApiOptions = {}) {
  const headers = new Headers(options.headers);
  const isFormData = isFormDataBody(options.body);

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

async function expireAndThrow(): Promise<never> {
  await expireStoredSession({ redirectToLogin: true });
  throw new AuthExpiredError();
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const mutation = isMutation(method);
  const csrfBeforeRequest = getCsrfToken();
  let response = await performRequest(path, options);

  if (response.status === 401 && path !== "auth/refresh") {
    const refreshed = await refreshStoredSession();
    if (!refreshed) {
      await expireAndThrow();
    }
    response = await performRequest(path, options);
  }

  if (mutation && response.status === 403) {
    const csrfAfterResponse = getCsrfToken();

    if (csrfAfterResponse && csrfAfterResponse !== csrfBeforeRequest) {
      response = await performRequest(path, options);
    }
  }

  if (response.status === 204) {
    return null as T;
  }

  const payload = await response.json().catch(() => null);

  if (response.status === 401) {
    await expireAndThrow();
  }

  if (!response.ok) {
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const apiMessage = getApiErrorMessage(payload);
    const shouldUseBackendMessage =
      Boolean(apiMessage) && (response.status === 400 || response.status === 422);
    const fallback = statusFallbackMessage(response.status);
    const message = normalizeClientError(
      shouldUseBackendMessage ? apiMessage! : fallback,
      fallback,
      response.status
    ).message;
    throw new ApiRequestError(
      message,
      response.status,
      typeof record.code === "string" ? record.code : undefined,
      typeof record.channel === "string" ? record.channel : undefined,
    );
  }

  if (mutation) {
    emitClientDataChanged();
  }

  return payload as T;
}
