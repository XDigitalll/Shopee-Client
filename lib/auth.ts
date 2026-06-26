export const AUTH_CHANGE_EVENT = "shopeex-auth-change";
export const AUTH_EXPIRED_EVENT = "shopeex-auth-expired";

const LEGACY_TOKEN_KEYS = [
  "shopee_client_token",
  "shopee_client_refresh_token",
  "shopee_admin_token",
  "shopee_refresh_token",
];
const MANUAL_LOGOUT_KEY = "shopeex-manual-logout-at";
const MANUAL_LOGOUT_GRACE_MS = 10_000;
const authenticatedRequestControllers = new Set<AbortController>();

export type ClientSessionProfile = {
  displayName?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatarUrl?: string;
  phoneNumber?: string;
  provider?: string;
  authProvider?: string;
  roles?: unknown[];
  mustChangePassword?: boolean;
  profileIncomplete?: boolean;
  accountCompletionPercentage?: number;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  hasRealEmail?: boolean;
  expiresAt?: number | null;
};

export class AuthExpiredError extends Error {
  code = "AUTH_EXPIRED" as const;

  constructor(message = "A tua sessao expirou. Entra novamente.") {
    super(message);
    this.name = "AuthExpiredError";
  }
}

function emitAuthChange() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

function emitAuthExpired() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

export function isManualLogoutInProgress() {
  if (typeof window === "undefined") {
    return false;
  }

  const raw = window.sessionStorage.getItem(MANUAL_LOGOUT_KEY);
  const startedAt = raw ? Number(raw) : 0;
  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    window.sessionStorage.removeItem(MANUAL_LOGOUT_KEY);
    return false;
  }

  if (Date.now() - startedAt > MANUAL_LOGOUT_GRACE_MS) {
    window.sessionStorage.removeItem(MANUAL_LOGOUT_KEY);
    return false;
  }

  return true;
}

export function clearManualLogoutMarker() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(MANUAL_LOGOUT_KEY);
}

export function abortAuthenticatedRequests() {
  for (const controller of authenticatedRequestControllers) {
    controller.abort();
  }
  authenticatedRequestControllers.clear();
}

export function trackAuthenticatedRequest(controller: AbortController) {
  authenticatedRequestControllers.add(controller);
  return () => {
    authenticatedRequestControllers.delete(controller);
  };
}

export function beginManualLogout() {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(MANUAL_LOGOUT_KEY, String(Date.now()));
  }
  abortAuthenticatedRequests();
}

export function clearLegacyAuthStorage({ emit = false }: { emit?: boolean } = {}) {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of LEGACY_TOKEN_KEYS) {
    window.localStorage.removeItem(key);
  }

  if (emit) {
    emitAuthChange();
  }
}

export function clearStoredSession() {
  clearManualLogoutMarker();
  clearLegacyAuthStorage({ emit: true });
}

export function clearStoredToken() {
  clearStoredSession();
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function loadSessionProfile() {
  if (isManualLogoutInProgress()) {
    return null;
  }

  clearLegacyAuthStorage();

  const controller = new AbortController();
  const untrack = trackAuthenticatedRequest(controller);
  let response: Response;
  try {
    response = await fetch("/api/auth/me", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error) && isManualLogoutInProgress()) {
      return null;
    }
    throw error;
  } finally {
    untrack();
  }

  if (isManualLogoutInProgress()) {
    return null;
  }

  if (response.status === 401 || response.status === 403) {
    clearLegacyAuthStorage();
    throw new AuthExpiredError();
  }

  if (!response.ok) {
    return null;
  }

  return (await response.json().catch(() => null)) as ClientSessionProfile | null;
}

// Module-level singleton: ensures that concurrent 401 responses from multiple
// simultaneous API calls only ever trigger a single POST /api/auth/refresh.
// All callers (api-client.ts and auth-provider.tsx) share this promise, so the
// browser sends exactly one refresh request to the server per expiry cycle.
// The variable is intentionally at module scope (not inside a closure) so it
// is shared across all call sites within the same browser session.
let pendingRefreshPromise: Promise<ClientSessionProfile | null> | null = null;

export async function expireStoredSession({ redirectToLogin = false } = {}) {
  clearLegacyAuthStorage();

  if (typeof window === "undefined" || isManualLogoutInProgress()) {
    return;
  }

  void fetch("/api/auth/logout", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
  }).catch(() => {});

  emitAuthExpired();

  if (redirectToLogin && !window.location.pathname.startsWith("/login")) {
    window.location.assign("/login?expired=true");
  }
}

export async function refreshStoredSession(): Promise<ClientSessionProfile | null> {
  // Guard: the function uses browser-only APIs; on the server return null.
  if (typeof window === "undefined" || isManualLogoutInProgress()) return null;

  if (pendingRefreshPromise) return pendingRefreshPromise;

  pendingRefreshPromise = (async () => {
    clearLegacyAuthStorage();

    const controller = new AbortController();
    const untrack = trackAuthenticatedRequest(controller);
    let response: Response;
    try {
      response = await fetch("/api/auth/refresh", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error) && isManualLogoutInProgress()) {
        return null;
      }
      throw error;
    } finally {
      untrack();
    }

    if (isManualLogoutInProgress()) {
      return null;
    }

    if (response.status === 401) {
      await expireStoredSession();
      return null;
    }

    if (!response.ok) {
      await expireStoredSession();
      return null;
    }

    try {
      return await loadSessionProfile();
    } catch (error) {
      if (error instanceof AuthExpiredError) {
        await expireStoredSession();
        return null;
      }
      throw error;
    }
  })().finally(() => {
    pendingRefreshPromise = null;
  });

  return pendingRefreshPromise;
}

export function notifyAuthChanged() {
  emitAuthChange();
}
