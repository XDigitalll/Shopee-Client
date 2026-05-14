"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import { ClientFeedbackDock } from "@/components/client-feedback-state";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api-client";
import type { Order } from "@/lib/types";

const RED = "#E8431A";
const TEXT = "#1A1410";
const MUTED = "#6B7280";
const BORDER = "#F2D4CC";
const SOFT = "#FFF0EC";
const PHONE_PATTERN = /^\+258(82|83|84|85|86|87)\d{7}$/;
const KNOWN_DOMAINS = ["shein.com", "temu.com", "amazon", "aliexpress", "zara.com", "ebay", "shein.pt"];
const STORE_OPTIONS = [
  { id: "SHEIN", label: "Shein" },
  { id: "AMAZON", label: "Amazon" },
  { id: "TEMU", label: "Temu" },
  { id: "ALI_EXPRESS", label: "AliExpress" },
  { id: "ALI_BABA", label: "Alibaba" },
  { id: "MR_PRICE", label: "Mr Price" },
  { id: "MAKRO", label: "Makro" },
  { id: "BASH", label: "Bash" },
  { id: "BUFFALO", label: "Buffalo" },
  { id: "ZARA", label: "Zara" },
  { id: "ASOS", label: "ASOS" },
  { id: "EBAY", label: "eBay" },
];

function normalizeStore(value: string | null): string {
  if (!value) return "SHEIN";
  const normalized = value.trim().toUpperCase().replace(/[-\s]+/g, "_");
  return STORE_OPTIONS.some((store) => store.id === normalized) ? normalized : "SHEIN";
}

function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (KNOWN_DOMAINS.some((d) => trimmed.toLowerCase().includes(d))) return true;
  const spaceCount = (trimmed.match(/\s/g) ?? []).length;
  return spaceCount < 3 && trimmed.includes(".");
}
const TELEGRAM_BOT_URL = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL ?? "https://t.me/shopeexdigital_bot";

function buildTelegramUrl(orderReference?: string) {
  if (!orderReference) return TELEGRAM_BOT_URL;
  const encoded = encodeURIComponent(orderReference.replace(/[^A-Za-z0-9_-]/g, "_"));
  return `${TELEGRAM_BOT_URL}?start=${encoded}`;
}

type SubmissionResponse = Order & {
  success?: boolean;
  orderId?: number;
  orderNumber?: string;
  orderReference?: string;
  message?: string;
  firstOrder?: boolean;
  firstGuestOrder?: boolean;
  authenticatedOrder?: boolean;
  accountAlreadyExists?: boolean;
  temporaryPassword?: string;
  loginIdentifier?: string;
};

