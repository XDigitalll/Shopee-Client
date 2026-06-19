"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ClientActionError, ClientProcessingOverlay } from "@/components/client-feedback-state";
import { Logo } from "@/components/logo";
import { apiFetch } from "@/lib/api-client";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { normalizeGoogleAuthMessage } from "@/lib/google-auth";
import type { CustomerProfile, VerificationDispatchResponse } from "@/lib/types";

type AuthTab = "login" | "register";

type LoginResponse = {
  authenticated?: boolean;
  user?: unknown;
  message?: string;
  code?: string;
  mustChangePassword?: boolean;
};

type RegisterResponse = {
  authenticated?: boolean;
  user?: unknown;
  message?: string;
  messages?: Record<string, string>;
};

const BENEFITS = [
  "Cotacoes em menos de 24h",
  "Pagamento via M-Pesa e e-Mola",
  "Entrega em todo Mocambique",
  "Rastreamento em tempo real",
];

const STORES = ["Shein", "Temu", "Amazon", "AliExpress", "Zara"];
const BACKEND_PUBLIC_URL = getBackendPublicUrl();
const TEMPORARY_ACCESS_PREFILL_KEY = "shopeemz_temporary_access_prefill";

function getBackendPublicUrl() {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (backendUrl) return backendUrl.replace(/\/$/, "");
  if (process.env.NODE_ENV === "development") return "http://localhost:8080";
  throw new Error("NEXT_PUBLIC_API_URL is required in production.");
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#EA4335" d="M12.22 10.2v3.78h5.34c-.22 1.22-.93 2.24-1.99 2.92l3.2 2.48c1.87-1.72 2.95-4.25 2.95-7.27 0-.68-.06-1.34-.18-1.97z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.44l-3.2-2.48c-.89.6-2.03.96-3.43.96-2.63 0-4.86-1.77-5.65-4.15H3.05v2.56A10 10 0 0 0 12 22z" />
      <path fill="#4A90E2" d="M6.35 13.89a5.98 5.98 0 0 1 0-3.78V7.55h-3.3a10 10 0 0 0 0 8.9z" />
      <path fill="#FBBC05" d="M12 5.96c1.47 0 2.79.5 3.83 1.48l2.87-2.87C16.96 2.95 14.7 2 12 2A10 10 0 0 0 3.05 7.55l3.3 2.56C7.14 7.73 9.37 5.96 12 5.96z" />
    </svg>
  );
}

function getStrength(password: string) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

function getStrengthMeta(score: number) {
  if (score <= 1) return { label: "Fraca", color: "#D94A38" };
  if (score === 2) return { label: "Razoavel", color: "#D59727" };
  if (score === 3) return { label: "Boa", color: "#78B84B" };
  return { label: "Forte", color: "#2F8F46" };
}

function getRegisterError(payload: RegisterResponse) {
  if (payload.message) return payload.message;
  if (payload.messages) {
    const firstMessage = Object.values(payload.messages).find(Boolean);
    if (firstMessage) return firstMessage;
  }
  return "Nao foi possivel criar a conta.";
}

