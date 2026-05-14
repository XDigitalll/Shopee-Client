export const AUTH_CHANGE_EVENT = "shopeex-auth-change";

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

function emitAuthChange() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
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

  if (!response.ok) {
    return null;
  }

  return (await response.json().catch(() => null)) as ClientSessionProfile | null;
}

export async function refreshStoredSession() {
  clearLegacyAuthStorage();

  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    clearStoredSession();
    return null;
  }

  return loadSessionProfile();
}

export function notifyAuthChanged() {
  emitAuthChange();
}
