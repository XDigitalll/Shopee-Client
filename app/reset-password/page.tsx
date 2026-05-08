"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";

const RED = "#E8431A";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError("A senha deve ter pelo menos 8 caracteres."); return; }
    if (password !== confirm) { setError("As senhas nao coincidem."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as Record<string, unknown> | null;
        throw new Error(typeof body?.message === "string" ? body.message : "Link expirado ou invalido.");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao redefinir.");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="text-center">
        <p className="mt-8 text-sm text-[#6D625C]">Link invalido. Solicite um novo link de recuperacao.</p>
        <Link href="/forgot-password" className="mt-4 inline-flex rounded-2xl px-6 py-3 text-sm font-bold text-white" style={{ background: RED }}>
          Recuperar senha
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mt-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "#ECFDF5" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="text-2xl font-black">Senha redefinida!</h2>
        <p className="mt-3 text-sm leading-7 text-[#6D625C]">A sua senha foi atualizada com sucesso. Pode entrar com a nova senha.</p>
        <Link href="/login" className="mt-6 inline-flex rounded-2xl px-6 py-3 text-sm font-bold text-white" style={{ background: RED }}>
          Entrar agora
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="mt-8 text-3xl font-black">Nova senha</h1>
      <p className="mt-2 text-sm leading-7 text-[#6D625C]">Escolha uma nova senha segura para a sua conta.</p>

      {error && (
        <div className="mt-4 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B42318]">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-bold text-[#1A1410]">Nova senha</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimo 8 caracteres"
            className="w-full rounded-2xl border border-[#F2D4CC] bg-[#FFFBFA] px-4 py-3 text-sm outline-none focus:border-[#E8431A]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-bold text-[#1A1410]">Confirmar senha</label>
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repita a nova senha"
            className="w-full rounded-2xl border border-[#F2D4CC] bg-[#FFFBFA] px-4 py-3 text-sm outline-none focus:border-[#E8431A]"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl py-3 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-60"
          style={{ background: RED }}
        >
          {loading ? "A redefinir..." : "Redefinir senha"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-[#FFF8F5] px-5 py-10 text-[#1A1410] sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center">
        <section className="w-full rounded-[32px] border border-[#F1D4CB] bg-white p-8 shadow-[0_30px_80px_rgba(232,67,26,0.08)] sm:p-10">
          <Logo />
          <Suspense fallback={<div className="mt-8 text-sm text-[#6D625C]">A carregar...</div>}>
            <ResetPasswordForm />
          </Suspense>
        </section>
      </div>
    </main>
  );
}