export default function NewExternalOrderPage() {
  const { token, userLabel, userEmail, userPhone, accountCompletionPercentage, profileIncomplete } = useAuth();
  const isLoggedIn = Boolean(token);

  const [productLink, setProductLink] = useState("");
  const [selectedStore, setSelectedStore] = useState("SHEIN");
  const [variant, setVariant] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [phoneNumber, setPhoneNumber] = useState(() => userPhone || "+258");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info" | "loading"; msg: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successOrder, setSuccessOrder] = useState<{
    id: number;
    number: string;
    message: string;
    firstOrder: boolean;
    firstGuestOrder: boolean;
    authenticatedOrder: boolean;
    accountAlreadyExists: boolean;
    temporaryPassword?: string;
    loginIdentifier?: string;
  } | null>(null);
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (userPhone) {
      setPhoneNumber(userPhone);
    }
  }, [userPhone]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialLink = params.get("link")?.trim();
    setSelectedStore(normalizeStore(params.get("store")));
    if (initialLink) {
      setProductLink(initialLink);
    }
  }, []);

  function normalizePhone(value: string) {
    let digits = value.replace(/\D/g, "");
    if (digits.startsWith("00258")) {
      digits = digits.slice(2);
    }
    if (digits.startsWith("258")) {
      digits = digits.slice(3);
    }
    if (digits.startsWith("0")) {
      digits = digits.slice(1);
    }
    return digits ? `+258${digits}` : "";
  }

  function validateForm() {
    if (!productLink.trim()) {
      return "Cola o link do produto ou carrinho.";
    }

    if (!Number.isFinite(quantity) || quantity < 1) {
      return "A quantidade deve ser no minimo 1.";
    }

    if (!phoneNumber.trim()) {
      return "Indica o teu numero de telefone.";
    }

    if (!PHONE_PATTERN.test(normalizePhone(phoneNumber))) {
      return "Usa um telefone valido de Mocambique. Ex: +25884xxxxxxx.";
    }

    return null;
  }

  function handleScreenshotChange(file: File | null) {
    if (!file) {
      setScreenshot(null);
      if (screenshotInputRef.current) {
        screenshotInputRef.current.value = "";
      }
      return;
    }

    if (!file.type.startsWith("image/")) {
      setScreenshot(null);
      if (screenshotInputRef.current) {
        screenshotInputRef.current.value = "";
      }
      setFeedback({ type: "error", msg: "Anexa uma foto ou screenshot em formato de imagem." });
      return;
    }

    setScreenshot(file);
  }

  async function saveOrderReference(reference: string) {
    try {
      await navigator.clipboard.writeText(reference);
      setFeedback({ type: "success", msg: "Referencia guardada." });
    } catch {
      setFeedback({ type: "info", msg: `Guarda esta referencia: ${reference}` });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const validationMessage = validateForm();
    if (validationMessage) {
      setFeedback({ type: "error", msg: validationMessage });
      return;
    }

    const cleanLink = productLink.trim();
    const cleanVariant = variant.trim();
    const cleanPhone = normalizePhone(phoneNumber);
    const body = new FormData();
    body.set("externalCartUrl", cleanLink);
    body.set("cartLink", cleanLink);
    body.set("productLink", cleanLink);
    body.set("link", cleanLink);
    body.set("sourceStore", selectedStore);
    body.set("requestInputType", looksLikeUrl(cleanLink) ? "LINK" : "DESCRIPTION");
    body.set("quantity", String(quantity));
    body.set("primaryPhoneNumber", cleanPhone);
    body.set("phoneNumber", cleanPhone);
    if (cleanVariant) {
      body.set("variant", cleanVariant);
      body.set("variantDetails", cleanVariant);
      body.set("productDetails", cleanVariant);
    }
    if (screenshot) {
      body.set("screenshot", screenshot);
    }

    setIsSubmitting(true);
    setFeedback({ type: "loading", msg: "A enviar pedido para analise." });

    try {
      const response = await apiFetch<SubmissionResponse>("orders/external", {
        method: "POST",
        body,
        ...(token ? { token } : {}),
      });

      const nextOrderId = Number(response.orderId ?? response.id ?? 0);
      const nextOrderNumber =
        response.orderReference?.trim() ||
        response.orderNumber?.trim() ||
        response.code ||
        (nextOrderId ? `#${nextOrderId}` : "#---");
      const nextMessage = response.message || "Recebemos o teu pedido. Vamos analisar e entrar em contacto pelo telefone informado.";

      setSuccessOrder({
        id: nextOrderId,
        number: nextOrderNumber,
        message: nextMessage,
        firstOrder: Boolean(response.firstOrder),
        firstGuestOrder: Boolean(response.firstGuestOrder ?? response.firstOrder),
        authenticatedOrder: Boolean(response.authenticatedOrder),
        accountAlreadyExists: Boolean(response.accountAlreadyExists),
        temporaryPassword: response.temporaryPassword,
        loginIdentifier: response.loginIdentifier,
      });
      const phoneToKeep = userPhone || cleanPhone || phoneNumber || "+258";
      setProductLink("");
      setVariant("");
      setQuantity(1);
      setPhoneNumber(phoneToKeep);
      setScreenshot(null);
      if (screenshotInputRef.current) {
        screenshotInputRef.current.value = "";
      }
      setFeedback({ type: "success", msg: nextMessage });
    } catch (error) {
      setFeedback({
        type: "error",
        msg: error instanceof Error ? error.message : "Nao foi possivel enviar o pedido.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <ClientFeedbackDock feedback={feedback} onClose={() => setFeedback(null)} placement="center" />

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-10" style={{ color: TEXT }}>
        <section className="mb-6">
          <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: RED }}>
            Compra internacional
          </p>
          <h1 className="mt-2 max-w-3xl font-[family-name:var(--font-sora)] text-3xl font-black leading-tight sm:text-5xl">
            {isLoggedIn ? "Pede cotacao do estrangeiro" : "Pede cotacao sem criar conta"}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7" style={{ color: MUTED }}>
            {isLoggedIn
              ? "Cola o link e confirma o telefone para contacto. A equipa valida preco, disponibilidade e prazo antes do pagamento."
              : "Cola o link, deixa o teu telefone e a equipa confirma o resto contigo antes de qualquer pagamento."}
          </p>
        </section>

        {successOrder ? (
          <section className="rounded-[28px] border bg-white p-6 shadow-sm sm:p-8" style={{ borderColor: successOrder.firstGuestOrder ? RED : BORDER }}>
            <p className="text-sm font-black uppercase tracking-[0.2em]" style={{ color: RED }}>
              {successOrder.authenticatedOrder ? "Pedido registado" : successOrder.firstGuestOrder ? "Bem-vindo ao ShopeeX Digital" : "Ja temos uma conta para ti"}
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-sora)] text-3xl font-black">
              {successOrder.authenticatedOrder
                ? "Pedido recebido e associado a tua conta."
                : successOrder.firstGuestOrder
                  ? "O teu pedido ja entrou para analise."
                  : "Ja encontramos uma conta associada a este telefone."}
            </h2>
            <p className="mt-4 max-w-3xl whitespace-pre-line text-base font-semibold leading-8" style={{ color: MUTED }}>
              {successOrder.authenticatedOrder
                ? "A equipa vai analisar o preco, disponibilidade e prazo. Podes acompanhar tudo na pagina de pedidos."
                : successOrder.firstGuestOrder
                  ? successOrder.message
                  : "Recebemos o teu pedido. Entra para acompanhares todos os teus pedidos, recupera o acesso se precisares, ou continua pelo Telegram."}
            </p>

            {successOrder.firstGuestOrder && successOrder.temporaryPassword ? (
              <div className="mt-5 rounded-2xl border-2 p-5 space-y-3" style={{ borderColor: RED, background: SOFT }}>
                <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: RED }}>
                  Acesso temporario criado
                </p>
                <div className="grid gap-2 text-sm font-bold" style={{ color: TEXT }}>
                  <div className="flex items-center gap-3">
                    <span style={{ color: MUTED }}>Telefone:</span>
                    <code className="rounded-lg px-2 py-1 font-mono text-sm" style={{ background: "#fff", color: TEXT }}>
                      {successOrder.loginIdentifier}
                    </code>
                  </div>
                  <div className="flex items-center gap-3">
                    <span style={{ color: MUTED }}>Senha temporaria:</span>
                    <code className="rounded-lg px-2 py-1 font-mono text-sm font-black" style={{ background: "#fff", color: RED }}>
                      {successOrder.temporaryPassword}
                    </code>
                  </div>
                </div>
                <p className="text-xs font-semibold leading-5" style={{ color: MUTED }}>
                  Guarda estes dados. Por seguranca, vais trocar a senha no primeiro acesso.
                </p>
              </div>
            ) : null}

            <div className="mt-5 inline-flex flex-col gap-1 rounded-2xl px-5 py-4" style={{ background: SOFT, color: RED }}>
              <span className="text-xs font-black uppercase tracking-[0.18em]">Referencia do pedido</span>
              <span className="font-[family-name:var(--font-sora)] text-2xl font-black">{successOrder.number}</span>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {successOrder.firstGuestOrder && successOrder.temporaryPassword ? (
                <Link
                  href="/login?tab=login"
                  className="rounded-2xl px-5 py-3 text-center text-sm font-black text-white sm:col-span-2"
                  style={{ background: RED }}
                >
                  Entrar e trocar senha
                </Link>
              ) : null}

              {successOrder.accountAlreadyExists && !successOrder.temporaryPassword ? (
                <>
                  <Link
                    href="/login?tab=login"
                    className="rounded-2xl px-5 py-3 text-center text-sm font-black text-white"
                    style={{ background: RED }}
                  >
                    Entrar
                  </Link>
                  <Link
                    href="/forgot-password"
                    className="rounded-2xl border px-5 py-3 text-center text-sm font-black"
                    style={{ borderColor: BORDER, color: RED, background: "white" }}
                  >
                    Recuperar acesso
                  </Link>
                </>
              ) : null}

              <a
                href={buildTelegramUrl(successOrder.number)}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border px-5 py-3 text-center text-sm font-black"
                style={{ borderColor: BORDER, color: RED, background: "white" }}
              >
                Continuar pelo Telegram
              </a>
              <button
                type="button"
                onClick={() => void saveOrderReference(successOrder.number)}
                className="rounded-2xl border px-5 py-3 text-sm font-black"
                style={{ borderColor: BORDER, color: RED, background: "white" }}
              >
                Guardar referencia
              </button>
              <Link
                href="/store"
                className="rounded-2xl px-5 py-3 text-center text-sm font-black text-white"
                style={{ background: RED }}
              >
                Continuar comprando
              </Link>
              <Link
                href={successOrder.authenticatedOrder ? "/orders" : "/login?redirect=%2Forders&reason=track-orders"}
                className="rounded-2xl px-5 py-3 text-center text-sm font-black text-white"
                style={{ background: TEXT }}
              >
                {successOrder.authenticatedOrder ? "Ver meus pedidos" : "Acompanhar meus pedidos"}
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setSuccessOrder(null)}
              className="mt-4 text-sm font-black"
              style={{ color: RED }}
            >
              Fazer outro pedido
            </button>
          </section>
        ) : (
          <>
            {isLoggedIn && (
              <div className="mb-4 rounded-[24px] border p-4 sm:p-5" style={{ borderColor: BORDER, background: SOFT }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: RED }}>Pedido ligado a tua conta</p>
                    <p className="mt-1 text-sm font-semibold" style={{ color: TEXT }}>
                      {userLabel || userEmail || "Cliente ShopeeX"}
                    </p>
                    {userEmail && (
                      <p className="text-xs" style={{ color: MUTED }}>{userEmail}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span
                      className="inline-block rounded-full px-3 py-1 text-xs font-black"
                      style={{
                        background: accountCompletionPercentage === 100 ? "#ECFDF5" : "#FFF0EC",
                        color: accountCompletionPercentage === 100 ? "#166534" : RED,
                      }}
                    >
                      {accountCompletionPercentage === 100 ? "Conta verificada" : `Perfil ${accountCompletionPercentage}% completo`}
                    </span>
                    {profileIncomplete && (
                      <p className="mt-1 text-xs" style={{ color: MUTED }}>
                        Completa o perfil para melhor acompanhamento.
                      </p>
                    )}
                  </div>
                </div>
                {!userPhone && (
                  <div className="mt-3 rounded-2xl border px-4 py-3 text-sm font-semibold" style={{ borderColor: "#FCA5A5", background: "#FFF5F5", color: "#B42318" }}>
                    Adiciona um telefone no teu perfil para recebermos atualizacoes sobre este pedido.
                  </div>
                )}
              </div>
            )}

            {isSubmitting ? (
              <div
                className="mb-4 rounded-[24px] border p-4 sm:p-5"
                style={{ borderColor: RED, background: SOFT }}
                role="status"
                aria-live="polite"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white"
                    style={{ borderTopColor: RED, borderRightColor: RED, borderBottomColor: "#FECACA", borderLeftColor: "#FECACA" }}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-black" style={{ color: TEXT }}>
                      A processar o teu pedido...
                    </p>
                    <p className="mt-1 text-sm leading-6" style={{ color: MUTED }}>
                      Estamos a enviar o link, telefone e screenshot para a equipa. Mantem esta pagina aberta ate aparecer a referencia do pedido.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <form onSubmit={(event) => void handleSubmit(event)} className="rounded-[28px] border bg-white p-4 shadow-sm sm:p-6" style={{ borderColor: BORDER }}>
              <div className="grid gap-5">
                <label className="block">
                  <span className="text-sm font-black">Loja</span>
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                    {STORE_OPTIONS.map((store) => {
                      const active = selectedStore === store.id;
                      return (
                        <button
                          key={store.id}
                          type="button"
                          onClick={() => setSelectedStore(store.id)}
                          disabled={isSubmitting}
                          className="shrink-0 rounded-full border px-4 py-2 text-sm font-black transition"
                          style={{
                            borderColor: active ? RED : BORDER,
                            background: active ? SOFT : "#FFFDFC",
                            color: active ? RED : TEXT,
                          }}
                        >
                          {store.label}
                        </button>
                      );
                    })}
                  </div>
                </label>

                <label className="block">
                  <span className="text-sm font-black">
                    {productLink.trim() && !looksLikeUrl(productLink)
                      ? "Link ou descrição do produto"
                      : "Link do produto ou carrinho"}
                  </span>
                  <input
                    value={productLink}
                    onChange={(event) => setProductLink(event.target.value)}
                    disabled={isSubmitting}
                    placeholder="Cole o link da loja ou descreva o produto que quer comprar"
                    className="mt-2 w-full rounded-2xl border px-4 py-4 text-base outline-none"
                    style={{
                      borderColor: productLink.trim() && !looksLikeUrl(productLink) ? "#FCD34D" : BORDER,
                      background: "#FFFDFC",
                    }}
                  />
                  {productLink.trim() && !looksLikeUrl(productLink) && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold leading-5" style={{ color: "#92400E" }}>
                      <svg className="mt-px shrink-0" width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      Parece que isto não é um link. Podes enviar assim mesmo, mas se tiveres o link da loja ajuda-nos a cotar mais rápido.
                    </p>
                  )}
                  {productLink.trim() && looksLikeUrl(productLink) && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#166534" }}>
                      <svg className="shrink-0" width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                      Link reconhecido.
                    </p>
                  )}
                </label>

                <div className="grid gap-5 sm:grid-cols-[1fr_180px]">
                  <label className="block">
                    <span className="text-sm font-black">
                      {isLoggedIn ? "Telefone para contacto deste pedido" : "Telefone"}
                    </span>
                    <input
                      value={phoneNumber}
                      onChange={(event) => setPhoneNumber(event.target.value)}
                      disabled={isSubmitting}
                      placeholder="+25884xxxxxxx"
                      className="mt-2 w-full rounded-2xl border px-4 py-4 text-base font-bold outline-none"
                      style={{ borderColor: BORDER, background: "#FFFDFC" }}
                    />
                    {isLoggedIn && (
                      <p className="mt-1 text-xs font-semibold" style={{ color: MUTED }}>
                        Se usares outro numero, ele sera usado apenas para este pedido.
                      </p>
                    )}
                  </label>

                  <label className="block">
                    <span className="text-sm font-black">Quantidade</span>
                    <input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                      disabled={isSubmitting}
                      className="mt-2 w-full rounded-2xl border px-4 py-4 text-base font-black outline-none"
                      style={{ borderColor: BORDER, background: "#FFFDFC" }}
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-sm font-black">Variante <span className="font-semibold" style={{ color: MUTED }}>(opcional)</span></span>
                  <input
                    value={variant}
                    onChange={(event) => setVariant(event.target.value)}
                    disabled={isSubmitting}
                    placeholder="Ex: tamanho M, cor preta, 128GB"
                    className="mt-2 w-full rounded-2xl border px-4 py-4 text-base outline-none"
                    style={{ borderColor: BORDER, background: "#FFFDFC" }}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-black">Foto ou screenshot <span className="font-semibold" style={{ color: MUTED }}>(opcional)</span></span>
                  <div className="mt-2 rounded-2xl border px-4 py-4" style={{ borderColor: BORDER, background: "#FFFDFC" }}>
                    <input
                      ref={screenshotInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(event) => handleScreenshotChange(event.target.files?.[0] ?? null)}
                      disabled={isSubmitting}
                      className="w-full text-sm font-semibold"
                      style={{ color: MUTED }}
                    />
                    {screenshot ? (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ background: SOFT }}>
                        <span className="text-sm font-bold" style={{ color: TEXT }}>{screenshot.name}</span>
                        <button
                          type="button"
                          onClick={() => handleScreenshotChange(null)}
                          disabled={isSubmitting}
                          className="text-sm font-black"
                          style={{ color: RED }}
                        >
                          Remover
                        </button>
                      </div>
                    ) : null}
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-2xl px-5 py-4 text-base font-black text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: RED }}
                >
                  {isSubmitting ? "A processar pedido..." : "Pedir cotacao"}
                </button>
              </div>
            </form>
          </>
        )}
      </main>
    </>
  );
}
