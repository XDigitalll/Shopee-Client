"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/components/auth-provider";
import type { CustomerProfile } from "@/lib/types";

const RED = "#E8431A";
const RED_DARK = "#C13210";
const RED_SOFT = "#FFF0EC";
const DANGER_SOFT = "#FCEBEB";
const TEXT = "#1A1410";
const MUTED = "#6B7280";

function ChangePasswordPageContent() {
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const forced = searchParams.get("forced") === "1";
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [danger, setDanger] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        const me = await apiFetch<CustomerProfile>("users/me", { token });
        setProfile(me);
      } catch (error) {
        setDanger(error instanceof Error ? error.message : "Nao foi possivel carregar os dados de seguranca.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [token]);

  const requiresCurrentPassword = !profile?.canSetLocalPassword;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;

    setFeedback("");
    setDanger("");

    if (requiresCurrentPassword && !currentPassword) {
      setDanger("Informe a senha atual para continuar.");
      return;
    }

    if (newPassword.length < 8) {
      setDanger("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setDanger("A confirmacao da senha nao coincide.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch<void>("users/me/password", {
        method: "PUT",
        token,
        body: JSON.stringify({
          currentPassword: requiresCurrentPassword ? currentPassword : undefined,
          newPassword,
          confirmPassword,
        }),
      });
      setFeedback(profile?.canSetLocalPassword
        ? "Senha definida com sucesso. Agora ja podes entrar com Google ou com email e senha."
        : "Senha alterada com sucesso.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      const refreshed = await apiFetch<CustomerProfile>("users/me", { token });
      setProfile(refreshed);
    } catch (error) {
      setDanger(error instanceof Error ? error.message : "Nao foi possivel atualizar a senha.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[28px] border bg-white p-6 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
      <p className="text-sm font-semibold" style={{ color: RED }}>Seguranca</p>
      <h1 className="mt-1 text-3xl font-black" style={{ color: TEXT, fontFamily: "'Sora', sans-serif" }}>
        {profile?.canSetLocalPassword ? "Definir senha" : "Alterar senha"}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-7" style={{ color: MUTED }}>
        {profile?.canSetLocalPassword
          ? "A tua conta foi criada com Google. Define uma senha para tambem poderes entrar normalmente com email e senha."
          : "Atualiza a tua senha com as praticas atuais de seguranca. Usa uma combinacao forte e exclusiva."}
      </p>

      {forced ? (
        <div className="mt-5 rounded-2xl border-2 px-4 py-3 text-sm font-semibold leading-6" style={{ borderColor: RED, background: RED_SOFT, color: "#6D3325" }}>
          Por seguranca, precisas de criar uma nova senha antes de continuares. A senha temporaria que recebeste expira apos esta troca.
        </div>
      ) : null}

      {feedback ? (
        <div className="mt-5 rounded-2xl border px-4 py-3 text-sm font-medium" style={{ background: "#ECFDF5", color: "#166534", borderColor: "#BBF7D0" }}>
          {feedback}
        </div>
      ) : null}

      {danger ? (
        <div className="mt-5 rounded-2xl border px-4 py-3 text-sm font-medium" style={{ background: DANGER_SOFT, color: "#B42318", borderColor: "#FECACA" }}>
          {danger}
        </div>
      ) : null}

      <form className="mt-6 grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
        {requiresCurrentPassword ? (
          <label className="grid gap-2">
            <span className="text-sm font-bold" style={{ color: TEXT }}>Senha atual</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={loading || saving}
              className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
              style={{ borderColor: "#F2D4CC", background: "#FFFBFA", color: TEXT }}
            />
          </label>
        ) : null}

        <label className="grid gap-2">
          <span className="text-sm font-bold" style={{ color: TEXT }}>Nova senha</span>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            disabled={loading || saving}
            className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
            style={{ borderColor: "#F2D4CC", background: "#FFFBFA", color: TEXT }}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-bold" style={{ color: TEXT }}>Confirmar nova senha</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={loading || saving}
            className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
            style={{ borderColor: "#F2D4CC", background: "#FFFBFA", color: TEXT }}
          />
        </label>

        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={loading || saving}
            className="rounded-2xl px-4 py-2.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-60"
            style={{ background: RED }}
          >
            {saving ? "A guardar..." : profile?.canSetLocalPassword ? "Definir senha" : "Guardar nova senha"}
          </button>
          {!forced ? (
            <Link href="/profile" className="rounded-2xl border px-4 py-2.5 text-sm font-bold" style={{ borderColor: "#F2D4CC", color: RED_DARK, background: RED_SOFT }}>
              Voltar ao perfil
            </Link>
          ) : null}
        </div>
      </form>
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<div className="rounded-[28px] border bg-white p-6 shadow-sm" style={{ borderColor: "#F2D4CC" }} />}>
      <ChangePasswordPageContent />
    </Suspense>
  );
}
