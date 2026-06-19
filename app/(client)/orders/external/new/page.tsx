"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { ClientActionFeedback, ClientFeedbackDock } from "@/components/client-feedback-state";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api-client";
import { normalizeClientError } from "@/lib/client-errors";
import { extractExternalOrderInput } from "@/lib/external-order-input-parser";
import type { Order } from "@/lib/types";

const RED = "#E8431A";
const TEXT = "#1A1410";
const MUTED = "#6B7280";
const BORDER = "#F2D4CC";
const SOFT = "#FFF0EC";
const PHONE_PATTERN = /^\+258(82|83|84|85|86|87)\d{7}$/;
const MAX_SCREENSHOT_SIZE = 10 * 1024 * 1024;
const MAX_SCREENSHOTS = 3;
const ACCEPTED_SCREENSHOT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ACCEPTED_SCREENSHOT_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const TEMPORARY_ACCESS_PREFILL_KEY = "shopeemz_temporary_access_prefill";
const KNOWN_DOMAINS = ["shein.com", "temu.com", "amazon", "aliexpress", "zara.com", "ebay", "shein.pt"];
const SPAM_WORDS = new Set(["oi", "olá", "ola", "ok", "sim", "nao", "não", "produto", "quero", "item", "123", "teste", "test", "ajuda", "help", "info", "hi", "hey", "bom", "obrigado"]);
const MIN_DESC_CHARS = 10;
const MIN_DESC_WORDS = 2;
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

function isSpamInput(value: string): boolean {
  const lower = value.trim().toLowerCase();
  if (!lower) return false;
  if (/^\d+$/.test(lower)) return true;
  if (lower.length < 4) return true;
  if (SPAM_WORDS.has(lower)) return true;
  return false;
}

function isValidDescription(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || isSpamInput(trimmed)) return false;
  if (trimmed.length < MIN_DESC_CHARS) return false;
  return trimmed.split(/\s+/).filter(Boolean).length >= MIN_DESC_WORDS;
}

type InputState = "empty" | "url" | "valid-description" | "weak-description" | "spam";
type FieldKey = "product" | "quantity" | "phone" | "terms";

type ValidationIssue = {
  field: FieldKey;
  message: string;
};

type FieldErrors = Partial<Record<FieldKey, string>>;

