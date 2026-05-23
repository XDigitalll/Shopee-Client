"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import { ClientActionFeedback, ClientFeedbackDock } from "@/components/client-feedback-state";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api-client";
import { normalizeClientError } from "@/lib/client-errors";
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
  { id: "OTHER", label: "Outras" },
];

function normalizeStore(value: string | null): string {
  if (!value) return "SHEIN";
  const normalized = value.trim().toUpperCase().replace(/[-\s]+/g, "_");
  return STORE_OPTIONS.some((store) => store.id === normalized) ? normalized : "OTHER";
}

function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (KNOWN_DOMAINS.some((d) => trimmed.toLowerCase().includes(d))) return true;
  const spaceCount = (trimmed.match(/\s/g) ?? []).length;
  return spaceCount < 3 && trimmed.includes(".");
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
  // WhatsApp / communication channel
  const [whatsappSameAsPrimary, setWhatsappSameAsPrimary] = useState<boolean | null>(null);
  const [communicationPhone, setCommunicationPhone] = useState("+258");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [acceptedLegalTerms, setAcceptedLegalTerms] = useState(false);
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
    // "input" is the current param; "link" kept for backward compat
    const initialInput = params.get("input")?.trim() || params.get("link")?.trim();
    setSelectedStore(normalizeStore(params.get("store")));
    if (initialInput) {
      setProductLink(initialInput);
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
      return "Cola o link ou descreve o produto que queres comprar.";
    }

    if (!Number.isFinite(quantity) || quantity < 1) {
      return "A quantidade deve ser no minimo 1.";
    }

    if (!phoneNumber.trim()) {
      return "Indica o teu numero de telefone principal.";
    }

    if (!PHONE_PATTERN.test(normalizePhone(phoneNumber))) {
      return "Usa um telefone valido de Mocambique. Ex: +25884xxxxxxx.";
    }

    if (whatsappSameAsPrimary === null) {
      return "Indica se recebes WhatsApp neste mesmo numero.";
    }

    if (whatsappSameAsPrimary === false) {
      if (!communicationPhone.trim() || communicationPhone.trim() === "+258") {
        return "Indica o numero WhatsApp para receber mensagens.";
      }
      if (!PHONE_PATTERN.test(normalizePhone(communicationPhone))) {
        return "Numero WhatsApp invalido. Ex: +25884xxxxxxx.";
      }
    }

    if (!acceptedLegalTerms) {
      return "Confirma que leste e concordas com os Termos de Uso e a Politica de Privacidade.";
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
      requestAnimationFrame(() => {
        const target = document.querySelector<HTMLInputElement | HTMLTextAreaElement>("textarea:invalid, input:invalid, #productInput, #phoneInput");
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        target?.focus();
      });
      return;
    }

    const cleanLink = productLink.trim();
    const cleanVariant = variant.trim();
    const cleanPhone = normalizePhone(phoneNumber);
    const cleanCommPhone = whatsappSameAsPrimary ? cleanPhone : normalizePhone(communicationPhone);

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
    body.set("communicationChannel", "WHATSAPP");
    body.set("whatsappSameAsPrimary", String(Boolean(whatsappSameAsPrimary)));
    body.set("communicationPhone", cleanCommPhone);
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
        response.code?.trim() ||
        null;
      if (!nextOrderNumber) {
        throw new Error("O pedido foi recebido, mas a referencia nao veio na resposta. Tenta novamente ou contacta o suporte.");
      }
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
      setWhatsappSameAsPrimary(null);
      setCommunicationPhone("+258");
      setAcceptedLegalTerms(false);
      setScreenshot(null);
      if (screenshotInputRef.current) {
        screenshotInputRef.current.value = "";
      }
      setFeedback({ type: "success", msg: nextMessage });
    } catch (error) {
      setFeedback({
        type: "error",
        msg: normalizeClientError(error, "Não foi possível enviar o pedido. Tenta novamente.").message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <ClientFeedbackDock feedback={feedback?.type === "success" || feedback?.type === "loading" ? feedback : null} onClose={() => setFeedback(null)} placement="center" />

      <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:py-10" style={{ color: TEXT }}>
        <section className="mb-6">
          <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: RED }}>
            Compra internacional
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-sora)] text-3xl font-black leading-tight sm:text-4xl">
            {isLoggedIn ? "Pede cotacao do estrangeiro" : "Pede cotacao sem criar conta"}
          </h1>
          <p className="mt-3 text-sm leading-7" style={{ color: MUTED }}>
            {isLoggedIn
              ? "Cola o link ou descreve o produto. A equipa valida preco, disponibilidade e prazo antes do pagamento."
              : "Cola o link ou descreve o produto, deixa o teu telefone e a equipa confirma o resto antes de qualquer pagamento."}
          </p>
        </section>

        {successOrder ? (
          <section className="rounded-[28px] border bg-white p-6 shadow-sm sm:p-8" style={{ borderColor: successOrder.firstGuestOrder ? RED : BORDER }}>
            <p className="text-sm font-black uppercase tracking-[0.2em]" style={{ color: RED }}>
              {successOrder.authenticatedOrder ? "Pedido registado" : successOrder.firstGuestOrder ? "Bem-vindo ao ShopeeMz" : "Ja temos uma conta para ti"}
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-sora)] text-3xl font-black">
              {successOrder.authenticatedOrder
                ? "Pedido recebido e associado a tua conta."
                : successOrder.firstGuestOrder
                  ? "O teu pedido ja entrou para analise."
                  : "Ja encontramos uma conta associada a este telefone."}
            </h2>
            <p className="mt-4 whitespace-pre-line text-base font-semibold leading-8" style={{ color: MUTED }}>
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

            <div className="mt-5 flex flex-wrap items-start gap-4">
              <div className="inline-flex flex-col gap-1 rounded-2xl px-5 py-4" style={{ background: SOFT, color: RED }}>
                <span className="text-xs font-black uppercase tracking-[0.18em]">Referencia do pedido</span>
                <span className="font-[family-name:var(--font-sora)] text-2xl font-black">
                  {successOrder.number}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-2xl px-4 py-3" style={{ background: "#ECFDF5" }}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="#166534" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-black" style={{ color: "#166534" }}>
                  Respondemos normalmente em menos de 10 minutos
                </span>
              </div>
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

              {successOrder.number ? (
                <Link
                  href={`/track/${encodeURIComponent(successOrder.number)}`}
                  className="rounded-2xl px-5 py-3 text-center text-sm font-black text-white sm:col-span-2"
                  style={{ background: RED }}
                >
                  Rastrear pedido
                </Link>
              ) : null}
              {successOrder.number ? (
                <button
                  type="button"
                  onClick={() => void saveOrderReference(successOrder.number!)}
                  className="rounded-2xl border px-5 py-3 text-sm font-black"
                  style={{ borderColor: BORDER, color: RED, background: "white" }}
                >
                  Guardar referencia
                </button>
              ) : null}
              <Link
                href="/store"
                className="rounded-2xl border px-5 py-3 text-center text-sm font-black"
                style={{ borderColor: BORDER, color: RED, background: "white" }}
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
                      {userLabel || userEmail || "Cliente ShopeeMz"}
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
                      {accountCompletionPercentage === 100 ? "Perfil completo" : `Perfil ${accountCompletionPercentage}% completo`}
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
                      Estamos a enviar os detalhes para a equipa. Mantem esta pagina aberta ate aparecer a referencia do pedido.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <form onSubmit={(event) => void handleSubmit(event)} className="rounded-[28px] border bg-white p-5 shadow-sm sm:p-7" style={{ borderColor: BORDER }}>
              <div className="grid gap-6">

                {/* Store chips — wrap on mobile */}
                <div>
                  <span className="text-sm font-black">Loja</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {STORE_OPTIONS.map((store) => {
                      const active = selectedStore === store.id;
                      return (
                        <button
                          key={store.id}
                          type="button"
                          onClick={() => setSelectedStore(store.id)}
                          disabled={isSubmitting}
                          className="rounded-full border px-4 py-2 text-sm font-black transition"
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
                </div>

                {/* Product input — text, not URL */}
                <div>
                  <label htmlFor="productInput" className="text-sm font-black">
                    Link ou descrição do produto
                  </label>
                  <textarea
                    id="productInput"
                    value={productLink}
                    onChange={(event) => setProductLink(event.target.value)}
                    disabled={isSubmitting}
                    rows={3}
                    placeholder="Cole o link da loja ou descreva o produto que quer comprar"
                    className="mt-2 w-full resize-none rounded-2xl border px-4 py-3 text-base outline-none"
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
                      Se tiver link, cole o endereço completo. Se não tiver, descreva o produto.
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
                </div>

                {/* Quantity + variant row */}
                <div className="grid gap-5 sm:grid-cols-[1fr_160px]">
                  <div>
                    <label htmlFor="variantInput" className="text-sm font-black">
                      Variante <span className="font-semibold" style={{ color: MUTED }}>(opcional)</span>
                    </label>
                    <input
                      id="variantInput"
                      value={variant}
                      onChange={(event) => setVariant(event.target.value)}
                      disabled={isSubmitting}
                      placeholder="Ex: tamanho M, cor preta, 128GB"
                      className="mt-2 w-full rounded-2xl border px-4 py-3.5 text-base outline-none"
                      style={{ borderColor: BORDER, background: "#FFFDFC" }}
                    />
                  </div>

                  <div>
                    <label htmlFor="quantityInput" className="text-sm font-black">Quantidade</label>
                    <input
                      id="quantityInput"
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                      disabled={isSubmitting}
                      className="mt-2 w-full rounded-2xl border px-4 py-3.5 text-base font-black outline-none"
                      style={{ borderColor: BORDER, background: "#FFFDFC" }}
                    />
                  </div>
                </div>

                {/* Primary phone */}
                <div>
                  <label htmlFor="phoneInput" className="text-sm font-black">
                    Telefone principal / pagamento
                  </label>
                  <input
                    id="phoneInput"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    disabled={isSubmitting}
                    placeholder="+25884xxxxxxx"
                    className="mt-2 w-full rounded-2xl border px-4 py-3.5 text-base font-bold outline-none"
                    style={{ borderColor: BORDER, background: "#FFFDFC" }}
                  />
                </div>

                {/* WhatsApp same-as-primary question */}
                <div className="pt-1">
                  <p className="text-sm font-black">Recebe WhatsApp neste mesmo número?</p>
                  <div className="mt-2 flex gap-3">
                    {[
                      { value: true, label: "Sim" },
                      { value: false, label: "Não" },
                    ].map(({ value, label }) => {
                      const active = whatsappSameAsPrimary === value;
                      return (
                        <button
                          key={label}
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => setWhatsappSameAsPrimary(value)}
                          className="rounded-2xl border px-6 py-2.5 text-sm font-black transition"
                          style={{
                            borderColor: active ? RED : BORDER,
                            background: active ? SOFT : "#FFFDFC",
                            color: active ? RED : TEXT,
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {whatsappSameAsPrimary === true ? (
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      O número principal será usado para atualizações do pedido, códigos de confirmação e recuperação da conta.
                    </p>
                  ) : null}
                </div>

                {/* Alternative WhatsApp number — shown only when Não */}
                {whatsappSameAsPrimary === false && (
                  <div>
                    <label htmlFor="commPhoneInput" className="text-sm font-black">
                      Número WhatsApp para receber mensagens
                    </label>
                    <input
                      id="commPhoneInput"
                      value={communicationPhone}
                      onChange={(event) => setCommunicationPhone(event.target.value)}
                      disabled={isSubmitting}
                      placeholder="+25884xxxxxxx"
                      className="mt-2 w-full rounded-2xl border px-4 py-3.5 text-base font-bold outline-none"
                      style={{ borderColor: BORDER, background: "#FFFDFC" }}
                    />
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      Este número será usado para atualizações do pedido, códigos de confirmação e recuperação da conta.
                    </p>
                  </div>
                )}

                {/* Screenshot */}
                <div>
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
                        <span className="text-sm font-bold truncate" style={{ color: TEXT }}>{screenshot.name}</span>
                        <button
                          type="button"
                          onClick={() => handleScreenshotChange(null)}
                          disabled={isSubmitting}
                          className="shrink-0 text-sm font-black"
                          style={{ color: RED }}
                        >
                          Remover
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <label className="flex items-start gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: BORDER, background: "#FFFDFC" }}>
                  <input
                    type="checkbox"
                    checked={acceptedLegalTerms}
                    onChange={(event) => setAcceptedLegalTerms(event.target.checked)}
                    disabled={isSubmitting}
                    className="mt-1 h-4 w-4 shrink-0 accent-[#E8431A]"
                  />
                  <span className="text-sm font-semibold leading-6" style={{ color: TEXT }}>
                    Li e concordo com os{" "}
                    <Link href="/terms" className="font-black" style={{ color: RED }}>
                      Termos de Uso
                    </Link>{" "}
                    e a{" "}
                    <Link href="/privacy" className="font-black" style={{ color: RED }}>
                      Politica de Privacidade
                    </Link>
                    .
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting || !acceptedLegalTerms}
                  className="w-full rounded-2xl px-5 py-4 text-base font-black text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: RED }}
                >
                  {isSubmitting ? "A processar pedido..." : "Pedir cotacao"}
                </button>
                <ClientActionFeedback
                  feedback={feedback && feedback.type !== "success" ? feedback : null}
                  onClose={() => setFeedback(null)}
                  actionLabel={feedback?.type === "error" && /sessão expirada|Inicia sessão/i.test(feedback.msg) ? "Entrar novamente" : undefined}
                  actionHref={feedback?.type === "error" && /sessão expirada|Inicia sessão/i.test(feedback.msg) ? "/login?redirect=%2Forders%2Fexternal%2Fnew" : undefined}
                />
              </div>
            </form>
          </>
        )}
      </main>
    </>
  );
}
