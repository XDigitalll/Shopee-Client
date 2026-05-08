"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

function GoogleCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [message, setMessage] = useState("A concluir login com Google...");

  useEffect(() => {
    const token = searchParams.get("token");
    const refreshToken = searchParams.get("refreshToken");
    const error = searchParams.get("error");

    if (error) {
      router.replace(`/login?error=${encodeURIComponent(error)}`);
      return;
    }

    if (!token || !refreshToken) {
      router.replace("/login?error=Nao foi possivel concluir o login com Google.");
      return;
    }

    login(token, refreshToken);

    const redirectTo =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem("google_auth_redirect") || "/"
        : "/";

    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("google_auth_redirect");
    }

    setMessage("Login concluido. A redirecionar...");
    router.replace(redirectTo);
    router.refresh();
  }, [login, router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FFF8F5] px-5">
      <div className="w-full max-w-md rounded-[32px] border border-[#F1D4CB] bg-white p-8 text-center shadow-[0_30px_80px_rgba(232,67,26,0.08)]">
        <div className="mx-auto h-10 w-10 rounded-full border-2 border-[#E8431A] border-t-transparent animate-spin" />
        <h1 className="mt-5 text-2xl font-black text-[#1A1410]">Login com Google</h1>
        <p className="mt-3 text-sm leading-7 text-[#6D625C]">{message}</p>
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
