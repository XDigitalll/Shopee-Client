"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Logo } from "@/components/logo";
import { apiFetch } from "@/lib/api-client";
import type { CustomerProfile } from "@/lib/types";

const RED = "#E8431A";
const TEXT = "#1A1410";
const MUTED = "#6B7280";

export default function CompleteAccountProfilePage() {
  const router = useRouter();
  const { token, isReady, refreshProfile } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [danger, setDanger] = useState("");
  const [isXdigitalEmail, setIsXdigitalEmail] = useState(false);

  useEffect(() => {
    if (isReady && !token) {
      router.replace("/login");
      return;
    }
    if (!token) return;

    apiFetch<CustomerProfile>("users/me", { token })
      .then((profile) => {
        const syntheticEmail = profile.email?.endsWith("@xdigital.local") ?? false;
        setIsXdigitalEmail(syntheticEmail);
        setFirstName(profile.firstName || "");
        setLastName(profile.lastName || "");
        setEmail(syntheticEmail ? "" : profile.email || "");
      })
      .catch(() => null);
  }, [isReady, token, router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setDanger("");

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedFirst) {
      setDanger("Introduz o teu nome.");
      return;
    }
    if (isXdigitalEmail && !trimmedEmail) {
      setDanger("Introduz um email real para a tua conta.");
      return;
    }
    if (isXdigitalEmail && trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setDanger("Introduz um endereço de email válido.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch<CustomerProfile>("users/me", {
        method: "PUT",
        token,
        body: JSON.stringify({
          firstName: trimmedFirst,
          lastName: trimmedLast,
          name: [trimmedFirst, trimmedLast].filter(Boolean).join(" "),
          ...(isXdigitalEmail && trimmedEmail ? { email: trimmedEmail } : {}),
        }),
      });
      await refreshProfile();
      router.push("/");
    } catch (error) {
      setDanger(error instanceof Error ? error.message : "Não foi possível guardar o perfil.");
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
            <span className="text-xs font-semibold" style={{ color: MUTED }}>Passo 2 de 2 — Perfil</span>
            <span className="text-xs font-black" style={{ color: RED }}>100%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "#F2D4CC" }}>
            <div className="h-full rounded-full transition-all" style={{ width: "100%", background: RED }} />
          </div>
        </div>

        <div className="rounded-[32px] border bg-white p-8 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: RED }}>Dados pessoais</p>
          <h1 className="mt-2 text-2xl font-black" style={{ color: TEXT, fontFamily: "'Sora', sans-serif" }}>
            Completa o teu perfil
          </h1>
          <p className="mt-2 text-sm leading-6" style={{ color: MUTED }}>
            Adiciona o teu nome e email para personalizarmos a tua experiência e enviarmos actualizações dos teus pedidos.
          </p>

          {danger ? (
            <div className="mt-5 rounded-2xl border px-4 py-3 text-sm font-medium" style={{ background: "#FCEBEB", color: "#B42318", borderColor: "#FECACA" }}>
              {danger}
            </div>
          ) : null}

          <form className="mt-6 grid gap-4" onSubmit={(e) => void handleSubmit(e)}>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-2">
                <span className="text-sm font-bold" style={{ color: TEXT }}>Nome</span>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={saving}
                  autoComplete="given-name"
                  placeholder="Ex: Maria"
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
                  style={{ borderColor: "#F2D4CC", background: "#FFFBFA", color: TEXT }}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-bold" style={{ color: TEXT }}>Apelido</span>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={saving}
                  autoComplete="family-name"
                  placeholder="Ex: Sitoe"
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
                  style={{ borderColor: "#F2D4CC", background: "#FFFBFA", color: TEXT }}
                />
              </label>
            </div>

            {isXdigitalEmail ? (
              <label className="grid gap-2">
                <span className="text-sm font-bold" style={{ color: TEXT }}>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={saving}
                  autoComplete="email"
                  placeholder="o-teu@email.com"
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
                  style={{ borderColor: "#F2D4CC", background: "#FFFBFA", color: TEXT }}
                />
                <span className="text-xs" style={{ color: MUTED }}>
                  A tua conta foi criada via telefone. Adiciona um email para receber confirmações de pedidos.
                </span>
              </label>
            ) : null}

            <button
              type="submit"
              disabled={saving}
              className="mt-2 w-full rounded-2xl py-3 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ background: RED }}
            >
              {saving ? "A guardar..." : "Concluir e entrar →"}
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => router.push("/")}
              className="w-full rounded-2xl border py-3 text-sm font-semibold transition hover:bg-gray-50 disabled:opacity-50"
              style={{ borderColor: "#F2D4CC", color: MUTED }}
            >
              Saltar por agora
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs" style={{ color: MUTED }}>
          Podes actualizar estes dados a qualquer momento no teu perfil.
        </p>
      </div>
    </div>
  );
}
