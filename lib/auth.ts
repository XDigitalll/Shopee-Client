export const TOKEN_KEY = "shopee_client_token";
export const REFRESH_TOKEN_KEY = "shopee_client_refresh_token";
export const AUTH_CHANGE_EVENT = "shopeex-auth-change";

// Legacy keys from before the rename — kept only for one-time migration on bootstrap.
const LEGACY_TOKEN_KEY = "shopee_admin_token";
const LEGACY_REFRESH_TOKEN_KEY = "shopee_refresh_token";

type StoredSession = {
  token: string;
  refreshToken: string;
};

let refreshPromise: Promise<StoredSession | null> | null = null;

function emitAuthChange() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function getStoredToken() {
  if (typeof window === "undefined") return null;

  const token = window.localStorage.getItem(TOKEN_KEY);
  if (token) return token;

  // One-time migration: promote legacy key to new key and drop the old one.
  const legacy = window.localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacy) {
    window.localStorage.setItem(TOKEN_KEY, legacy);
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    return legacy;
  }

  return null;
}

export function getStoredRefreshToken() {
  if (typeof window === "undefined") return null;

  const token = window.localStorage.getItem(REFRESH_TOKEN_KEY);
  if (token) return token;

  // One-time migration: promote legacy key to new key and drop the old one.
  const legacy = window.localStorage.getItem(LEGACY_REFRESH_TOKEN_KEY);
  if (legacy) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, legacy);
    window.localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
    return legacy;
  }

  return null;
}

export function storeSession(token: string, refreshToken: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  emitAuthChange();
}

export function storeToken(token: string) {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    return;
  }

  storeSession(token, refreshToken);
}

export function clearStoredSession() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  // Also remove legacy keys so logout is always clean regardless of migration state.
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  emitAuthChange();
}

export function clearStoredToken() {
  clearStoredSession();
}

export async function refreshStoredSession() {
  if (typeof window === "undefined") {
    return null;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    clearStoredSession();
    return null;
  }

  refreshPromise = fetch("/api/xdigital/auth/refresh", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  })
    .then(async (response) => {
      const payload = (await response.json().catch(() => null)) as StoredSession | null;
      if (!response.ok || !payload?.token || !payload.refreshToken) {
        clearStoredSession();
        return null;
      }

      storeSession(payload.token, payload.refreshToken);
      return payload;
    })
    .catch(() => {
      clearStoredSession();
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}