function LoginPageContent() {
  const { token, login, refreshProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams.get("redirect") || searchParams.get("next") || searchParams.get("callbackUrl") || "/";
  const redirectTo = requestedRedirect.startsWith("/") && !requestedRedirect.startsWith("//") && !requestedRedirect.includes("://")
    ? requestedRedirect
    : "/";
  const initialTab = searchParams.get("tab") === "register" ? "register" : "login";
  const trackingPrompt = searchParams.get("reason") === "track-orders";
  const temporaryAccessPrompt = searchParams.get("reason") === "temporary-access";

  const [activeTab, setActiveTab] = useState<AuthTab>(initialTab);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const loginAction = useAsyncAction();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState("");
  const [verificationPrompt, setVerificationPrompt] = useState<{
    open: boolean;
    channel: "EMAIL" | "PHONE";
    destination: string;
    canVerifyNow: boolean;
  }>({ open: false, channel: "EMAIL", destination: "", canVerifyNow: false });
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(false);
  const registerAction = useAsyncAction();
  const isLoginLoading = loginAction.isRunning;
  const isRegisterLoading = registerAction.isRunning;
  const isBusy = isLoginLoading || isRegisterLoading;

  const passwordStrength = useMemo(() => getStrength(registerPassword), [registerPassword]);
  const strengthMeta = getStrengthMeta(passwordStrength);
  const passwordsMatch = confirmPassword.length > 0 && registerPassword === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && registerPassword !== confirmPassword;

  useEffect(() => {
    if (token) {
      router.replace(redirectTo);
    }
  }, [redirectTo, router, token]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    const expiredParam = searchParams.get("expired");
    if (errorParam) {
      setActiveTab("login");
      setLoginError(normalizeGoogleAuthMessage(errorParam));
      return;
    }
    if (expiredParam) {
      setActiveTab("login");
      setLoginError("A sua sessao expirou. Entre novamente para continuar.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!temporaryAccessPrompt) return;
    try {
      const raw = window.sessionStorage.getItem(TEMPORARY_ACCESS_PREFILL_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        loginIdentifier?: string;
        temporaryPassword?: string;
        createdAt?: number;
      };
      window.sessionStorage.removeItem(TEMPORARY_ACCESS_PREFILL_KEY);
      const isFresh = typeof parsed.createdAt === "number" && Date.now() - parsed.createdAt < 15 * 60 * 1000;
      if (!isFresh) return;
      if (parsed.loginIdentifier) setLoginEmail(parsed.loginIdentifier);
      if (parsed.temporaryPassword) setLoginPassword(parsed.temporaryPassword);
      setActiveTab("login");
      setLoginError("");
    } catch {
      window.sessionStorage.removeItem(TEMPORARY_ACCESS_PREFILL_KEY);
    }
  }, [temporaryAccessPrompt]);

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!loginEmail.trim() || !loginPassword) {
      setLoginError("Preencha o email ou telefone e a senha para continuar.");
      return;
    }

    setLoginError("");

    const result = await loginAction.run(async () => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          loginIdentifier: loginEmail.trim(),
          password: loginPassword,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as LoginResponse;

      if (!response.ok || !payload.authenticated) {
        if (payload.code === "GOOGLE_ACCOUNT_PASSWORD_NOT_SET") {
          throw new Error(normalizeGoogleAuthMessage(payload.message));
        }
        if (response.status === 401) {
          throw new Error(payload.message || "Email/telefone ou senha incorretos.");
        }
        throw new Error(normalizeGoogleAuthMessage(payload.message || "Nao foi possivel entrar na conta."));
      }

      login();

      if (payload.mustChangePassword) {
        router.replace("/onboarding/security");
      } else {
        router.replace(redirectTo);
      }
      router.refresh();
      return true;
    });

    if (!result) {
      setLoginError(loginAction.error);
    }
  };

  const handleRegisterSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const identifier = registerEmail.trim();
    const identifierIsEmail = identifier.includes("@");
    const phoneDigits = phone.replace(/\D/g, "");
    const normalizedPhone = phoneDigits ? `+258${phoneDigits}` : "";

    if (!firstName.trim() || !lastName.trim() || !identifier || !registerPassword) {
      setRegisterError("Preencha todos os campos obrigatorios.");
      setRegisterSuccess("");
      return;
    }

    if (registerPassword !== confirmPassword) {
      setRegisterError("As senhas nao coincidem. Verifica e tenta novamente.");
      setRegisterSuccess("");
      return;
    }

    setRegisterError("");
    setRegisterSuccess("");

    const result = await registerAction.run(async () => {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          identifier,
          email: identifierIsEmail ? identifier : undefined,
          phone: identifierIsEmail ? normalizedPhone || undefined : identifier,
          password: registerPassword,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as RegisterResponse;

      if (!response.ok || !payload.authenticated) {
        if (response.status === 400) {
          throw new Error(getRegisterError(payload));
        }
        throw new Error(payload.message || "Nao foi possivel criar a conta.");
      }

      setRegisterSuccess(identifierIsEmail
        ? "Conta criada. Enviamos um codigo para verificares o teu email."
        : "Conta criada com telefone. A verificacao por telefone/WhatsApp sera solicitada para acoes sensiveis.");
      login();
      setVerificationPrompt({
        open: true,
        channel: identifierIsEmail ? "EMAIL" : "PHONE",
        destination: identifierIsEmail ? identifier : normalizedPhone || identifier,
        canVerifyNow: identifierIsEmail,
      });
      return true;
    });

    if (!result) {
      setRegisterError(registerAction.error);
    }
  };

  const handleVerifyLater = async () => {
    await refreshProfile().catch(() => {});
    router.replace(redirectTo);
    router.refresh();
  };

  const handleResendVerification = async () => {
    setVerificationBusy(true);
    setVerificationError("");
    try {
      const dispatch = await apiFetch<VerificationDispatchResponse>("users/me/email-verification/request", {
        method: "POST",
      });
      setVerificationPrompt((current) => ({
        ...current,
        destination: dispatch.destinationMasked || current.destination,
      }));
      setRegisterSuccess(dispatch.message || "Codigo reenviado para o teu email.");
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : "Nao foi possivel reenviar o codigo.");
    } finally {
      setVerificationBusy(false);
    }
  };

  const handleConfirmVerification = async () => {
    if (verificationCode.trim().length < 6) {
      setVerificationError("Introduz o codigo de 6 digitos.");
      return;
    }
    setVerificationBusy(true);
    setVerificationError("");
    try {
      await apiFetch<CustomerProfile>("users/me/email-verification/confirm", {
        method: "POST",
        body: JSON.stringify({ code: verificationCode.trim() }),
      });
      await refreshProfile();
      router.replace(redirectTo);
      router.refresh();
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : "Codigo incorreto ou expirado.");
    } finally {
      setVerificationBusy(false);
    }
  };

  const handleGoogleLogin = () => {
    if (isBusy) return;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("google_auth_redirect", redirectTo);
      window.location.href = `${BACKEND_PUBLIC_URL}/oauth2/authorization/google`;
    }
  };

  return (
    <main className="min-h-screen bg-[#FFF8F5] text-[#1A1410]">
      <div className="mx-auto grid min-h-screen max-w-[1440px] lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
        <section className="relative hidden overflow-hidden bg-[#E8431A] px-10 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-14 xl:py-12">
          <div className="absolute -left-20 -top-20 h-56 w-56 rounded-full bg-white/6" />
          <div className="absolute -bottom-24 right-[-40px] h-72 w-72 rounded-full bg-white/6" />

          <div className="relative z-10">
            <Logo white />
          </div>

          <div className="relative z-10 max-w-xl space-y-8">
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-white/72">Plataforma oficial</p>
              <h1 className="max-w-lg text-5xl font-black leading-[1.05] text-[#FFD4C2] xl:text-6xl">
                Compra global com suporte local e controlo total.
              </h1>
              <p className="max-w-lg text-base leading-8 text-white/82 xl:text-lg">
                Entra na tua conta ShopeeMz para acompanhar pedidos, pagar em metical e receber atualizacoes claras desde a cotacao ate a entrega final.
              </p>
            </div>

            <ul className="space-y-4">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-center gap-3 text-sm font-medium text-white/92 xl:text-base">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/24 bg-white/12 text-white">
                    <CheckIcon />
                  </span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative z-10 space-y-3">
            <p className="text-sm font-semibold text-white/70">Lojas suportadas</p>
            <div className="flex flex-wrap gap-2">
              {STORES.map((store) => (
                <span key={store} className="rounded-full border border-white/14 bg-white/10 px-4 py-2 text-sm font-semibold text-white/92 backdrop-blur">
                  {store}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:px-10">
          <div className="relative w-full max-w-[560px] rounded-[32px] border border-[#F1D4CB] bg-white p-5 shadow-[0_30px_80px_rgba(232,67,26,0.08)] sm:p-8 lg:p-10">
            <ClientProcessingOverlay visible={isBusy} title={isLoginLoading ? "A entrar..." : "A criar conta..."} message="Nao feches esta janela." />
            {verificationPrompt.open ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[32px] bg-white/96 p-5">
                <div className="w-full rounded-[24px] border border-[#F1D4CB] bg-white p-5 shadow-xl">
                  <p className="text-sm font-black text-[#E8431A]">
                    {verificationPrompt.channel === "EMAIL" ? "Verifica o teu email" : "Conta criada por telefone"}
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-[#1A1410]">
                    {verificationPrompt.channel === "EMAIL" ? "Enviamos um codigo para ti" : "Verificacao por telefone em breve"}
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-[#6D625C]">
                    {verificationPrompt.channel === "EMAIL"
                      ? "Enviamos um codigo para teu email. Isso ajuda a proteger a tua conta e recuperar acesso."
                      : "Podes usar a conta agora. A verificacao por telefone/WhatsApp sera solicitada para acoes sensiveis."}
                  </p>
                  <p className="mt-2 break-all text-xs font-bold text-[#8D817A]">{verificationPrompt.destination}</p>

                  {verificationPrompt.canVerifyNow ? (
                    <div className="mt-5 space-y-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ""))}
                        placeholder="000000"
                        className="w-full rounded-2xl border border-[#E8DAD4] bg-[#FFFBFA] px-4 py-3.5 text-center text-xl font-black tracking-[0.35em] outline-none transition focus:border-[#E8431A]"
                      />
                      {verificationError ? (
                        <div className="rounded-2xl border border-[#F5D0D0] bg-[#FCEBEB] px-4 py-3 text-sm font-medium text-[#A53B32]">
                          {verificationError}
                        </div>
                      ) : null}
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={handleConfirmVerification}
                          disabled={verificationBusy}
                          className="rounded-2xl bg-[#E8431A] px-4 py-3 text-sm font-black text-white disabled:opacity-60"
                        >
                          {verificationBusy ? "A confirmar..." : "Confirmar"}
                        </button>
                        <button
                          type="button"
                          onClick={handleResendVerification}
                          disabled={verificationBusy}
                          className="rounded-2xl border border-[#F1D4CB] px-4 py-3 text-sm font-black text-[#C93812] disabled:opacity-60"
                        >
                          Reenviar codigo
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void handleVerifyLater()}
                    className="mt-3 w-full rounded-2xl px-4 py-3 text-sm font-bold text-[#6D625C] hover:bg-[#FFF8F5]"
                  >
                    Verificar depois
                  </button>
                </div>
              </div>
            ) : null}
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <Logo />
              <span className="rounded-full bg-[#FFF1EA] px-3 py-1 text-xs font-semibold text-[#E8431A]">Cliente</span>
            </div>

            <div className="mb-8 flex border-b border-[#F3D8CE]">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setActiveTab("login")}
                className={`relative flex-1 pb-4 text-sm font-bold transition ${activeTab === "login" ? "text-[#E8431A]" : "text-[#8E837D] hover:text-[#4E403B]"}`}
              >
                Entrar
                {activeTab === "login" && <span className="absolute inset-x-0 bottom-[-1px] h-[3px] rounded-full bg-[#E8431A]" />}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setActiveTab("register")}
                className={`relative flex-1 pb-4 text-sm font-bold transition ${activeTab === "register" ? "text-[#E8431A]" : "text-[#8E837D] hover:text-[#4E403B]"}`}
              >
                Criar conta
                {activeTab === "register" && <span className="absolute inset-x-0 bottom-[-1px] h-[3px] rounded-full bg-[#E8431A]" />}
              </button>
            </div>

            {activeTab === "login" ? (
              <div>
                <div className="mb-6 space-y-2">
                  <h2 className="text-3xl font-black text-[#1A1410]">Bem-vindo de volta</h2>
                  <p className="text-sm leading-7 text-[#6D625C]">Entra para ver os teus pedidos, continuar pagamentos e acompanhar entregas em tempo real.</p>
                </div>

                {trackingPrompt ? (
                  <div className="mb-5 rounded-2xl border border-[#F2D4CC] bg-[#FFF4EF] px-4 py-3 text-sm font-semibold leading-6 text-[#6D3325]">
                    Para acompanhar todos os teus pedidos, entra na tua conta. Se foi o teu primeiro pedido, a nossa equipa também vai contactar-te pelo telefone informado.
                  </div>
                ) : null}

                {temporaryAccessPrompt ? (
                  <div className="mb-5 rounded-2xl border border-[#F2D4CC] bg-[#FFF4EF] px-4 py-3 text-sm font-semibold leading-6 text-[#6D3325]">
                    Entra com o telefone e a senha temporária do teu primeiro pedido. Depois do login, troca por uma senha tua para proteger a conta.
                  </div>
                ) : null}

                <div className="mb-5">
                  <ClientActionError message={loginError || loginAction.error} />
                </div>

                <form className="space-y-4" onSubmit={(event) => void handleLoginSubmit(event)} aria-busy={isLoginLoading}>
                  <fieldset disabled={isLoginLoading} className="space-y-4 disabled:opacity-70">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#2F2521]">Email ou telefone</label>
                    <input
                      type="text"
                      value={loginEmail}
                      onChange={(event) => setLoginEmail(event.target.value)}
                      placeholder="email@exemplo.com ou 84xxxxxxx"
                      autoComplete="username"
                      className="w-full rounded-2xl border border-[#E8DAD4] bg-[#FFFBFA] px-4 py-3.5 outline-none transition focus:border-[#E8431A]"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-sm font-semibold text-[#2F2521]">Senha</label>
                      <Link href="/forgot-password" aria-disabled={isLoginLoading} onClick={(event) => { if (isLoginLoading) event.preventDefault(); }} className={`text-sm font-semibold text-[#E8431A] hover:text-[#C93812] ${isLoginLoading ? "pointer-events-none opacity-50" : ""}`}>
                        Esqueceu a senha?
                      </Link>
                    </div>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(event) => setLoginPassword(event.target.value)}
                      placeholder="........"
                      autoComplete="current-password"
                      className="w-full rounded-2xl border border-[#E8DAD4] bg-[#FFFBFA] px-4 py-3.5 outline-none transition focus:border-[#E8431A]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoginLoading}
                    className="mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-[#E8431A] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-[#CC3315] disabled:cursor-not-allowed disabled:bg-[#F4A691]"
                  >
                    {isLoginLoading ? "A entrar..." : "Entrar na conta"}
                  </button>
                  </fieldset>
                </form>

                <div className="my-6 flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.22em] text-[#B6AAA2]">
                  <span className="h-px flex-1 bg-[#ECD7CF]" />
                  <span>ou continue com</span>
                  <span className="h-px flex-1 bg-[#ECD7CF]" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isBusy}
                  className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-[#E8DAD4] bg-white px-5 py-3.5 text-sm font-bold text-[#2E241F] transition hover:border-[#E8431A] hover:text-[#E8431A]"
                >
                  <GoogleIcon />
                  Continuar com Google
                </button>
              </div>
            ) : (
              <div>
                <div className="mb-6 space-y-2">
                  <h2 className="text-3xl font-black text-[#1A1410]">Criar conta gratis</h2>
                  <p className="text-sm leading-7 text-[#6D625C]">Abre a tua conta e faz pedidos internacionais com notificacoes claras, pagamentos locais e rastreamento continuo.</p>
                </div>

                {registerSuccess ? (
                  <div className="mb-5 rounded-2xl border border-[#CFE4BD] bg-[#EAF3DE] px-4 py-3 text-sm font-medium text-[#335F2B]">
                    {registerSuccess}
                  </div>
                ) : null}

                {registerError ? (
                  <div className="mb-5 rounded-2xl border border-[#F5D0D0] bg-[#FCEBEB] px-4 py-3 text-sm font-medium text-[#A53B32]">
                    {registerError || registerAction.error}
                  </div>
                ) : registerAction.error ? (
                  <div className="mb-5">
                    <ClientActionError message={registerAction.error} />
                  </div>
                ) : null}

                <form className="space-y-4" onSubmit={(event) => void handleRegisterSubmit(event)} aria-busy={isRegisterLoading}>
                  <fieldset disabled={isRegisterLoading} className="space-y-4 disabled:opacity-70">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-[#2F2521]">Nome</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(event) => setFirstName(event.target.value)}
                        placeholder="Edson"
                        autoComplete="given-name"
                        className="w-full rounded-2xl border border-[#E8DAD4] bg-[#FFFBFA] px-4 py-3.5 outline-none transition focus:border-[#E8431A]"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-[#2F2521]">Apelido</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(event) => setLastName(event.target.value)}
                        placeholder="Mondlane"
                        autoComplete="family-name"
                        className="w-full rounded-2xl border border-[#E8DAD4] bg-[#FFFBFA] px-4 py-3.5 outline-none transition focus:border-[#E8431A]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#2F2521]">Email ou telefone</label>
                    <input
                      type="text"
                      value={registerEmail}
                      onChange={(event) => setRegisterEmail(event.target.value)}
                      placeholder="teuemail@exemplo.com ou 84xxxxxxx"
                      autoComplete="username"
                      className="w-full rounded-2xl border border-[#E8DAD4] bg-[#FFFBFA] px-4 py-3.5 outline-none transition focus:border-[#E8431A]"
                    />
                    <p className="text-xs text-[#8D817A]">Se usares email, enviamos um codigo de verificacao. Se usares telefone, a verificacao por WhatsApp fica para acoes sensiveis.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#2F2521]">Telefone adicional</label>
                    <div className="overflow-hidden rounded-2xl border border-[#E8DAD4] bg-[#FFFBFA] transition focus-within:border-[#E8431A]">
                      <div className="flex items-center">
                        <span className="border-r border-[#E8DAD4] bg-[#FFF1EA] px-4 py-3.5 text-sm font-semibold text-[#5E4C45]">🇲🇿 +258</span>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(event) => setPhone(event.target.value.replace(/[^\d]/g, "").slice(0, 9))}
                          placeholder="84 123 4567"
                          autoComplete="tel-national"
                          className="w-full bg-transparent px-4 py-3.5 outline-none"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-[#8D817A]">Opcional se o campo acima ja for telefone. Usado para notificacoes e pagamentos.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#2F2521]">Senha</label>
                    <input
                      type="password"
                      value={registerPassword}
                      onChange={(event) => setRegisterPassword(event.target.value)}
                      placeholder="Cria uma senha segura"
                      autoComplete="new-password"
                      className="w-full rounded-2xl border border-[#E8DAD4] bg-[#FFFBFA] px-4 py-3.5 outline-none transition focus:border-[#E8431A]"
                    />
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-4 gap-2">
                        {Array.from({ length: 4 }).map((_, index) => (
                          <span
                            key={index}
                            className="h-2 rounded-full transition"
                            style={{ backgroundColor: passwordStrength > index ? strengthMeta.color : "#EADCD6" }}
                          />
                        ))}
                      </div>
                      <p className="text-xs font-semibold" style={{ color: strengthMeta.color }}>
                        Forca da senha: {registerPassword ? strengthMeta.label : "A definir"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#2F2521]">Confirmar senha</label>
                    <div className="relative">
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Repete a senha"
                        autoComplete="new-password"
                        className="w-full rounded-2xl border bg-[#FFFBFA] px-4 py-3.5 pr-12 outline-none transition"
                        style={{
                          borderColor: passwordsMatch ? "#78B84B" : passwordsMismatch ? "#D94A38" : "#E8DAD4",
                        }}
                      />
                      {confirmPassword.length > 0 && (
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-base">
                          {passwordsMatch ? "✓" : "✗"}
                        </span>
                      )}
                    </div>
                    {passwordsMismatch && (
                      <p className="text-xs font-semibold text-[#D94A38]">As senhas nao coincidem.</p>
                    )}
                    {passwordsMatch && (
                      <p className="text-xs font-semibold text-[#78B84B]">Senhas coincidem.</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isRegisterLoading}
                    className="mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-[#E8431A] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-[#CC3315] disabled:cursor-not-allowed disabled:bg-[#F4A691]"
                  >
                    {isRegisterLoading ? "A criar conta..." : "Criar conta"}
                  </button>
                  </fieldset>
                </form>

                <p className="mt-5 text-xs leading-6 text-[#8D817A]">
                  Ao criar a conta, concordas com os nossos{" "}
                  <Link href="/terms" className="font-semibold text-[#E8431A] hover:text-[#C93812]">Termos</Link>{" "}
                  e a nossa{" "}
                  <Link href="/privacy" className="font-semibold text-[#E8431A] hover:text-[#C93812]">Politica de Privacidade</Link>.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#FFF8F5]" />}>
      <LoginPageContent />
    </Suspense>
  );
}
