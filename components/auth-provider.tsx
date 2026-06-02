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
  AUTH_EXPIRED_EVENT,
  AuthExpiredError,
  clearLegacyAuthStorage,
  expireStoredSession,
  loadSessionProfile,
  notifyAuthChanged,
  refreshStoredSession,
  type ClientSessionProfile,
} from "@/lib/auth";

type SessionProfile = ClientSessionProfile;

type AuthContextValue = {
  token: string | null;
  user: SessionProfile | null;
  isAuthenticated: boolean;
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
  emailVerified: boolean;
  phoneVerified: boolean;
  hasRealEmail: boolean;
  login: (_nextToken?: string | null, _nextRefreshToken?: string | null) => void;
  logout: () => void;
  refreshProfile: () => Promise<void>;
};

const AUTHENTICATED_MARKER = "cookie-session";
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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
    pathname.startsWith("/onboarding/security") ||
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
  const [sessionProfile, setSessionProfile] = useState<SessionProfile | null>(null);
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const refreshFailureHandledRef = useRef(false);
  const currentRefreshPromiseRef = useRef<ReturnType<typeof refreshStoredSession> | null>(null);

  const isAuthenticated = Boolean(sessionProfile);
  const token = isAuthenticated ? AUTHENTICATED_MARKER : null;

  const clearExpiredSessionAndRedirect = useCallback(() => {
    refreshFailureHandledRef.current = true;
    currentRefreshPromiseRef.current = null;
    clearLegacyAuthStorage();
    setSessionProfile(null);
    setIsReady(true);
    void fetch("/api/auth/logout", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
    }).catch(() => {});
    router.replace("/login?expired=true");
  }, [router]);

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await loadSessionProfile();
      setSessionProfile(profile);
    } catch (error) {
      if (error instanceof AuthExpiredError) {
        clearExpiredSessionAndRedirect();
        return;
      }
      throw error;
    }
  }, [clearExpiredSessionAndRedirect]);

  const handleRefreshFailureOnce = useCallback((reason: string) => {
    if (refreshFailureHandledRef.current) {
      return;
    }

    const authRequired = isAuthRequiredPath(pathname);
    refreshFailureHandledRef.current = true;
    currentRefreshPromiseRef.current = null;
    clearLegacyAuthStorage();
    setSessionProfile(null);
    setIsReady(true);
    if (authRequired) {
      void expireStoredSession();
    }

    if (process.env.NODE_ENV !== "production") {
      console.debug("[auth] refresh failed", reason);
    }

    if (authRequired) {
      router.replace("/login?expired=true");
    }
  }, [pathname, router]);

  const safeRefresh = useCallback((reason = "unknown") => {
    if (currentRefreshPromiseRef.current) {
      return currentRefreshPromiseRef.current;
    }

    const refreshPromise = refreshStoredSession()
      .then((profile) => {
        if (profile) {
          refreshFailureHandledRef.current = false;
          setSessionProfile(profile);
        } else {
          handleRefreshFailureOnce(reason);
        }
        return profile;
      })
      .catch(() => {
        handleRefreshFailureOnce(reason);
        return null;
      })
      .finally(() => {
        currentRefreshPromiseRef.current = null;
      });

    currentRefreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  }, [handleRefreshFailureOnce]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      let profile: SessionProfile | null = null;
      try {
        profile = await loadSessionProfile();
      } catch (error) {
        if (!(error instanceof AuthExpiredError)) throw error;
        // /auth/me returned 401: access token absent or expired.
        // Fall through to safeRefresh — this avoids incorrectly redirecting the
        // Google OAuth callback page, which hasn't persisted its tokens yet when
        // bootstrap fires concurrently. safeRefresh handles graceful failure and
        // only redirects for auth-required paths, which the callback page is not.
      }
      if (cancelled) return;

      if (profile) {
        setSessionProfile(profile);
        setIsReady(true);
        return;
      }

      if (!isAuthRequiredPath(pathname)) {
        setSessionProfile(null);
        setIsReady(true);
        return;
      }

      const refreshed = await safeRefresh("bootstrap");
      if (!cancelled) {
        setSessionProfile(refreshed);
        setIsReady(true);
      }
    };

    void bootstrap();

    const handleAuthChange = () => {
      void refreshProfile();
    };

    const handleAuthExpired = () => {
      setSessionProfile(null);
      setIsReady(true);
      if (isAuthRequiredPath(pathname)) {
        router.replace("/login?expired=true");
      }
    };

    window.addEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);

    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, [pathname, refreshProfile, router, safeRefresh]);

  useEffect(() => {
    const isProtectedRoute = isAuthRequiredPath(pathname);

    if (!isReady) {
      return;
    }

    if (!isAuthenticated && isProtectedRoute) {
      router.replace("/login?expired=true");
    }
  }, [isAuthenticated, isReady, pathname, router]);

  useEffect(() => {
    if (!isReady || !isAuthenticated) return;
    const mustChange = sessionProfile?.mustChangePassword === true;
    if (!mustChange) return;
    if (pathname?.startsWith("/complete-account/password")) return;
    if (pathname?.startsWith("/onboarding/security")) return;
    if (pathname === "/login") return;
    router.replace("/onboarding/security");
  }, [isAuthenticated, isReady, pathname, router, sessionProfile?.mustChangePassword]);

  useEffect(() => {
    if (!sessionProfile?.expiresAt) {
      return;
    }

    const remainingMs = sessionProfile.expiresAt - Date.now();
    const timeoutMs = Math.max(remainingMs - 60_000, 0);

    const timeoutId = window.setTimeout(() => {
      void safeRefresh("scheduled");
    }, timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [safeRefresh, sessionProfile?.expiresAt]);

  const {
    userLabel,
    userInitials,
    userAvatarUrl,
    userEmail,
    userPhone,
    authSource,
    mustChangePassword,
    profileIncomplete,
    accountCompletionPercentage,
    emailVerified,
    phoneVerified,
    hasRealEmail,
  } = useMemo(() => {
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
          : typeof sessionProfile?.email === "string" && sessionProfile.email.trim()
            ? sessionProfile.email
            : "Cliente ShopeeMz";
    const rawEmail = typeof sessionProfile?.email === "string" && sessionProfile.email.trim()
      ? sessionProfile.email.trim()
      : "";
    const emailValue = rawEmail.endsWith("@xdigital.local") ? "" : rawEmail;
    const providerRaw = typeof sessionProfile?.authProvider === "string" && sessionProfile.authProvider.trim()
      ? sessionProfile.authProvider
      : sessionProfile?.provider;
    const providerValue = typeof providerRaw === "string" && providerRaw.trim()
      ? providerRaw.trim().toUpperCase()
      : "LOCAL";
    const avatarUrlValue = typeof sessionProfile?.avatarUrl === "string" && sessionProfile.avatarUrl.trim()
      ? sessionProfile.avatarUrl.trim()
      : "";
    const userLabelValue = toDisplayName(rawName) || "Cliente ShopeeMz";
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
      mustChangePassword: sessionProfile?.mustChangePassword === true,
      profileIncomplete: sessionProfile?.profileIncomplete === true,
      accountCompletionPercentage: typeof sessionProfile?.accountCompletionPercentage === "number"
        ? sessionProfile.accountCompletionPercentage
        : 0,
      emailVerified: sessionProfile?.emailVerified === true,
      phoneVerified: sessionProfile?.phoneVerified === true,
      hasRealEmail: sessionProfile?.hasRealEmail === true || Boolean(emailValue),
    };
  }, [sessionProfile]);

  const value = {
    token,
    user: sessionProfile,
    isAuthenticated,
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
    emailVerified,
    phoneVerified,
    hasRealEmail,
    login: () => {
      refreshFailureHandledRef.current = false;
      currentRefreshPromiseRef.current = null;
      notifyAuthChanged();
      void refreshProfile();
    },
    logout: () => {
      refreshFailureHandledRef.current = true;
      currentRefreshPromiseRef.current = null;
      clearLegacyAuthStorage();
      setSessionProfile(null);
      void fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
      router.replace("/login");
    },
    refreshProfile,
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
