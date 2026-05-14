"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Logo } from "@/components/logo";
import { apiFetch } from "@/lib/api-client";

const RED = "#E8431A";
const TEXT = "#1A1410";
const MUTED = "#6B7280";

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export default function CompleteAccountPasswordPage() {
  const router = useRouter();
  const { token, isReady } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [danger, setDanger] = useState("");

  useEffect(() => {
    if (isReady && !token) {
      router.replace("/login");
    }
  }, [isReady, token, router]);

  const passwordsMatch = newPassword.length >= 8 && confirmPassword === newPassword;
  const canSubmit = passwordsMatch && !saving;

  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setDanger("");

    setSaving(true);
    try {
      await apiFetch<{ success: boolean; mustChangePassword: boolean; profileIncomplete: boolean }>("auth/force-change-password", {
        method: "POST",
        token,
        body: JSON.stringify({ newPassword, confirmPassword }),
      });
      router.push("/complete-account/profile");
    } catch (error) {
      console.error("[force-change-password] error:", error);
      setDanger(error instanceof Error ? error.message : "Não foi possível atualizar a senha.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size="md" />
        </div>

        <div className="mb-6">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: MUTED }}>Passo 1 de 2 — Segurança</span>
            <span className="text-xs font-black" style={{ color: RED }}>50%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "#F2D4CC" }}>
            <div className="h-full rounded-full transition-all" style={{ width: "50%", background: RED }} />
          </div>
        </div>

        <div className="rounded-[32px] border bg-white p-8 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: RED }}>Segurança da conta</p>
          <h1 className="mt-2 text-2xl font-black" style={{ color: TEXT, fontFamily: "'Sora', sans-serif" }}>
            Cria a tua senha
          </h1>
          <p className="mt-2 text-sm leading-6" style={{ color: MUTED }}>
            Já confirmámos o teu acesso com a senha temporária. Agora cria uma senha nova para proteger a tua conta.
          </p>

          {danger ? (
            <div className="mt-5 rounded-2xl border px-4 py-3 text-sm font-medium" style={{ background: "#FCEBEB", color: "#B42318", borderColor: "#FECACA" }}>
              {danger}
            </div>
          ) : null}

          <form className="mt-6 grid gap-4" onSubmit={(e) => void handleSubmit(e)}>
            <label className="grid gap-2">
              <span className="text-sm font-bold" style={{ color: TEXT }}>Nova senha</span>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={saving}
                  autoComplete="new-password"
                  className="w-full rounded-2xl border px-4 py-3 pr-11 text-sm outline-none transition"
                  style={{ borderColor: "#F2D4CC", background: "#FFFBFA", color: TEXT }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                  aria-label={showNew ? "Ocultar senha" : "Mostrar senha"}
                >
                  <EyeIcon open={showNew} />
                </button>
              </div>
              <span className="text-xs" style={{ color: MUTED }}>Mínimo 8 caracteres</span>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold" style={{ color: TEXT }}>Confirmar nova senha</span>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={saving}
                  autoComplete="new-password"
                  className="w-full rounded-2xl border px-4 py-3 pr-11 text-sm outline-none transition"
                  style={{
                    borderColor: mismatch ? "#FECACA" : "#F2D4CC",
                    background: "#FFFBFA",
                    color: TEXT,
                  }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                  aria-label={showConfirm ? "Ocultar senha" : "Mostrar senha"}
                >
                  <EyeIcon open={showConfirm} />
                </button>
              </div>
              {mismatch ? (
                <span className="text-xs font-medium" style={{ color: "#B42318" }}>As senhas não coincidem.</span>
              ) : null}
            </label>

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-2 w-full rounded-2xl py-3 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: RED }}
            >
              {saving ? "A guardar..." : "Continuar →"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs" style={{ color: MUTED }}>
          A tua senha é cifrada e nunca é partilhada.
        </p>
      </div>
    </div>
  );
}
