"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/logo";

const RED = "#E8431A";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null) as Record<string, unknown> | null;
        throw new Error(typeof body?.message === "string" ? body.message : "Erro ao enviar. Tente novamente.");
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#FFF8F5] px-5 py-10 text-[#1A1410] sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center">
        <section className="w-full rounded-[32px] border border-[#F1D4CB] bg-white p-8 shadow-[0_30px_80px_rgba(232,67,26,0.08)] sm:p-10">
          <Logo />

          {sent ? (
            <div className="mt-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "#ECFDF5" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h1 className="text-2xl font-black">Email enviado!</h1>
              <p className="mt-3 text-sm leading-7 text-[#6D625C]">
                Se existe uma conta com o email <strong>{email}</strong>, receberá um link para redefinir a senha. Verifique a sua caixa de entrada.
              </p>
              <Link href="/login" className="mt-6 inline-flex rounded-2xl px-6 py-3 text-sm font-bold text-white" style={{ background: RED }}>
                Voltar ao login
              </Link>
            </div>
          ) : (
            <>
              <h1 className="mt-8 text-3xl font-black">Recuperar senha</h1>
              <p className="mt-2 text-sm leading-7 text-[#6D625C]">
                Insira o seu email e enviaremos um link para redefinir a senha.
              </p>

              {error && (
                <div className="mt-4 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B42318]">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-[#1A1410]">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="o-seu-email@exemplo.com"
                    className="w-full rounded-2xl border border-[#F2D4CC] bg-[#FFFBFA] px-4 py-3 text-sm outline-none focus:border-[#E8431A]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl py-3 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-60"
                  style={{ background: RED }}
                >
                  {loading ? "A enviar..." : "Enviar link de recuperacao"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-[#6D625C]">
                Lembrou-se da senha?{" "}
                <Link href="/login" className="font-bold" style={{ color: RED }}>
                  Entrar
                </Link>
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
