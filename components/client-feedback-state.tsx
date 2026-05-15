"use client";

import Link from "next/link";

type ClientFeedbackTone = "success" | "error" | "info" | "loading";

function clientFeedbackPalette(tone: ClientFeedbackTone) {
  if (tone === "success") {
    return { background: "#F0FFF4", color: "#166534", borderColor: "#BBF7D0" };
  }

  if (tone === "error") {
    return { background: "#FFF5F5", color: "#B42318", borderColor: "#FECACA" };
  }

  if (tone === "loading") {
    return { background: "#FFF8F5", color: "#C2410C", borderColor: "#F7D2C8" };
  }

  return { background: "#FFF7ED", color: "#C2410C", borderColor: "#FED7AA" };
}

function ClientLoadingPulse({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`relative inline-flex ${compact ? "h-10 w-10" : "h-14 w-14"}`} aria-hidden="true">
      <span className="absolute inset-0 rounded-full bg-[#FAD9D0] opacity-75 animate-ping" />
      <span className="absolute inset-[7px] rounded-full border-[3px] border-[#F7C7BA] border-t-[#E8431A] animate-spin" />
      <span className="absolute inset-[15px] rounded-full bg-[#FFF0EC]" />
    </span>
  );
}

export function ClientFeedbackBanner({
  message,
  tone = "info",
}: {
  message: string;
  tone?: ClientFeedbackTone;
}) {
  const palette = clientFeedbackPalette(tone);

  return (
    <div
      className="rounded-[24px] border px-4 py-3 text-sm font-medium shadow-[0_14px_34px_rgba(232,67,26,0.08)]"
      style={palette}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      <div className="flex items-center gap-3">
        {tone === "loading" ? (
          <ClientLoadingPulse compact />
        ) : (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black"
            style={{
              background: tone === "success" ? "#DCFCE7" : tone === "error" ? "#FEE2E2" : "#FFEDD5",
              color: palette.color,
            }}
          >
            {tone === "success" ? "OK" : tone === "error" ? "!" : "i"}
          </span>
        )}
        <div>
          <p className="font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
            {tone === "loading" ? "A processar o teu pedido" : tone === "success" ? "Tudo certo" : tone === "error" ? "Precisamos da tua atencao" : "Atualizacao da pagina"}
          </p>
          <p className="mt-1">{message}</p>
        </div>
      </div>
    </div>
  );
}

