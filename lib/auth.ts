export const AUTH_CHANGE_EVENT = "shopeex-auth-change";
export const AUTH_EXPIRED_EVENT = "shopeex-auth-expired";

export const PROFILE_COOKIE = "shopee_client_profile";

const LEGACY_TOKEN_KEYS = [
  "shopee_client_token",
  "shopee_client_refresh_token",
  "shopee_admin_token",
  "shopee_refresh_token",
];

export type ClientSessionProfile = {
  displayName?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatarUrl?: string;
  phoneNumber?: string;
  provider?: string;
  roles?: unknown[];
  mustChangePassword?: boolean;
  profileIncomplete?: boolean;
  accountCompletionPercentage?: number;
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
  clearLegacyAuthStorage({ emit: true });
}

export function clearStoredToken() {
  clearStoredSession();
}

export function getProfileCookie(): Record<string, unknown> | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(PROFILE_COOKIE + "="));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match.slice(PROFILE_COOKIE.length + 1))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function loadSessionProfile() {
  clearLegacyAuthStorage();

  const response = await fetch("/api/auth/me", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });

  if (response.status === 401) {
    clearStoredSession();
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
  clearStoredSession();

  if (typeof window === "undefined") {
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
  if (typeof window === "undefined") return null;

  if (pendingRefreshPromise) return pendingRefreshPromise;

  pendingRefreshPromise = (async () => {
    clearLegacyAuthStorage();

    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
    });

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
