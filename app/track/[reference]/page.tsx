"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const RED = "#E8431A";
const TEXT = "#1A1410";
const MUTED = "#6B7280";
const BORDER = "#F2D4CC";
const SOFT = "#FFF0EC";
const GREEN = "#166534";
const GREEN_BG = "#ECFDF5";

const PHONE_PATTERN = /^\+258(82|83|84|85|86|87)\d{7}$/;

type TrackingStep = {
  key: string;
  label: string;
  completed: boolean;
  current: boolean;
  completedAt: string | null;
};

type TrackingResult = {
  reference: string;
  status: string;
  statusLabel: string;
  deliveryMethod: string | null;
  orderDate: string | null;
  lastUpdated: string | null;
  deliveryCity: string | null;
  deliveryNeighborhood: string | null;
  maskedPhone: string | null;
  adminMessage: string | null;
  timeline: TrackingStep[];
};

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("00258")) return `+${digits.slice(2)}`;
  if (digits.startsWith("258") && digits.length === 12) return `+${digits}`;
  if (digits.length === 9) return `+258${digits}`;
  return value.trim();
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-MZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const isGood = ["DELIVERED", "PAID", "OUT_FOR_DELIVERY"].includes(status);
  const isAction = ["PENDING_PAYMENT", "QUOTED", "PAYMENT_REJECTED"].includes(status);
  const isBad = ["CANCELLED", "FAILED", "DELIVERY_FAILED"].includes(status);

  const bg = isBad ? "#FEF2F2" : isAction ? SOFT : isGood ? GREEN_BG : "#F3F4F6";
  const color = isBad ? "#B91C1C" : isAction ? RED : isGood ? GREEN : TEXT;

  return (
    <span
      className="inline-block rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider"
      style={{ background: bg, color }}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function Timeline({ steps }: { steps: TrackingStep[] }) {
  return (
    <ol className="relative mt-4 space-y-0">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const dotColor = step.current ? RED : step.completed ? GREEN : "#D1D5DB";
        const lineColor = step.completed ? GREEN : "#E5E7EB";

        return (
          <li key={step.key} className="flex gap-4">
            {/* dot + connector */}
            <div className="flex flex-col items-center">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-black"
                style={{
                  borderColor: dotColor,
                  background: step.current ? RED : step.completed ? GREEN_BG : "white",
                  color: step.current ? "white" : step.completed ? GREEN : "#D1D5DB",
                }}
              >
                {step.completed ? "✓" : step.current ? "●" : "○"}
              </div>
              {!isLast && (
                <div className="w-0.5 grow" style={{ background: lineColor, minHeight: "24px" }} />
              )}
            </div>

            {/* content */}
            <div className="pb-6 pt-0.5">
              <p
                className="text-sm font-black"
                style={{ color: step.current ? RED : step.completed ? TEXT : MUTED }}
              >
                {step.label}
              </p>
              {step.completedAt && (
                <p className="mt-0.5 text-xs font-medium" style={{ color: MUTED }}>
                  {formatDate(step.completedAt)}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function TrackOrderPage({ params }: { params: Promise<{ reference: string }> }) {
  const [referenceInput, setReferenceInput] = useState<string>("");
  const [phoneInput, setPhoneInput] = useState("+258");
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Pre-fill reference from URL on mount
  const [initialized, setInitialized] = useState(false);
  if (!initialized) {
    setInitialized(true);
    params.then((p) => {
      const ref = p.reference?.trim().toUpperCase();
      if (ref && ref !== "TRACK") setReferenceInput(ref);
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);

    const ref = referenceInput.trim().toUpperCase();
    if (!ref) {
      setError("Introduz a referência do pedido.");
      return;
    }
    const phone = normalizePhone(phoneInput);
    if (!PHONE_PATTERN.test(phone)) {
      setError("Número de telefone inválido. Ex: +25884xxxxxxx");
      return;
    }

    setIsLoading(true);
    try {
      const url = `/api/xdigital/api/public/track/${encodeURIComponent(ref)}?phone=${encodeURIComponent(phone)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `Erro ${res.status}`);
      }
      const data: TrackingResult = await res.json();
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível rastrear o pedido.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8 sm:px-6 lg:py-12" style={{ color: TEXT }}>
      <div className="mb-6">
        <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: RED }}>
          Rastrear pedido
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-sora)] text-3xl font-black leading-tight">
          Onde está o teu pedido?
        </h1>
        <p className="mt-2 text-sm leading-6" style={{ color: MUTED }}>
          Introduz a referência e o telefone usado no pedido.
        </p>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="rounded-[28px] border bg-white p-5 shadow-sm sm:p-7"
        style={{ borderColor: BORDER }}
      >
        <div className="grid gap-4">
          <div>
            <label htmlFor="ref-input" className="text-sm font-black">
              Referência do pedido
            </label>
            <input
              id="ref-input"
              value={referenceInput}
              onChange={(e) => setReferenceInput(e.target.value.toUpperCase())}
              placeholder="Ex: SMZ-ORD-2026-000041"
              disabled={isLoading}
              className="mt-2 w-full rounded-2xl border px-4 py-3.5 font-mono text-sm font-bold outline-none"
              style={{ borderColor: BORDER, background: "#FFFDFC" }}
            />
          </div>

          <div>
            <label htmlFor="phone-input" className="text-sm font-black">
              Número de telefone
            </label>
            <input
              id="phone-input"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="+25884xxxxxxx"
              disabled={isLoading}
              className="mt-2 w-full rounded-2xl border px-4 py-3.5 text-sm font-bold outline-none"
              style={{ borderColor: BORDER, background: "#FFFDFC" }}
            />
            <p className="mt-1 text-xs font-medium" style={{ color: MUTED }}>
              O mesmo número que usaste ao fazer o pedido.
            </p>
            <p className="mt-2 text-xs font-semibold" style={{ color: "#15803D" }}>
              Em breve também poderás acompanhar os teus pedidos pelo WhatsApp. Por agora, acompanha o estado na área Meus pedidos.
            </p>
          </div>

          {error && (
            <p className="rounded-2xl border px-4 py-3 text-sm font-semibold" style={{ borderColor: "#FCA5A5", background: "#FFF5F5", color: "#B42318" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-2xl px-5 py-4 text-sm font-black text-white transition disabled:opacity-60"
            style={{ background: RED }}
          >
            {isLoading ? "A rastrear..." : "Rastrear pedido"}
          </button>
        </div>
      </form>

      {result && (
        <section className="mt-6 rounded-[28px] border bg-white p-5 shadow-sm sm:p-7" style={{ borderColor: BORDER }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: MUTED }}>
                Referência
              </p>
              <p className="mt-0.5 font-[family-name:var(--font-sora)] text-xl font-black" style={{ color: RED }}>
                {result.reference}
              </p>
            </div>
            <StatusBadge status={result.status} />
          </div>

          <p className="mt-1 text-sm font-bold" style={{ color: TEXT }}>
            {result.statusLabel}
          </p>

          {result.lastUpdated && (
            <p className="mt-1 text-xs font-medium" style={{ color: MUTED }}>
              Última atualização: {formatDate(result.lastUpdated)}
            </p>
          )}

          {result.adminMessage && (
            <div className="mt-4 rounded-2xl border px-4 py-3" style={{ borderColor: BORDER, background: SOFT }}>
              <p className="text-xs font-black uppercase tracking-wider" style={{ color: RED }}>
                Mensagem da equipa
              </p>
              <p className="mt-1 text-sm font-semibold leading-6" style={{ color: TEXT }}>
                {result.adminMessage}
              </p>
            </div>
          )}

          {result.deliveryCity && (
            <p className="mt-3 text-sm font-medium" style={{ color: MUTED }}>
              Entrega:{" "}
              <span className="font-bold" style={{ color: TEXT }}>
                {result.deliveryCity}
                {result.deliveryNeighborhood ? `, ${result.deliveryNeighborhood}` : ""}
              </span>
            </p>
          )}

          {result.timeline.length > 0 && (
            <div className="mt-5 border-t pt-5" style={{ borderColor: BORDER }}>
              <p className="mb-3 text-xs font-black uppercase tracking-[0.18em]" style={{ color: MUTED }}>
                Progresso
              </p>
              <Timeline steps={result.timeline} />
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3 border-t pt-4" style={{ borderColor: BORDER }}>
            <Link
              href="/login?redirect=%2Forders&reason=track-orders"
              className="rounded-2xl px-4 py-2.5 text-sm font-black text-white"
              style={{ background: RED }}
            >
              Ver todos os pedidos
            </Link>
            <button
              type="button"
              onClick={() => { setResult(null); setError(null); }}
              className="rounded-2xl border px-4 py-2.5 text-sm font-black"
              style={{ borderColor: BORDER, color: RED, background: "white" }}
            >
              Rastrear outro pedido
            </button>
          </div>
        </section>
      )}

      <p className="mt-6 text-center text-xs font-medium" style={{ color: MUTED }}>
        Tens uma conta?{" "}
        <Link href="/login?redirect=%2Forders" className="font-black underline" style={{ color: RED }}>
          Entra para ver todos os teus pedidos
        </Link>
      </p>
    </main>
  );
}