export function ClientActionFeedback({
  feedback,
  onClose,
  actionLabel,
  actionHref,
  onAction,
}: {
  feedback: { type: ClientFeedbackTone; msg: string } | null;
  onClose?: () => void;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  if (!feedback) {
    return null;
  }

  const isLoading = feedback.type === "loading";
  const palette = clientFeedbackPalette(feedback.type);
  const title = isLoading
    ? "Estamos a processar"
    : feedback.type === "success"
      ? "Tudo certo"
      : feedback.type === "error"
        ? "Precisamos da tua atenção"
        : "Atenção";

  const actionClassName = "mt-3 inline-flex rounded-2xl px-4 py-2 text-sm font-black text-white";

  return (
    <div
      className="mt-3 rounded-2xl border px-4 py-3 text-sm shadow-sm"
      style={palette}
      role={feedback.type === "error" ? "alert" : "status"}
      aria-live={feedback.type === "error" ? "assertive" : "polite"}
      aria-busy={isLoading}
    >
      <div className="flex items-start gap-3">
        {isLoading ? (
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFF0EC]">
            <ClientLoadingPulse compact />
          </div>
        ) : (
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black"
            style={{
              background: feedback.type === "success" ? "#DCFCE7" : feedback.type === "error" ? "#FEE2E2" : "#FEF3C7",
              color: palette.color,
            }}
          >
            {feedback.type === "success" ? "OK" : feedback.type === "error" ? "!" : "i"}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
            {title}
          </p>
          <p className="mt-1 leading-5">{feedback.msg}</p>
          {actionLabel && actionHref ? (
            <Link href={actionHref} className={actionClassName} style={{ background: "#E8431A", fontFamily: "'Sora', sans-serif" }}>
              {actionLabel}
            </Link>
          ) : actionLabel && onAction ? (
            <button type="button" onClick={onAction} className={actionClassName} style={{ background: "#E8431A", fontFamily: "'Sora', sans-serif" }}>
              {actionLabel}
            </button>
          ) : null}
        </div>
        {onClose && !isLoading ? (
          <button type="button" onClick={onClose} className="shrink-0 rounded-full px-2 py-1 text-xs font-bold" style={{ color: palette.color, background: "rgba(255,255,255,0.62)" }}>
            Fechar
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ClientStateCard({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="rounded-[28px] border bg-white px-6 py-10 text-center shadow-sm" style={{ borderColor: "#F2D4CC" }}>
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-black"
          style={{ background: "#FFF0EC", color: "#E8431A" }}
        >
          ...
        </span>
        <div>
          <h2 className="text-xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
            {title}
          </h2>
          <p className="mt-2 text-sm" style={{ color: "#6B7280" }}>
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ClientSectionSkeleton({
  title = "A preparar esta area",
  message = "Estamos a carregar o conteudo para ti.",
  rows = 3,
}: {
  title?: string;
  message?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-4">
      <ClientStateCard title={title} message={message} />
      <div className="rounded-[28px] border bg-white p-5 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="rounded-[22px] border p-4" style={{ borderColor: "#F5E7E2", background: "#FFFDFC" }}>
              <div className="h-4 w-1/3 rounded-full bg-[#F4E6E0]" />
              <div className="mt-3 h-3 w-full rounded-full bg-[#F8EDEA]" />
              <div className="mt-2 h-3 w-4/5 rounded-full bg-[#F8EDEA]" />
              <div className="mt-4 flex gap-3">
                <div className="h-9 w-24 rounded-full bg-[#F4E6E0]" />
                <div className="h-9 w-32 rounded-full bg-[#F7ECE8]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ClientProductGridSkeleton({ items = 8 }: { items?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-[22px] border bg-white shadow-sm" style={{ borderColor: "#F2D4CC" }}>
          <div className="h-[190px] animate-pulse" style={{ background: "#FFF1EC" }} />
          <div className="space-y-3 p-3 animate-pulse">
            <div className="h-4 w-4/5 rounded-full bg-[#F4E6E0]" />
            <div className="h-4 w-2/3 rounded-full bg-[#F7ECE8]" />
            <div className="h-5 w-24 rounded-full bg-[#FAD9D0]" />
            <div className="h-10 w-full rounded-2xl bg-[#FFF4EF]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ClientListLoadingOverlay({
  visible,
  title = "A carregar lista",
  message = "Estamos a buscar os dados mais recentes.",
}: {
  visible: boolean;
  title?: string;
  message?: string;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center rounded-[28px] bg-[rgba(255,248,245,0.78)] px-4 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex w-full max-w-sm flex-col items-center rounded-[28px] border bg-white px-6 py-7 text-center shadow-[0_24px_70px_rgba(232,67,26,0.18)]" style={{ borderColor: "#F2D4CC" }}>
        <ClientLoadingPulse />
        <p className="mt-4 text-lg font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
          {title}
        </p>
        <p className="mt-2 text-sm leading-6" style={{ color: "#6B7280" }}>{message}</p>
      </div>
    </div>
  );
}

export function ClientFeedbackDock({
  feedback,
  onClose,
  placement = "top",
}: {
  feedback: { type: ClientFeedbackTone; msg: string } | null;
  onClose: () => void;
  placement?: "top" | "center";
}) {
  if (!feedback) {
    return null;
  }

  const isLoading = feedback.type === "loading";
  const palette = clientFeedbackPalette(feedback.type);

  if (placement === "center") {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(15,23,42,0.44)] px-4 py-6">
        <div
          className="w-full max-w-lg rounded-[32px] border bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
          style={{ borderColor: isLoading ? "#F7D2C8" : palette.borderColor }}
          role={feedback.type === "error" ? "alertdialog" : "status"}
          aria-live={feedback.type === "error" ? "assertive" : "polite"}
          aria-busy={isLoading}
        >
          <div className="flex items-start gap-4">
            <div className="mt-0.5 shrink-0">
              {isLoading ? (
                <div className="flex h-16 w-16 items-center justify-center rounded-[22px]" style={{ background: "#FFF0EC" }}>
                  <ClientLoadingPulse />
                </div>
              ) : (
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-black"
                  style={{
                    background:
                      feedback.type === "success" ? "#F0FFF4" : feedback.type === "error" ? "#FFF5F5" : "#FFF7ED",
                    color: feedback.type === "success" ? "#166534" : feedback.type === "error" ? "#B42318" : "#C2410C",
                  }}
                >
                  {feedback.type === "success" ? "OK" : feedback.type === "error" ? "!" : "i"}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
                {isLoading
                  ? "Estamos a tratar de tudo"
                  : feedback.type === "success"
                  ? "Tudo certo"
                  : feedback.type === "error"
                    ? "Precisamos da tua atencao"
                    : "Atualizacao da pagina"}
              </p>
              <p className="mt-2 text-sm leading-6" style={{ color: "#6B7280" }}>
                {feedback.msg}
              </p>
              {isLoading ? (
                <div className="mt-5 flex items-center gap-2 text-sm font-medium" style={{ color: "#C2410C" }}>
                  <span className="inline-flex h-2 w-2 rounded-full bg-[#E8431A] animate-pulse" />
                  Nao precisas fazer mais nada agora.
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-5 rounded-2xl px-4 py-2 text-sm font-black text-white"
                  style={{ background: "#E8431A", fontFamily: "'Sora', sans-serif" }}
                >
                  Fechar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        className="pointer-events-auto w-full max-w-2xl rounded-[24px] border bg-white/96 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.16)] backdrop-blur"
        style={{ borderColor: isLoading ? "#F7D2C8" : palette.borderColor }}
        role={feedback.type === "error" ? "alert" : "status"}
        aria-live={feedback.type === "error" ? "assertive" : "polite"}
        aria-busy={isLoading}
      >
        <div className="flex items-start gap-3">
          {isLoading ? (
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFF0EC]">
              <ClientLoadingPulse compact />
            </div>
          ) : (
            <div
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black"
              style={{
                background:
                  feedback.type === "success" ? "#F0FFF4" : feedback.type === "error" ? "#FFF5F5" : "#FFF7ED",
                color: feedback.type === "success" ? "#166534" : feedback.type === "error" ? "#B42318" : "#C2410C",
              }}
            >
              {feedback.type === "success" ? "OK" : feedback.type === "error" ? "!" : "i"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
              {isLoading
                ? "Estamos a processar"
                : feedback.type === "success"
                ? "Tudo certo"
                : feedback.type === "error"
                  ? "Precisamos da tua atencao"
                  : "Atualizacao da pagina"}
            </p>
            <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>
              {feedback.msg}
            </p>
          </div>
          {isLoading ? null : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-3 py-1 text-sm font-bold"
              style={{ color: "#6B7280", background: "#F8FAFC" }}
            >
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ClientConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(15,23,42,0.52)] px-4 py-6" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-[30px] border bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
        style={{ borderColor: "#F2D4CC" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: danger ? "#FFF1F1" : "#FFF8F5", color: "#E8431A" }}>
          {danger ? "!" : "?"}
        </div>
        <h2 className="mt-4 text-xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6" style={{ color: "#6B7280" }}>
          {message}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-2xl px-5 py-3 text-sm font-black text-white transition disabled:opacity-60"
            style={{ background: danger ? "#B42318" : "#E8431A", fontFamily: "'Sora', sans-serif" }}
          >
            {pending ? "A processar..." : confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-2xl border px-5 py-3 text-sm font-bold transition disabled:opacity-60"
            style={{ borderColor: "#F2D4CC", color: "#6B7280", background: "#FFFFFF" }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
