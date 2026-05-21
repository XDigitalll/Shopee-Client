"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import {
  GOOGLE_CALLBACK_SESSION_ERROR,
  googleCallbackLogPayload,
  hasGoogleCallbackTokens,
  normalizeGoogleAuthMessage,
} from "@/lib/google-auth";

const FETCH_TIMEOUT_MS = 9000;
const RETRY_DELAYS_MS = [0, 300, 800, 1500] as const;

function devLog(...args: unknown[]) {
  if (process.env.NODE_ENV !== "production") {
    console.debug("[google-callback]", ...args);
  }
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal });
  } finally {
    window.clearTimeout(id);
  }
}

async function postWithTimeout(url: string, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(id);
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function resolveSession(): Promise<boolean> {
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt]);
    }

    devLog(`/me attempt ${attempt + 1}`);

    let res: Response | null = null;
    try {
      res = await fetchWithTimeout("/api/auth/me");
      devLog(`/me status=${res.status}`);
    } catch {
      devLog(`/me attempt ${attempt + 1} aborted/failed`);
      continue;
    }

    if (res.ok) {
      devLog(`session confirmed on attempt ${attempt + 1}`);
      return true;
    }

    if (res.status === 401 && attempt === 0) {
      devLog("401 on /me, trying /refresh");
      try {
        const refreshRes = await postWithTimeout("/api/auth/refresh", {});
        devLog(`/refresh status=${refreshRes.status}`);
        if (!refreshRes.ok) {
          return false;
        }
      } catch {
        devLog("/refresh failed");
        return false;
      }
    } else if (res.status !== 401) {
      return false;
    }
  }

  return false;
}

function GoogleCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [phase, setPhase] = useState<"loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState(GOOGLE_CALLBACK_SESSION_ERROR);
  const hasRun = useRef(false);

  const persistTokenSession = useCallback(async () => {
    const token = searchParams.get("token");
    const refreshToken = searchParams.get("refreshToken");
    if (!token || !refreshToken) return true;

    devLog("persisting token session via BFF");
    const response = await postWithTimeout("/api/auth/google/session", { token, refreshToken });
    devLog(`/google/session status=${response.status}`);
    if (!response.ok) {
      return false;
    }

    window.history.replaceState(null, "", "/login/google/callback");
    return true;
  }, [searchParams]);

  const handleFinishLogin = useCallback(async () => {
    const stored = await persistTokenSession().catch(() => false);
    if (!stored) {
      devLog("could not persist Google tokens");
      setErrorMessage(GOOGLE_CALLBACK_SESSION_ERROR);
      setPhase("error");
      return;
    }

    const ok = await resolveSession();

    if (!ok) {
      devLog("session could not be confirmed, showing error UI");
      setErrorMessage(GOOGLE_CALLBACK_SESSION_ERROR);
      setPhase("error");
      return;
    }

    login();

    const redirectTo =
      window.sessionStorage.getItem("google_auth_redirect") || "/";
    window.sessionStorage.removeItem("google_auth_redirect");

    devLog("redirect target", redirectTo);
    router.replace(redirectTo);

    window.setTimeout(() => {
      if (window.location.pathname === "/login/google/callback") {
        devLog("router.replace stalled, forcing navigation via window.location");
        window.location.href = redirectTo;
      }
    }, 2000);
  }, [login, persistTokenSession, router]);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    devLog("callback started", googleCallbackLogPayload(searchParams, document.cookie || ""));

    const error = searchParams.get("error");
    if (error) {
      router.replace(`/login?error=${encodeURIComponent(normalizeGoogleAuthMessage(error))}`);
      return;
    }

    if (!hasGoogleCallbackTokens(searchParams)) {
      devLog("no token query params, relying on cookies");
    }

    void handleFinishLogin();
  }, [handleFinishLogin, router, searchParams]);

  const handleRetry = useCallback(() => {
    setPhase("loading");
    void handleFinishLogin();
  }, [handleFinishLogin]);

  if (phase === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FFF8F5] px-5">
        <div className="w-full max-w-md rounded-[32px] border border-[#F1D4CB] bg-white p-8 text-center shadow-[0_30px_80px_rgba(232,67,26,0.08)]">
          <h1 className="text-2xl font-black text-[#1A1410]">Problema no login</h1>
          <p className="mt-3 text-sm leading-7 text-[#6D625C]">
            {errorMessage}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              className="w-full rounded-full bg-[#E8431A] py-3 text-sm font-semibold text-white"
              onClick={handleRetry}
            >
              Tentar novamente
            </button>
            <button
              className="w-full rounded-full border border-[#E8431A] py-3 text-sm font-semibold text-[#E8431A]"
              onClick={() => router.replace("/login")}
            >
              Voltar ao login
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FFF8F5] px-5">
      <div className="w-full max-w-md rounded-[32px] border border-[#F1D4CB] bg-white p-8 text-center shadow-[0_30px_80px_rgba(232,67,26,0.08)]">
        <div className="mx-auto h-10 w-10 rounded-full border-2 border-[#E8431A] border-t-transparent animate-spin" />
        <h1 className="mt-5 text-2xl font-black text-[#1A1410]">Login com Google</h1>
        <p className="mt-3 text-sm leading-7 text-[#6D625C]">A concluir login com Google...</p>
      </div>
    </main>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#FFF8F5]" />}>
      <GoogleCallbackContent />
    </Suspense>
  );
}
