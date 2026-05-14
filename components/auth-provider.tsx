"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AUTH_CHANGE_EVENT,
  TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  clearStoredSession,
  getStoredRefreshToken,
  getStoredToken,
  refreshStoredSession,
  storeSession,
} from "@/lib/auth";

type SessionProfile = {
  displayName?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatarUrl?: string;
  phoneNumber?: string;
  profileIncomplete?: boolean;
  accountCompletionPercentage?: number;
};

type AuthContextValue = {
  token: string | null;
  isReady: boolean;
  userLabel: string;
  userInitials: string;
  userAvatarUrl: string;
  userEmail: string;
  userPhone: string;
  authSource: string;
  mustChangePassword: boolean;
  profileIncomplete: boolean;
  accountCompletionPercentage: number;
  login: (nextToken: string, nextRefreshToken?: string | null) => void;
  logout: () => void;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodeJwtPayload(token: string | null) {
  if (!token) return null;

  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getTokenExpirationMs(token: string | null) {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp !== "number") {
    return null;
  }

  return exp * 1000;
}

function toDisplayName(value: string) {
  return value
    .replace(/@.*$/, "")
    .replace(/[._-]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toInitials(value: string) {
  const parts = value.split(" ").filter(Boolean);
  if (parts.length === 0) return "SX";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function isAuthRequiredPath(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  const isPublicRoute =
    pathname === "/" ||
    pathname === "/external-order" ||
    pathname === "/store" ||
    pathname.startsWith("/store/") ||
    pathname === "/cart" ||
    pathname.startsWith("/cart/") ||
    pathname === "/delivery-address" ||
    pathname.startsWith("/delivery-address/") ||
    pathname === "/orders/external/new" ||
    pathname.startsWith("/orders/external/new/") ||
    pathname === "/profile/change-password" ||
    pathname.startsWith("/complete-account");

  if (isPublicRoute) {
    return false;
  }

  return (
    pathname.startsWith("/orders") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/settings")
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [sessionProfile, setSessionProfile] = useState<SessionProfile | null>(null);
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const lastActivityRefreshRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const currentRefreshPromiseRef = useRef<ReturnType<typeof refreshStoredSession> | null>(null);
  const refreshFailureHandledRef = useRef(false);

  const syncSessionFromStorage = useCallback(() => {
    setToken(getStoredToken());
    setRefreshToken(getStoredRefreshToken());
  }, []);

  const handleRefreshFailureOnce = useCallback((reason: string) => {
    if (refreshFailureHandledRef.current) {
      return;
    }

    refreshFailureHandledRef.current = true;
    currentRefreshPromiseRef.current = null;
    isRefreshingRef.current = false;
    clearStoredSession();
    setSessionProfile(null);
    syncSessionFromStorage();

    if (process.env.NODE_ENV !== "production") {
      console.log("[auth] refresh failed: logout controlled", reason);
    }

    if (isAuthRequiredPath(pathname)) {
      router.replace("/login?expired=1");
    }
  }, [pathname, router, syncSessionFromStorage]);

  const safeRefresh = useCallback((reason = "unknown") => {
    if (refreshFailureHandledRef.current) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[auth] refresh skipped: failure already handled", reason);
      }
      return Promise.resolve(null);
    }

    if (currentRefreshPromiseRef.current) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[auth] refresh skipped: already refreshing", reason);
      }
      return currentRefreshPromiseRef.current;
    }

    if (isRefreshingRef.current) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[auth] refresh skipped: already refreshing", reason);
      }
      return currentRefreshPromiseRef.current ?? Promise.resolve(null);
    }

    isRefreshingRef.current = true;
    if (process.env.NODE_ENV !== "production") {
      console.log("[auth] refresh started", reason);
    }

    const refreshPromise = refreshStoredSession()
      .then((session) => {
        if (process.env.NODE_ENV !== "production") {
          console.log(session ? "[auth] refresh completed" : "[auth] refresh failed", reason);
        }
        if (session) {
          refreshFailureHandledRef.current = false;
        } else {
          handleRefreshFailureOnce(reason);
        }
        return session;
      })
      .catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.log("[auth] refresh failed", reason, error);
        }
        handleRefreshFailureOnce(reason);
        return null;
      })
      .finally(() => {
        isRefreshingRef.current = false;
        currentRefreshPromiseRef.current = null;
        syncSessionFromStorage();
      });

    currentRefreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  }, [handleRefreshFailureOnce, syncSessionFromStorage]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      // Read directly from localStorage — not from state (which starts as null on server)
      const storedToken = getStoredToken();
      const storedRefreshToken = getStoredRefreshToken();

      setToken(storedToken);
      setRefreshToken(storedRefreshToken);

      if (storedToken) {
        setIsReady(true);
        return;
      }

      if (!storedRefreshToken) {
        setIsReady(true);
        return;
      }

      const refreshed = await safeRefresh("bootstrap");
      if (!cancelled) {
        if (!refreshed) {
          clearStoredSession();
          setSessionProfile(null);
        }
        syncSessionFromStorage();
        setIsReady(true);
      }
    };

    void bootstrap();

    const handleAuthChange = () => {
      syncSessionFromStorage();
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === TOKEN_KEY ||
        event.key === REFRESH_TOKEN_KEY ||
        event.key === "shopee_admin_token" ||
        event.key === "shopee_refresh_token"
      ) {
        syncSessionFromStorage();
      }
    };

    window.addEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [safeRefresh, syncSessionFromStorage]);

  useEffect(() => {
    const isProtectedRoute = isAuthRequiredPath(pathname);

    if (!isReady) {
      return;
    }

    if (!token && isProtectedRoute) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname || "/")}`);
    }
  }, [isReady, pathname, router, token]);

  const payload = useMemo(() => decodeJwtPayload(token), [token]);

  useEffect(() => {
    if (!isReady || !token) return;
    const mustChange = payload?.mustChangePassword === true;
    if (!mustChange) return;
    if (pathname?.startsWith("/complete-account/password")) return;
    if (pathname === "/login") return;
    router.replace("/complete-account/password");
  }, [isReady, token, payload, pathname, router]);

  useEffect(() => {
    if (!token || !refreshToken) {
      return;
    }

    const expirationMs = getTokenExpirationMs(token);
    if (!expirationMs) {
      return;
    }

    const remainingMs = expirationMs - Date.now();
    const timeoutMs = Math.max(remainingMs - 60_000, 0);

    const timeoutId = window.setTimeout(async () => {
      const refreshed = await safeRefresh("scheduled");
      if (!refreshed) {
        setSessionProfile(null);
        if (isAuthRequiredPath(pathname)) {
          router.replace("/login?expired=1");
        } else {
          clearStoredSession();
          syncSessionFromStorage();
        }
      }
    }, timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [pathname, refreshToken, router, safeRefresh, syncSessionFromStorage, token]);

  useEffect(() => {
    if (!refreshToken) {
      return;
    }

    const attemptRefresh = async () => {
      const currentToken = getStoredToken();
      const expirationMs = getTokenExpirationMs(currentToken);
      if (!expirationMs) {
        return;
      }

      const now = Date.now();
      if (expirationMs - now > 5 * 60_000) {
        return;
      }

      if (now - lastActivityRefreshRef.current < 30_000) {
        return;
      }

      lastActivityRefreshRef.current = now;
      const refreshed = await safeRefresh("activity");
      if (!refreshed && pathname?.startsWith("/") && pathname !== "/login") {
        setSessionProfile(null);
        if (isAuthRequiredPath(pathname)) {
          router.replace("/login?expired=1");
        } else {
          clearStoredSession();
          syncSessionFromStorage();
        }
      }
    };

    const handlePointer = () => {
      void attemptRefresh();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void attemptRefresh();
      }
    };

    window.addEventListener("focus", handlePointer);
    window.addEventListener("pointerdown", handlePointer);
    window.addEventListener("keydown", handlePointer);
    window.addEventListener("touchstart", handlePointer);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handlePointer);
      window.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("keydown", handlePointer);
      window.removeEventListener("touchstart", handlePointer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [pathname, refreshToken, router, safeRefresh, syncSessionFromStorage]);

  useEffect(() => {
    if (!token) {
      setSessionProfile(null);
      return;
    }

    let active = true;

    const loadProfile = async () => {
      try {
        const response = await fetch("/api/xdigital/users/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (response.status === 401) {
          const refreshed = await safeRefresh("profile-401");
          if (!refreshed) {
            clearStoredSession();
            if (active) {
              setSessionProfile(null);
            }
            return;
          }
          if (!active) {
            return;
          }
          syncSessionFromStorage();
          return;
        }

        if (!response.ok) {
          return;
        }

        const payload = (await response.json().catch(() => null)) as SessionProfile | null;
        if (active && payload) {
          setSessionProfile(payload);
        }
      } catch {
      }
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, [safeRefresh, syncSessionFromStorage, token]);

  const { userLabel, userInitials, userAvatarUrl, userEmail, userPhone, authSource, mustChangePassword, profileIncomplete, accountCompletionPercentage } = useMemo(() => {
    const jwtPayload = decodeJwtPayload(token);
    const profileFullName = [sessionProfile?.firstName, sessionProfile?.lastName]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .join(" ")
      .trim();
    const rawName = profileFullName
      ? profileFullName
      : typeof sessionProfile?.displayName === "string" && sessionProfile.displayName.trim()
      ? sessionProfile.displayName
      : typeof sessionProfile?.name === "string" && sessionProfile.name.trim()
        ? sessionProfile.name
        : typeof jwtPayload?.name === "string" && jwtPayload.name.trim()
          ? jwtPayload.name
          : typeof jwtPayload?.sub === "string" && jwtPayload.sub.trim()
            ? jwtPayload.sub
            : "Cliente ShopeeX";
    const rawEmail = typeof sessionProfile?.email === "string" && sessionProfile.email.trim()
      ? sessionProfile.email.trim()
      : typeof jwtPayload?.email === "string" && jwtPayload.email.trim()
        ? jwtPayload.email.trim()
        : typeof jwtPayload?.sub === "string" && jwtPayload.sub.includes("@")
          ? jwtPayload.sub.trim()
          : "";
    const emailValue = rawEmail.endsWith("@xdigital.local") ? "" : rawEmail;
    const providerValue = typeof jwtPayload?.provider === "string" && jwtPayload.provider.trim()
      ? jwtPayload.provider.trim().toUpperCase()
      : "LOCAL";
    const avatarUrlValue = typeof sessionProfile?.avatarUrl === "string" && sessionProfile.avatarUrl.trim()
      ? sessionProfile.avatarUrl.trim()
      : typeof jwtPayload?.avatarUrl === "string" && jwtPayload.avatarUrl.trim()
        ? jwtPayload.avatarUrl.trim()
        : "";
    const userLabelValue = toDisplayName(rawName) || "Cliente ShopeeX";

    const mustChangePasswordValue = jwtPayload?.mustChangePassword === true;
    const profileIncompleteValue = sessionProfile?.profileIncomplete === true;
    const accountCompletionPercentageValue = typeof sessionProfile?.accountCompletionPercentage === "number"
      ? sessionProfile.accountCompletionPercentage
      : 0;
    const phoneValue = typeof sessionProfile?.phoneNumber === "string" && sessionProfile.phoneNumber.trim()
      ? sessionProfile.phoneNumber.trim()
      : "";

    return {
      userLabel: userLabelValue,
      userInitials: toInitials(userLabelValue),
      userAvatarUrl: avatarUrlValue,
      userEmail: emailValue,
      userPhone: phoneValue,
      authSource: providerValue,
      mustChangePassword: mustChangePasswordValue,
      profileIncomplete: profileIncompleteValue,
      accountCompletionPercentage: accountCompletionPercentageValue,
    };
  }, [sessionProfile, token]);

  const value = {
    token,
    isReady,
    userLabel,
    userInitials,
    userAvatarUrl,
    userEmail,
    userPhone,
    authSource,
    mustChangePassword,
    profileIncomplete,
    accountCompletionPercentage,
    login: (nextToken: string, nextRefreshToken?: string | null) => {
      const safeRefreshToken = nextRefreshToken?.trim() || getStoredRefreshToken();
      if (!safeRefreshToken) {
        return;
      }
      refreshFailureHandledRef.current = false;
      currentRefreshPromiseRef.current = null;
      isRefreshingRef.current = false;
      storeSession(nextToken, safeRefreshToken);
      syncSessionFromStorage();
    },
    logout: () => {
      refreshFailureHandledRef.current = true;
      currentRefreshPromiseRef.current = null;
      isRefreshingRef.current = false;
      clearStoredSession();
      setSessionProfile(null);
      syncSessionFromStorage();
      void fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
      router.replace("/login");
    },
    refreshProfile: async () => {
      const activeToken = getStoredToken();
      if (!activeToken) return;
      const response = await fetch("/api/xdigital/users/me", {
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json().catch(() => null)) as SessionProfile | null;
      if (payload) {
        setSessionProfile(payload);
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }

  return context;
}