function getInputState(value: string): InputState {
  const trimmed = value.trim();
  if (!trimmed) return "empty";
  if (looksLikeUrl(trimmed)) return "url";
  if (isSpamInput(trimmed)) return "spam";
  if (isValidDescription(trimmed)) return "valid-description";
  return "weak-description";
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

type SuccessOrderState = {
  id: number;
  number: string;
  message: string;
  firstOrder: boolean;
  firstGuestOrder: boolean;
  authenticatedOrder: boolean;
  accountAlreadyExists: boolean;
  temporaryPassword?: string;
  loginIdentifier?: string;
};

type SubmittedOrderSummary = {
  store: string;
  input: string;
  inputType: "LINK" | "DESCRIPTION";
  characteristics: string;
  quantity: number;
  phone: string;
  photoNames: string[];
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildTemporaryAccessDocument(order: SuccessOrderState) {
  const reference = escapeHtml(order.number || "-");
  const loginIdentifier = escapeHtml(order.loginIdentifier || "-");
  const temporaryPassword = escapeHtml(order.temporaryPassword || "-");

  return `<!doctype html>
<html lang="pt">
<head>
  <meta charset="utf-8" />
  <title>Acesso temporário ShopeeMz</title>
  <style>
    body { margin: 0; padding: 32px; font-family: Arial, sans-serif; color: #1A1410; background: #fff; }
    .sheet { max-width: 680px; margin: 0 auto; border: 2px solid #E8431A; border-radius: 20px; padding: 28px; }
    .eyebrow { color: #E8431A; font-size: 12px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; }
    h1 { margin: 10px 0 18px; font-size: 28px; }
    .box { background: #FFF0EC; border-radius: 16px; padding: 18px; margin: 18px 0; }
    .row { margin: 12px 0; font-size: 16px; }
    .label { color: #6B7280; font-weight: 700; margin-right: 8px; }
    code { background: #fff; border-radius: 8px; color: #E8431A; font-size: 18px; font-weight: 800; padding: 5px 8px; }
    p { color: #6B7280; line-height: 1.6; }
    @media print { body { padding: 0; } .sheet { border-color: #E8431A; } }
  </style>
</head>
<body>
  <main class="sheet">
    <div class="eyebrow">ShopeeMz</div>
    <h1>Acesso temporário criado</h1>
    <p>Guarda estes dados. Por segurança, deverás trocar a senha no primeiro acesso.</p>
    <section class="box">
      <div class="row"><span class="label">Referência do pedido:</span><code>${reference}</code></div>
      <div class="row"><span class="label">Telefone:</span><code>${loginIdentifier}</code></div>
      <div class="row"><span class="label">Senha temporária:</span><code>${temporaryPassword}</code></div>
    </section>
    <p>Depois de entrares, cria uma senha nova e acompanha o pedido em Meus pedidos.</p>
  </main>
</body>
</html>`;
}

export default function NewExternalOrderPage() {
  const { token, userLabel, userEmail, userPhone, accountCompletionPercentage, hasProfileWarning } = useAuth();
  const router = useRouter();
  const isLoggedIn = Boolean(token);

  const [productLink, setProductLink] = useState("");
  const [selectedStore, setSelectedStore] = useState("SHEIN");
  const [variant, setVariant] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [phoneNumber, setPhoneNumber] = useState(() => userPhone || "+258");
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>([]);
  const [acceptedLegalTerms, setAcceptedLegalTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info" | "loading"; msg: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successOrder, setSuccessOrder] = useState<SuccessOrderState | null>(null);
  const [submittedOrderSummary, setSubmittedOrderSummary] = useState<SubmittedOrderSummary | null>(null);
  const productInputRef = useRef<HTMLTextAreaElement | null>(null);
  const quantityInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const termsRef = useRef<HTMLLabelElement | null>(null);
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);
  const temporaryAccessRef = useRef<HTMLDivElement | null>(null);
  const parsedInput = extractExternalOrderInput(productLink);

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
      const parsed = extractExternalOrderInput(initialInput);
      if (parsed.sourceStore) {
        setSelectedStore(normalizeStore(parsed.sourceStore));
      }
    }
  }, []);

  useEffect(() => {
    const previews = screenshots.map((file) => URL.createObjectURL(file));
    setScreenshotPreviews(previews);
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview));
    };
  }, [screenshots]);

  useEffect(() => {
    if (!successOrder?.firstGuestOrder || !successOrder.temporaryPassword) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      temporaryAccessRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [successOrder?.firstGuestOrder, successOrder?.id, successOrder?.temporaryPassword]);

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

  function validateForm(): ValidationIssue | null {
    const parsed = extractExternalOrderInput(productLink);
    const effectiveInput = parsed.productLink || parsed.cleanDescription || "";
    const inputState = getInputState(effectiveInput);
    const hasScreenshots = screenshots.length > 0;
    if ((inputState === "empty" || inputState === "spam") && !hasScreenshots) {
      return {
        field: "product",
        message: "Cola o link da loja ou descreve o produto com nome, loja, cor, tamanho ou modelo.",
      };
    }
    if (inputState === "weak-description" && !hasScreenshots) {
      return {
        field: "product",
        message: "Descreve melhor o produto: inclui nome, loja, cor, tamanho ou modelo.",
      };
    }

    if (!Number.isFinite(quantity) || quantity < 1) {
      return { field: "quantity", message: "Indica uma quantidade igual ou superior a 1." };
    }

    if (!phoneNumber.trim()) {
      return { field: "phone", message: "Preenche o teu telefone de contacto. Exemplo: +25884xxxxxxx." };
    }

    if (!PHONE_PATTERN.test(normalizePhone(phoneNumber))) {
      return { field: "phone", message: "Utiliza um número de telefone válido de Moçambique. Exemplo: +25884xxxxxxx." };
    }

    if (!acceptedLegalTerms) {
      return { field: "terms", message: "Aceita os Termos de Uso e a Política de Privacidade para continuar." };
    }

    return null;
  }

  function focusField(field: FieldKey) {
    const targets: Record<FieldKey, HTMLElement | null> = {
      product: productInputRef.current,
      quantity: quantityInputRef.current,
      phone: phoneInputRef.current,
      terms: termsRef.current,
    };
    const target = targets[field];
    requestAnimationFrame(() => {
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement) {
        target.focus();
      }
    });
  }

  function setSingleFieldError(issue: ValidationIssue) {
    setFieldErrors({ [issue.field]: issue.message });
    setFeedback({ type: "error", msg: issue.message });
    focusField(issue.field);
  }

  function clearFieldError(field: FieldKey) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function handleScreenshotChange(files: FileList | File[] | null) {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) {
      if (screenshotInputRef.current) {
        screenshotInputRef.current.value = "";
      }
      return;
    }

    if (screenshots.length + selectedFiles.length > MAX_SCREENSHOTS) {
      if (screenshotInputRef.current) {
        screenshotInputRef.current.value = "";
      }
      setFeedback({ type: "error", msg: "Podes adicionar no máximo 3 fotos." });
      return;
    }

    for (const file of selectedFiles) {
      const extension = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;
      if (!ACCEPTED_SCREENSHOT_TYPES.includes(file.type) || !ACCEPTED_SCREENSHOT_EXTENSIONS.includes(extension)) {
        if (screenshotInputRef.current) {
          screenshotInputRef.current.value = "";
        }
        setFeedback({ type: "error", msg: "Formato inválido. Envia PNG, JPG ou WebP." });
        return;
      }

      if (file.size > MAX_SCREENSHOT_SIZE) {
        if (screenshotInputRef.current) {
          screenshotInputRef.current.value = "";
        }
        setFeedback({ type: "error", msg: "Cada foto deve ter no máximo 10MB." });
        return;
      }
    }

    setScreenshots((current) => [...current, ...selectedFiles]);
    if (screenshotInputRef.current) {
      screenshotInputRef.current.value = "";
    }
  }

  function removeScreenshot(index: number) {
    setScreenshots((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function saveOrderReference(reference: string) {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(reference);
      setFeedback({ type: "success", msg: "Referência guardada." });
    } catch {
      setFeedback({ type: "info", msg: `Guarda esta referência: ${reference}` });
    }
  }

  async function copyTemporaryPassword(password: string) {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(password);
      setFeedback({ type: "success", msg: "Senha temporária copiada." });
    } catch {
      setFeedback({ type: "info", msg: `Senha temporária: ${password}` });
    }
  }

  function goToTemporaryAccessLogin(order: SuccessOrderState) {
    if (order.loginIdentifier && order.temporaryPassword) {
      window.sessionStorage.setItem(
        TEMPORARY_ACCESS_PREFILL_KEY,
        JSON.stringify({
          loginIdentifier: order.loginIdentifier,
          temporaryPassword: order.temporaryPassword,
          createdAt: Date.now(),
        }),
      );
    }
    router.push("/login?tab=login&redirect=%2Forders&reason=temporary-access");
  }

  function saveTemporaryAccessPdf(order: SuccessOrderState) {
    if (!order.temporaryPassword) {
      setFeedback({ type: "info", msg: "Não existe senha temporária para guardar neste pedido." });
      return;
    }

    const printWindow = window.open("", "_blank", "width=720,height=900");
    if (!printWindow) {
      setFeedback({ type: "info", msg: "Permite abrir a janela de impressão para guardares o acesso em PDF." });
      return;
    }

    printWindow.document.write(buildTemporaryAccessDocument(order));
    printWindow.document.close();
    setFeedback({ type: "success", msg: "Folha de acesso aberta. Escolhe 'Guardar como PDF'." });

    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  }

  function startAnotherOrder() {
    setSuccessOrder(null);
    setSubmittedOrderSummary(null);
    setProductLink("");
    setSelectedStore("SHEIN");
    setVariant("");
    setQuantity(1);
    setScreenshots([]);
    setAcceptedLegalTerms(false);
    setFieldErrors({});
    setFeedback(null);
    if (screenshotInputRef.current) {
      screenshotInputRef.current.value = "";
    }
    requestAnimationFrame(() => productInputRef.current?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const validationIssue = validateForm();
    if (validationIssue) {
      setSingleFieldError(validationIssue);
      return;
    }
    setFieldErrors({});

    const parsed = extractExternalOrderInput(productLink);
    const cleanLink = (parsed.productLink || productLink).trim();
    const cleanDescription = (parsed.cleanDescription || productLink).trim();
    const cleanVariant = variant.trim();
    const cleanPhone = normalizePhone(phoneNumber);
    const cleanCommPhone = cleanPhone;
    const summaryToDisplay: SubmittedOrderSummary = {
      store: parsed.sourceStore || selectedStore,
      input: parsed.productLink || cleanDescription || cleanLink,
      inputType: parsed.productLink ? "LINK" : "DESCRIPTION",
      characteristics: cleanVariant,
      quantity,
      phone: cleanPhone,
      photoNames: screenshots.map((file) => file.name),
    };

    const body = new FormData();
    body.append("productLink", cleanLink);
    body.append("externalCartUrl", cleanLink);
    body.append("link", cleanLink);
    body.append("description", cleanDescription);
    body.append("originalRawMessage", parsed.originalRawMessage);
    body.append("rawOriginalMessage", parsed.originalRawMessage);
    body.append("cleanDescription", cleanDescription);
    body.append("cleanedTitle", parsed.cleanedTitle || "");
    body.append("detectedLinks", JSON.stringify(parsed.detectedLinks));
    body.append("promotionalTextRemoved", String(parsed.promotionalTextRemoved));
    body.append("variant", cleanVariant);
    body.append("quantity", String(quantity));
    body.append("primaryPhoneNumber", cleanPhone);
    body.append("phoneNumber", cleanPhone);
    body.append("sourceStore", parsed.sourceStore || selectedStore);
    body.append("source", parsed.sourceStore || selectedStore);
    body.append("whatsappPhone", cleanCommPhone || cleanPhone);

    body.set("cartLink", cleanLink);
    body.set("store", parsed.sourceStore || selectedStore);
    body.set("requestInputType", parsed.productLink ? "LINK" : "DESCRIPTION");
    body.set("phone", cleanPhone);
    body.set("communicationChannel", "WHATSAPP");
    body.set("whatsappSameAsPrimary", "true");
    body.set("communicationPhone", cleanPhone);
    if (cleanVariant) {
      body.set("variantDetails", cleanVariant);
      body.set("productDetails", cleanVariant);
    }
    if (screenshots.length > 0) {
      body.append("screenshot", screenshots[0], screenshots[0].name);
      screenshots.forEach((file) => {
        body.append("screenshots", file, file.name);
      });
    }

    setIsSubmitting(true);
    setFeedback({ type: "loading", msg: "A enviar pedido para análise..." });

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
        throw new Error("O pedido foi recebido, mas a referência não chegou na resposta. Tenta novamente ou contacta o suporte.");
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
      setSubmittedOrderSummary(summaryToDisplay);
      const phoneToKeep = userPhone || cleanPhone || phoneNumber || "+258";
      setProductLink("");
      setVariant("");
      setQuantity(1);
      setPhoneNumber(phoneToKeep);
      setAcceptedLegalTerms(false);
      setScreenshots([]);
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
            Peça uma cotação internacional
          </h1>
          <p className="mt-3 text-sm leading-7" style={{ color: MUTED }}>
            {isLoggedIn
              ? "Envia o link ou descreve o produto que pretendes comprar. A nossa equipa confirma o preço, disponibilidade e prazo antes do pagamento."
              : "Envia o link ou descreve o produto, deixa o teu telefone e a nossa equipa confirma tudo antes de qualquer pagamento."}
          </p>
        </section>

        {successOrder ? (
          <section className="rounded-[28px] border bg-white p-6 shadow-sm sm:p-8" style={{ borderColor: successOrder.firstGuestOrder ? RED : BORDER }}>
            <p className="text-sm font-black uppercase tracking-[0.2em]" style={{ color: RED }}>
              {successOrder.authenticatedOrder ? "Pedido registado" : successOrder.firstGuestOrder ? "Bem-vindo ao ShopeeMz" : "Já temos uma conta para ti"}
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-sora)] text-3xl font-black">
              {successOrder.authenticatedOrder
                ? "Pedido recebido e associado a tua conta."
                : successOrder.firstGuestOrder
                  ? "O teu pedido já entrou para análise."
                  : "Já encontrámos uma conta associada a este telefone."}
            </h2>
            {!(successOrder.firstGuestOrder && successOrder.temporaryPassword) ? (
            <p className="mt-4 whitespace-pre-line text-base font-semibold leading-8" style={{ color: MUTED }}>
              {successOrder.authenticatedOrder
                ? "A nossa equipa vai analisar o preço, disponibilidade e prazo. Podes acompanhar tudo na página de pedidos."
                : successOrder.firstGuestOrder
                  ? successOrder.message
                  : "Recebemos o teu pedido. Entra para acompanhares todos os teus pedidos ou recupera o acesso se precisares."}
            </p>
            ) : null}

            {successOrder.firstGuestOrder && successOrder.temporaryPassword ? (
              <div
                ref={temporaryAccessRef}
                className="mt-5 overflow-hidden rounded-[26px] border-2 shadow-sm"
                style={{ borderColor: RED, background: "#fff", scrollMarginTop: "120px" }}
              >
                <div className="p-5 sm:p-6" style={{ background: "linear-gradient(135deg, #FFF0EC 0%, #FFFFFF 70%)" }}>
                  <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: RED }}>
                    Acesso temporário criado
                  </p>
                  <h3 className="mt-2 font-[family-name:var(--font-sora)] text-2xl font-black leading-tight" style={{ color: TEXT }}>
                    Para acompanhar o pedido, entra com estes dados
                  </h3>
                  <p className="mt-3 text-sm font-semibold leading-6" style={{ color: MUTED }}>
                    Criámos uma conta automática para ti. Usa o teu telefone e a senha temporária abaixo para fazer login e ver a cotação, pagamentos e estado do pedido.
                  </p>

                  <div className="mt-5 grid gap-3">
                    <div className="rounded-2xl border px-4 py-3" style={{ borderColor: BORDER, background: "#fff" }}>
                      <span className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: MUTED }}>Telefone</span>
                      <div className="mt-1 break-all font-[family-name:var(--font-sora)] text-xl font-black sm:text-2xl" style={{ color: TEXT }}>
                        {successOrder.loginIdentifier || submittedOrderSummary?.phone || "-"}
                      </div>
                    </div>
                    <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "#F7B7A6", background: "#FFF8F5" }}>
                      <span className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: MUTED }}>Senha temporária</span>
                      <div className="mt-1 break-all font-[family-name:var(--font-sora)] text-2xl font-black sm:text-3xl" style={{ color: RED }}>
                        {successOrder.temporaryPassword}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => goToTemporaryAccessLogin(successOrder)}
                      className="rounded-2xl px-5 py-3.5 text-center text-sm font-black text-white shadow-sm transition hover:opacity-95"
                      style={{ background: RED }}
                    >
                      Entrar agora com estes dados
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyTemporaryPassword(successOrder.temporaryPassword!)}
                      className="rounded-2xl border px-5 py-3.5 text-sm font-black"
                      style={{ borderColor: BORDER, color: RED, background: "white" }}
                    >
                      Copiar senha temporária
                    </button>
                  </div>

                  <p className="mt-4 rounded-2xl border px-4 py-3 text-xs font-bold leading-5" style={{ borderColor: "#F7B7A6", background: "#FFF8F5", color: "#9A3412" }}>
                    Guarda estes dados. Se fechares esta página sem guardar, entra em contacto connosco para recuperar o acesso.
                  </p>
                </div>
              </div>
            ) : null}

            {successOrder.firstGuestOrder && successOrder.temporaryPassword ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-[1.2fr_0.8fr]">
                <section className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: BORDER, background: "#FFFDFC" }}>
                  <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: RED }}>Como acompanhar</p>
                  <ol className="mt-4 space-y-3 text-sm font-bold" style={{ color: TEXT }}>
                    <li className="flex gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs text-white" style={{ background: RED }}>1</span>
                      <span>Clica em "Entrar agora"</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs text-white" style={{ background: RED }}>2</span>
                      <span>Usa o telefone mostrado acima</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs text-white" style={{ background: RED }}>3</span>
                      <span>Cola a senha temporária e troca por uma senha tua</span>
                    </li>
                  </ol>
                </section>
                <section className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: BORDER, background: "#F8FAFC" }}>
                  <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: TEXT }}>WhatsApp em breve</p>
                  <p className="mt-3 text-sm font-semibold leading-6" style={{ color: MUTED }}>
                    Consulta pelo WhatsApp estará disponível em breve. Por agora, acompanha o pedido entrando no site com estes dados.
                  </p>
                </section>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-start gap-4">
              <div className="inline-flex flex-col gap-1 rounded-2xl px-5 py-4" style={{ background: SOFT, color: RED }}>
                <span className="text-xs font-black uppercase tracking-[0.18em]">Referência do pedido</span>
                <span className="font-[family-name:var(--font-sora)] text-2xl font-black">
                  {successOrder.number}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-2xl px-4 py-3" style={{ background: "#ECFDF5" }}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="#166534" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-black" style={{ color: "#166534" }}>
                  Respondemos normalmente em até 24 horas
                </span>
              </div>
            </div>

            {submittedOrderSummary ? (
              <div className="mt-6 rounded-2xl border p-4 sm:p-5" style={{ borderColor: BORDER, background: "#FFFDFC" }}>
                <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: RED }}>
                  Informações enviadas
                </p>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-xl px-3 py-3" style={{ background: "#FFF8F5" }}>
                    <p className="text-xs font-black uppercase tracking-[0.12em]" style={{ color: MUTED }}>Loja escolhida</p>
                    <p className="mt-1 font-bold" style={{ color: TEXT }}>{submittedOrderSummary.store}</p>
                  </div>
                  <div className="rounded-xl px-3 py-3" style={{ background: "#FFF8F5" }}>
                    <p className="text-xs font-black uppercase tracking-[0.12em]" style={{ color: MUTED }}>Quantidade</p>
                    <p className="mt-1 font-bold" style={{ color: TEXT }}>{submittedOrderSummary.quantity}</p>
                  </div>
                  <div className="rounded-xl px-3 py-3 sm:col-span-2" style={{ background: "#FFF8F5" }}>
                    <p className="text-xs font-black uppercase tracking-[0.12em]" style={{ color: MUTED }}>
                      {submittedOrderSummary.inputType === "LINK" ? "Link enviado" : "Descrição enviada"}
                    </p>
                    <p className="mt-1 break-words font-bold leading-6" style={{ color: TEXT }}>{submittedOrderSummary.input}</p>
                  </div>
                  <div className="rounded-xl px-3 py-3 sm:col-span-2" style={{ background: "#FFF8F5" }}>
                    <p className="text-xs font-black uppercase tracking-[0.12em]" style={{ color: MUTED }}>Características informadas</p>
                    <p className="mt-1 whitespace-pre-wrap font-bold leading-6" style={{ color: TEXT }}>
                      {submittedOrderSummary.characteristics || "Nenhuma característica adicional informada."}
                    </p>
                  </div>
                  <div className="rounded-xl px-3 py-3" style={{ background: "#FFF8F5" }}>
                    <p className="text-xs font-black uppercase tracking-[0.12em]" style={{ color: MUTED }}>Telefone</p>
                    <p className="mt-1 font-bold" style={{ color: TEXT }}>{submittedOrderSummary.phone}</p>
                  </div>
                  <div className="rounded-xl px-3 py-3" style={{ background: "#FFF8F5" }}>
                    <p className="text-xs font-black uppercase tracking-[0.12em]" style={{ color: MUTED }}>Fotos/capturas de ecrã</p>
                    {submittedOrderSummary.photoNames.length ? (
                      <ul className="mt-1 space-y-1">
                        {submittedOrderSummary.photoNames.map((name, index) => (
                          <li key={`${name}-${index}`} className="truncate font-bold" style={{ color: TEXT }}>
                            {index + 1}. {name}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 font-bold" style={{ color: TEXT }}>Nenhuma foto enviada.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
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
                  Guardar referência
                </button>
              ) : null}
              {successOrder.firstGuestOrder && successOrder.temporaryPassword ? (
                <button
                  type="button"
                  onClick={() => saveTemporaryAccessPdf(successOrder)}
                  className="rounded-2xl border px-5 py-3 text-sm font-black"
                  style={{ borderColor: BORDER, color: RED, background: "white" }}
                >
                  Guardar acesso em PDF
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
              onClick={startAnotherOrder}
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
                    <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: RED }}>Pedido associado à tua conta</p>
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
                    {hasProfileWarning && (
                      <p className="mt-1 text-xs" style={{ color: MUTED }}>
                        Completa o perfil para melhor acompanhamento.
                      </p>
                    )}
                  </div>
                </div>
                {!userPhone && (
                  <div className="mt-3 rounded-2xl border px-4 py-3 text-sm font-semibold" style={{ borderColor: "#FCA5A5", background: "#FFF5F5", color: "#B42318" }}>
                    Adiciona um número de telefone no teu perfil para receberes atualizações sobre este pedido.
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
                      Estamos a enviar os detalhes para a nossa equipa. Mantém esta página aberta até aparecer a referência do pedido.
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

                {/* Product input — URL or description */}
                <div>
                  <label htmlFor="productInput" className="text-sm font-black">
                    Link ou descrição do produto
                  </label>
                  <textarea
                    id="productInput"
                    ref={productInputRef}
                    value={productLink}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      const parsed = extractExternalOrderInput(nextValue);
                      setProductLink(nextValue);
                      if (parsed.sourceStore) {
                        setSelectedStore(normalizeStore(parsed.sourceStore));
                      }
                      clearFieldError("product");
                    }}
                    disabled={isSubmitting}
                    rows={3}
                    aria-invalid={Boolean(fieldErrors.product)}
                    aria-describedby={fieldErrors.product ? "productInput-error" : undefined}
                    placeholder="Cola o link ou descreve o produto. Ex.: Calças cargo pretas da SHEIN, tamanho M"
                    className="mt-2 w-full resize-none rounded-2xl border px-4 py-3 text-base outline-none transition-colors"
                    style={{
                      borderColor: (() => {
                        if (fieldErrors.product) return "#dc2626";
                        const s = getInputState(productLink);
                        if (s === "url" || s === "valid-description") return "#16a34a";
                        if (s === "weak-description" || s === "spam") return "#d97706";
                        return BORDER;
                      })(),
                      background: fieldErrors.product ? "#FFF5F5" : "#FFFDFC",
                    }}
                  />
                  {fieldErrors.product ? (
                    <p id="productInput-error" className="mt-2 rounded-xl border px-3 py-2 text-sm font-bold leading-5" style={{ borderColor: "#FCA5A5", background: "#FFF5F5", color: "#B42318" }}>
                      {fieldErrors.product}
                    </p>
                  ) : null}

                  {parsedInput.productLink || parsedInput.cleanDescription ? (
                    <div className="mt-3 rounded-2xl border px-4 py-3" style={{ borderColor: "#BBF7D0", background: "#F0FDF4" }}>
                      <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "#166534" }}>
                        Organizamos automaticamente os dados do produto para ti.
                      </p>
                      <div className="mt-3 grid gap-3">
                        <div className="flex flex-wrap gap-2">
                          {parsedInput.sourceStore ? (
                            <span className="rounded-full px-3 py-1 text-xs font-black" style={{ background: "#DCFCE7", color: "#166534" }}>
                              Loja detectada: {parsedInput.sourceStore.replace("_", " ")}
                            </span>
                          ) : null}
                          {parsedInput.productLink ? (
                            <span className="rounded-full px-3 py-1 text-xs font-black" style={{ background: "#DBEAFE", color: "#1D4ED8" }}>
                              Link encontrado
                            </span>
                          ) : null}
                          {parsedInput.promotionalTextRemoved ? (
                            <span className="rounded-full px-3 py-1 text-xs font-black" style={{ background: "#FEF3C7", color: "#92400E" }}>
                              Texto promocional removido
                            </span>
                          ) : null}
                        </div>
                        {parsedInput.cleanDescription ? (
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: "#15803D" }}>Descrição limpa</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6" style={{ color: TEXT }}>
                              {parsedInput.cleanDescription}
                            </p>
                          </div>
                        ) : null}
                        {parsedInput.productLink ? (
                          <p className="truncate rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: "#FFFFFF", color: MUTED }}>
                            {parsedInput.productLink}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {/* Feedback line */}
                  {(() => {
                    const s = getInputState(productLink);
                    if (s === "url") return (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#166534" }}>
                        <svg className="shrink-0" width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                        Link reconhecido.
                      </p>
                    );
                    if (s === "valid-description") return (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#166534" }}>
                        <svg className="shrink-0" width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                        Descrição reconhecida.
                      </p>
                    );
                    if (s === "weak-description" || s === "spam") return (
                      <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold leading-5" style={{ color: "#92400E" }}>
                        <svg className="mt-px shrink-0" width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                        Descreve melhor o produto: nome, loja, cor, tamanho ou modelo.
                      </p>
                    );
                    return (
                      <div className="mt-2 rounded-xl p-3" style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}>
                        <p className="text-xs font-semibold" style={{ color: "#92400E" }}>Exemplos de pedidos aceites:</p>
                        <ul className="mt-1 space-y-0.5">
                          {["Calças cargo pretas da SHEIN, tamanho M", "Nike Air Force branco, número 42", "iPhone 13 Pro Max azul, 256GB"].map((ex) => (
                            <li key={ex} className="flex items-start gap-1 text-xs" style={{ color: "#78350F" }}>
                              <span className="mt-px shrink-0">·</span>
                              <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => setProductLink(ex)}>{ex}</button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}
                </div>

                {/* Quantity + characteristics row */}
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_160px] lg:items-start">
                  <div>
                    <label htmlFor="variantInput" className="text-sm font-black">
                      Características do produto <span className="font-semibold" style={{ color: MUTED }}>(opcional)</span>
                    </label>
                    <textarea
                      id="variantInput"
                      value={variant}
                      onChange={(event) => setVariant(event.target.value)}
                      disabled={isSubmitting}
                      rows={3}
                      placeholder="Ex: tamanho M, cor preta, 128GB, número 42, modelo Pro Max"
                      className="mt-2 w-full resize-y rounded-2xl border px-4 py-3 text-base outline-none transition-colors"
                      style={{ borderColor: BORDER, background: "#FFFDFC" }}
                    ></textarea>
                    <div className="mt-2 rounded-xl p-3" style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}>
                    <p className="text-xs font-semibold leading-5" style={{ color: "#92400E" }}>
                      Indica tamanho, cor, modelo, memória, número ou qualquer detalhe importante para encontrarmos exatamente o produto correto.
                    </p>
                    <p className="sr-only">
                      Escreve aqui tudo que pode mudar no produto: tamanho, cor, modelo, memória, número, quantidade por pacote ou qualquer detalhe importante.
                    </p>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="quantityInput" className="text-sm font-black">Quantidade</label>
                    <input
                      id="quantityInput"
                      ref={quantityInputRef}
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(event) => {
                        setQuantity(Math.max(1, Number(event.target.value) || 1));
                        clearFieldError("quantity");
                      }}
                      disabled={isSubmitting}
                      aria-invalid={Boolean(fieldErrors.quantity)}
                      aria-describedby={fieldErrors.quantity ? "quantityInput-error" : undefined}
                      className="mt-2 w-full rounded-2xl border px-4 py-3.5 text-base font-black outline-none"
                      style={{ borderColor: fieldErrors.quantity ? "#dc2626" : BORDER, background: fieldErrors.quantity ? "#FFF5F5" : "#FFFDFC" }}
                    />
                    {fieldErrors.quantity ? (
                      <p id="quantityInput-error" className="mt-2 text-xs font-bold leading-5" style={{ color: "#B42318" }}>
                        {fieldErrors.quantity}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Primary phone */}
                <div>
                  <label htmlFor="phoneInput" className="text-sm font-black">
                    Telefone de contacto
                  </label>
                  <input
                    id="phoneInput"
                    ref={phoneInputRef}
                    value={phoneNumber}
                    onChange={(event) => {
                      setPhoneNumber(event.target.value);
                      clearFieldError("phone");
                    }}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(fieldErrors.phone)}
                    aria-describedby={fieldErrors.phone ? "phoneInput-error" : "phoneInput-help"}
                    placeholder="+25884xxxxxxx"
                    className="mt-2 w-full rounded-2xl border px-4 py-3.5 text-base font-bold outline-none"
                    style={{ borderColor: fieldErrors.phone ? "#dc2626" : BORDER, background: fieldErrors.phone ? "#FFF5F5" : "#FFFDFC" }}
                  />
                  {fieldErrors.phone ? (
                    <p id="phoneInput-error" className="mt-2 rounded-xl border px-3 py-2 text-sm font-bold leading-5" style={{ borderColor: "#FCA5A5", background: "#FFF5F5", color: "#B42318" }}>
                      {fieldErrors.phone}
                    </p>
                  ) : (
                    <p id="phoneInput-help" className="mt-2 text-xs font-semibold leading-5" style={{ color: MUTED }}>
                      Usaremos este número para acompanhar a tua encomenda e enviar atualizações importantes. Preferencialmente com WhatsApp ativo.
                    </p>
                  )}
                </div>

                {/* Screenshots */}
                <div>
                  <span className="text-sm font-black">Fotos ou capturas de ecrã <span className="font-semibold" style={{ color: MUTED }}>(opcional)</span></span>
                  <div className="mt-2">
                    <input
                      ref={screenshotInputRef}
                      id="screenshotInput"
                      type="file"
                      multiple
                      accept={ACCEPTED_SCREENSHOT_TYPES.join(",")}
                      onChange={(event) => handleScreenshotChange(event.target.files ?? null)}
                      disabled={isSubmitting}
                      className="sr-only"
                      aria-hidden="true"
                      tabIndex={-1}
                    />
                    <button
                      type="button"
                      disabled={isSubmitting || screenshots.length >= MAX_SCREENSHOTS}
                      onClick={() => screenshotInputRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 text-sm font-black transition active:opacity-80 disabled:cursor-not-allowed disabled:opacity-55"
                      style={{ borderColor: BORDER, background: "#FFFDFC", color: TEXT }}
                    >
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                      </svg>
                      Adicionar fotos ou capturas de ecrã
                    </button>
                    {screenshots.length > 0 ? (
                      <div className="mt-3 grid gap-2">
                        {screenshots.map((file, index) => (
                          <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-3" style={{ borderColor: BORDER, background: SOFT }}>
                            <div className="flex min-w-0 items-center gap-3">
                              {screenshotPreviews[index] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={screenshotPreviews[index]} alt={`Foto selecionada ${index + 1}`} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                              ) : (
                                <span className="h-12 w-12 shrink-0 rounded-xl" style={{ background: "#FFFDFC" }} />
                              )}
                              <div className="min-w-0">
                                <span className="block truncate text-sm font-bold" style={{ color: TEXT }}>{file.name}</span>
                                <span className="text-xs font-semibold" style={{ color: MUTED }}>{(file.size / (1024 * 1024)).toFixed(1)}MB</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeScreenshot(index)}
                              disabled={isSubmitting}
                              className="shrink-0 text-sm font-black disabled:cursor-not-allowed disabled:opacity-55"
                              style={{ color: RED }}
                            >
                              Remover
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-2 text-xs font-semibold leading-5" style={{ color: MUTED }}>
                      PNG, JPG ou WebP. Máximo 3 imagens, até 10MB cada.
                    </p>
                  </div>
                </div>

                <label ref={termsRef} className="flex items-start gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: fieldErrors.terms ? "#dc2626" : BORDER, background: fieldErrors.terms ? "#FFF5F5" : "#FFFDFC" }}>
                  <input
                    type="checkbox"
                    checked={acceptedLegalTerms}
                    onChange={(event) => {
                      setAcceptedLegalTerms(event.target.checked);
                      clearFieldError("terms");
                    }}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(fieldErrors.terms)}
                    aria-describedby={fieldErrors.terms ? "terms-error" : undefined}
                    className="mt-1 h-4 w-4 shrink-0 accent-[#E8431A]"
                  />
                  <span className="text-sm font-semibold leading-6" style={{ color: TEXT }}>
                    Li e concordo com os{" "}
                    <Link href="/terms" className="font-black" style={{ color: RED }}>
                      Termos de Uso
                    </Link>{" "}
                    e a{" "}
                    <Link href="/privacy" className="font-black" style={{ color: RED }}>
                      Política de Privacidade
                    </Link>
                    .
                  </span>
                </label>
                {fieldErrors.terms ? (
                  <p id="terms-error" className="-mt-4 text-sm font-bold leading-5" style={{ color: "#B42318" }}>
                    {fieldErrors.terms}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-2xl px-5 py-4 text-base font-black text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: RED }}
                >
                  {isSubmitting ? "A enviar pedido..." : "Enviar pedido de cotação"}
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
