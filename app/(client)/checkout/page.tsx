"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClientActionFeedback, ClientFeedbackBanner, ClientSectionSkeleton } from "@/components/client-feedback-state";
import { formatMoney } from "@/lib/format";
import { orderDisplayCode } from "@/lib/order-label";
import { getCsrfToken, XSRF_HEADER } from "@/lib/csrf";
import { normalizeClientError } from "@/lib/client-errors";
import type { Cart, CartItem, CheckoutResponse, CouponValidation, CustomerProfile, Order, UserAddress } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { addressMatchesForm, applySavedAddress, createAddressLabel, createPrefilledAddress, createPrefilledContact } from "@/lib/address-book";

const RED = "#E8431A";
const CHECKOUT_SELECTION_KEY = "shopeex-checkout-selection";
const PHONE_PATTERN = /^\+258(82|83|84|85|86|87)\d{7}$/;

const initialForm = {
  deliveryMethod: "DELIVERY",
  fullName: "",
  primaryPhoneNumber: "+258",
  alternativePhoneNumber: "",
  email: "",
  customerNotes: "",
  city: "Maputo",
  neighborhood: "",
  street: "",
  houseNumber: "",
  deliveryReference: "",
  googleMapsLink: "",
};

const fieldClass = "w-full rounded-2xl border px-4 py-3 text-sm outline-none";

function isValidPhone(value: string) {
  return PHONE_PATTERN.test(value.trim());
}

function getPhoneError(value: string, required: boolean) {
  const trimmed = value.trim();
  if (!trimmed) return required ? "Usa o formato +2588xxxxxxxx." : "";
  return isValidPhone(trimmed) ? "" : "Número inválido. Usa o formato +2588xxxxxxxx.";
}

function isCheckoutResponse(payload: CheckoutResponse | Order | null): payload is CheckoutResponse {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    "primaryOrder" in payload &&
    "mixedCheckout" in payload
  );
}

function getInternalOrderForPayment(result: CheckoutResponse) {
  if (result.localOrder?.id) return result.localOrder;
  if (result.primaryOrder?.type === "INTERNAL" && result.primaryOrder.id) return result.primaryOrder;
  return result.orders?.find((order) => order.type === "INTERNAL" && order.id) ?? null;
}

async function fetchWithAuth<T>(url: string, _token: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const method = String(init?.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers.set(XSRF_HEADER, csrfToken);
  }
  const response = await fetch(url, { ...init, headers, cache: "no-store", credentials: "same-origin" });
  if (response.status === 204) return null as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || payload?.error || "Não foi possível concluir a operação.");
  return payload as T;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<UserAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | "manual" | null>(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<number[] | null>(null);
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info" | "loading"; msg: string } | null>(null);
  const [submitFeedback, setSubmitFeedback] = useState<{ type: "success" | "error" | "info" | "loading"; msg: string } | null>(null);
  const [couponFeedback, setCouponFeedback] = useState<{ type: "success" | "error" | "info" | "loading"; msg: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState({ primary: false, alternative: false });
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<CouponValidation | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const primaryPhoneRef = useRef<HTMLInputElement | null>(null);
  const alternativePhoneRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const loadCheckout = async () => {
      if (!token) return;
      setIsLoading(true);
      try {
        const [payload, me, addresses] = await Promise.all([
          fetchWithAuth<Cart>("/api/cart", token),
          fetchWithAuth<CustomerProfile>("/api/xdigital/users/me", token),
          fetchWithAuth<UserAddress[]>("/api/xdigital/users/me/addresses", token),
        ]);
        setCart(payload);
        setSavedAddresses(addresses);

        const contact = createPrefilledContact(me);
        const address = addresses.find((item) => item.defaultAddress)
          ? applySavedAddress(createPrefilledAddress(me), addresses.find((item) => item.defaultAddress)!)
          : createPrefilledAddress(me);

        setForm((current) => ({
          ...current,
          ...contact,
          ...address,
        }));
        setSelectedAddressId(addresses.find((item) => item.defaultAddress)?.id ?? (addresses.length ? addresses[0].id : "manual"));
        setSaveAddress(addresses.length === 0);

        if (typeof window !== "undefined") {
          const rawSelection = window.sessionStorage.getItem(CHECKOUT_SELECTION_KEY);
          if (rawSelection) {
            const parsedSelection = JSON.parse(rawSelection);
            if (Array.isArray(parsedSelection)) {
              const validSelection = parsedSelection
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value) && payload.items.some((item) => item.itemId === value));
              setSelectedItemIds(validSelection.length ? validSelection : null);
            } else {
              setSelectedItemIds(null);
            }
          } else {
            setSelectedItemIds(null);
          }
        }
      } catch (error) {
        setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Não foi possível carregar o checkout." });
      } finally {
        setIsLoading(false);
      }
    };
    void loadCheckout();
  }, [token]);

  useEffect(() => {
    if (!savedAddresses.length || selectedAddressId === "manual" || selectedAddressId == null) {
      return;
    }

    const selectedAddress = savedAddresses.find((item) => item.id === selectedAddressId);
    if (!selectedAddress) {
      return;
    }

    setForm((current) => applySavedAddress(current, selectedAddress));
  }, [savedAddresses, selectedAddressId]);

  const checkoutItems = useMemo(() => {
    if (!cart?.items) return [];
    if (!selectedItemIds || selectedItemIds.length === 0) return cart.items;
    const selected = new Set(selectedItemIds);
    return cart.items.filter((item) => selected.has(item.itemId));
  }, [cart, selectedItemIds]);

  const localItems = useMemo(() => checkoutItems.filter((item) => item.itemType !== "EXTERNAL" && !item.madeToOrder), [checkoutItems]);
  const externalItems = useMemo(() => checkoutItems.filter((item) => item.itemType === "EXTERNAL" || item.madeToOrder), [checkoutItems]);
  const localSubtotal = localItems.reduce((sum, item) => sum + Number(item.subTotal || 0), 0);
  const total = localSubtotal;
  const discountAmount = coupon?.valid ? Number(coupon.discountAmount || 0) : 0;
  const totalAfterDiscount = Math.max(total - discountAmount, 0);
  const primaryPhoneError = getPhoneError(form.primaryPhoneNumber, true);
  const alternativePhoneError = getPhoneError(form.alternativePhoneNumber, false);
  const hasPhoneErrors = Boolean(primaryPhoneError || alternativePhoneError);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    if (hasPhoneErrors) {
      setPhoneTouched({ primary: true, alternative: true });
      setSubmitFeedback({ type: "error", msg: "Revê os campos destacados antes de continuar." });
      setTimeout(() => {
        const target = primaryPhoneError ? primaryPhoneRef.current : alternativePhoneRef.current;
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        target?.focus();
      }, 0);
      return;
    }
    setIsSubmitting(true);
    setSubmitFeedback({ type: "loading", msg: "Estamos a validar os teus dados, criar o pedido e preparar o pagamento." });
    setFeedback(null);
    try {
      const checkoutResult = await fetchWithAuth<CheckoutResponse | Order>("/api/xdigital/orders/from-cart", token, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          primaryPhoneNumber: form.primaryPhoneNumber.trim(),
          alternativePhoneNumber: form.alternativePhoneNumber.trim(),
          selectedItemIds: checkoutItems.map((item) => item.itemId),
          couponCode: coupon?.valid ? coupon.code : undefined,
        }),
      });
      if (
        form.deliveryMethod === "DELIVERY" &&
        saveAddress &&
        !savedAddresses.some((address) => addressMatchesForm(address, form))
      ) {
        try {
          await fetchWithAuth<UserAddress>("/api/xdigital/users/me/addresses", token, {
            method: "POST",
            body: JSON.stringify({
              label: createAddressLabel(form),
              city: form.city,
              neighborhood: form.neighborhood,
              street: form.street,
              houseNumber: form.houseNumber,
              reference: form.deliveryReference,
              googleMapsLink: form.googleMapsLink,
              defaultAddress: savedAddresses.length === 0,
            }),
          });
        } catch {
          // não bloqueia a compra se falhar ao guardar a morada
        }
      }
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(CHECKOUT_SELECTION_KEY);
      }
      const result = isCheckoutResponse(checkoutResult)
        ? checkoutResult
        : {
            mixedCheckout: false,
            message: "",
            primaryOrder: checkoutResult,
            localOrder: checkoutResult?.type === "INTERNAL" ? checkoutResult : null,
            externalOrder: checkoutResult?.type === "EXTERNAL" ? checkoutResult : null,
          };
      const primaryOrder = result.primaryOrder;
      const localOrder = result.localOrder;
      const externalOrder = result.externalOrder;
      const internalOrderForPayment = getInternalOrderForPayment(result);

      if (internalOrderForPayment?.id) {
        setFeedback({
          type: "success",
          msg: result.mixedCheckout && externalOrder
            ? `Pedido local ${orderDisplayCode(localOrder ?? internalOrderForPayment)} criado. Vais seguir para o pagamento; a compra internacional ${orderDisplayCode(externalOrder)} fica em análise separada.`
            : `Pedido ${orderDisplayCode(internalOrderForPayment)} criado. A abrir pagamento...`,
        });
        router.push(`/orders/${internalOrderForPayment.id}/payment`);
        return;
      }

      setFeedback({
        type: "success",
        msg: `Pedido ${orderDisplayCode(primaryOrder)} criado com sucesso. A proposta será analisada pela equipa.`,
      });
      router.push("/orders");
    } catch (error: any) {
      setSubmitFeedback({ type: "error", msg: normalizeClientError(error, "Não conseguimos criar o pedido agora. Tenta novamente.").message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFieldStyle = (hasError = false) => ({
    borderColor: hasError ? "#F04438" : "#F2D4CC",
    background: hasError ? "#FFF5F5" : "#FFFDFC",
    color: "#1A1410",
  } as const);

  const applyCoupon = async () => {
    if (!token || !couponCode.trim()) return;
    if (localItems.length === 0 || total <= 0) {
      setCoupon(null);
      setCouponFeedback({ type: "info", msg: "Cupões para pedidos externos são validados quando a cotação tiver total final." });
      return;
    }
    setIsApplyingCoupon(true);
    setCouponFeedback({ type: "loading", msg: "A validar o cupão." });
    setFeedback(null);
    try {
      const payload = await fetchWithAuth<CouponValidation>("/api/coupons/validate", token, {
        method: "POST",
        body: JSON.stringify({
          code: couponCode.trim(),
          subtotal: total,
          appliesTo: "INTERNAL_PRODUCTS",
        }),
      });
      setCoupon(payload);
      setCouponCode(payload.code || couponCode.trim().toUpperCase());
      setCouponFeedback({ type: "success", msg: payload.message || "Cupão aplicado com sucesso." });
    } catch (error: any) {
      setCoupon(null);
      setCouponFeedback({ type: "error", msg: normalizeClientError(error, "Cupão inválido ou expirado.").message });
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setCoupon(null);
    setCouponCode("");
    setCouponFeedback({ type: "info", msg: "Cupão removido." });
  };

  return (
    <div className="min-h-screen">


      <div className="mx-auto grid max-w-7xl gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:px-8">
        <section className="space-y-4">
          <div className="rounded-[22px] border bg-white p-4 shadow-sm sm:rounded-[28px] sm:p-5" style={{ borderColor: "#F2D4CC" }}>
            <h1 className="text-xl font-black sm:text-2xl" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Finalizar compra</h1>
            <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>Confirma os teus dados e revê claramente o que fecha agora e o que segue como proposta internacional.</p>
          </div>

          {feedback ? <ClientFeedbackBanner message={feedback.msg} tone={feedback.type} /> : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-[22px] border bg-white p-4 shadow-sm sm:rounded-[28px] sm:p-5" style={{ borderColor: "#F2D4CC" }}>
              {isLoading ? (
                <div className="mb-5">
                  <ClientSectionSkeleton
                    title="A preparar o checkout"
                    message="Estamos a carregar carrinho, perfil e moradas antes de fechar a compra."
                    rows={2}
                  />
                </div>
              ) : null}
              {form.deliveryMethod === "DELIVERY" ? (
                <div className="mb-5 rounded-[20px] border p-4 sm:rounded-[24px]" style={{ borderColor: "#F2D4CC", background: "#FFF9F7" }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Morada de entrega</p>
                      <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>
                        {savedAddresses.length
                          ? "Escolhe uma morada guardada ou usa preenchimento manual."
                          : "Ainda não tens moradas guardadas. A primeira que preencheres pode ser salva no teu perfil."}
                      </p>
                    </div>
                    {savedAddresses.length ? (
                      <button
                        type="button"
                        onClick={() => setSelectedAddressId("manual")}
                        className="rounded-2xl border px-4 py-2 text-sm font-bold"
                        style={{ borderColor: "#F2D4CC", color: RED }}
                      >
                        Usar outra morada
                      </button>
                    ) : null}
                  </div>

                  {savedAddresses.length ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {savedAddresses.map((address) => {
                        const active = selectedAddressId === address.id;
                        return (
                          <button
                            key={address.id}
                            type="button"
                            onClick={() => setSelectedAddressId(address.id)}
                            className="min-w-0 rounded-[20px] border p-4 text-left transition sm:rounded-[22px]"
                            style={{
                              borderColor: active ? RED : "#F2D4CC",
                              background: active ? "#FFF0EC" : "#FFFFFF",
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{address.label}</span>
                              {address.defaultAddress ? (
                                <span className="rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: RED, color: "white" }}>
                                  Predefinida
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-sm leading-6" style={{ color: "#6B7280" }}>{address.fullAddress}</p>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="mb-2 block text-sm font-semibold">Nome completo</label><input required value={form.fullName} onChange={(e) => setForm((current) => ({ ...current, fullName: e.target.value }))} className={fieldClass} style={getFieldStyle()} /></div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">Telefone principal</label>
                  <input
                    required
                    ref={primaryPhoneRef}
                    value={form.primaryPhoneNumber}
                    onChange={(e) => setForm((current) => ({ ...current, primaryPhoneNumber: e.target.value }))}
                    onBlur={() => setPhoneTouched((current) => ({ ...current, primary: true }))}
                    className={fieldClass}
                    style={getFieldStyle(phoneTouched.primary && Boolean(primaryPhoneError))}
                    placeholder="+258849614486"
                  />
                  <p className="mt-2 text-xs" style={{ color: phoneTouched.primary && primaryPhoneError ? "#B42318" : "#6B7280" }}>
                    {phoneTouched.primary && primaryPhoneError ? primaryPhoneError : "Formato esperado: +2588xxxxxxxx"}
                  </p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">Telefone alternativo</label>
                  <input
                    ref={alternativePhoneRef}
                    value={form.alternativePhoneNumber}
                    onChange={(e) => setForm((current) => ({ ...current, alternativePhoneNumber: e.target.value }))}
                    onBlur={() => setPhoneTouched((current) => ({ ...current, alternative: true }))}
                    className={fieldClass}
                    style={getFieldStyle(phoneTouched.alternative && Boolean(alternativePhoneError))}
                    placeholder="+258841234567"
                  />
                  <p className="mt-2 text-xs" style={{ color: phoneTouched.alternative && alternativePhoneError ? "#B42318" : "#6B7280" }}>
                    {phoneTouched.alternative && alternativePhoneError ? alternativePhoneError : "Opcional, mas se preencher usa +2588xxxxxxxx"}
                  </p>
                </div>
                <div><label className="mb-2 block text-sm font-semibold">Email</label><input type="email" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} className={fieldClass} style={getFieldStyle()} /></div>
                <div><label className="mb-2 block text-sm font-semibold">Receber como</label><select value={form.deliveryMethod} onChange={(e) => setForm((current) => ({ ...current, deliveryMethod: e.target.value }))} className={fieldClass} style={getFieldStyle()}><option value="DELIVERY">Entrega ao domicílio</option><option value="STORE_PICKUP">Levantar na loja</option></select></div>
                <div><label className="mb-2 block text-sm font-semibold">Cidade</label><input value={form.city} onChange={(e) => setForm((current) => ({ ...current, city: e.target.value }))} className={fieldClass} style={getFieldStyle()} required={form.deliveryMethod === "DELIVERY"} /></div>
                <div><label className="mb-2 block text-sm font-semibold">Bairro</label><input value={form.neighborhood} onChange={(e) => setForm((current) => ({ ...current, neighborhood: e.target.value }))} className={fieldClass} style={getFieldStyle()} required={form.deliveryMethod === "DELIVERY"} /></div>
                <div><label className="mb-2 block text-sm font-semibold">Rua / Avenida</label><input value={form.street} onChange={(e) => setForm((current) => ({ ...current, street: e.target.value }))} className={fieldClass} style={getFieldStyle()} required={form.deliveryMethod === "DELIVERY"} /></div>
                <div><label className="mb-2 block text-sm font-semibold">Casa / Número</label><input value={form.houseNumber} onChange={(e) => setForm((current) => ({ ...current, houseNumber: e.target.value }))} className={fieldClass} style={getFieldStyle()} /></div>
              </div>
              <div className="mt-4 grid gap-4">
                <div><label className="mb-2 block text-sm font-semibold">Referência</label><textarea value={form.deliveryReference} onChange={(e) => setForm((current) => ({ ...current, deliveryReference: e.target.value }))} className={fieldClass} style={{ ...getFieldStyle(), minHeight: 96 }} required={form.deliveryMethod === "DELIVERY"} /></div>
                <div><label className="mb-2 block text-sm font-semibold">Google Maps</label><input value={form.googleMapsLink} onChange={(e) => setForm((current) => ({ ...current, googleMapsLink: e.target.value }))} className={fieldClass} style={getFieldStyle()} placeholder="https://maps.google.com/..." /></div>
                <div><label className="mb-2 block text-sm font-semibold">Notas</label><textarea value={form.customerNotes} onChange={(e) => setForm((current) => ({ ...current, customerNotes: e.target.value }))} className={fieldClass} style={{ ...getFieldStyle(), minHeight: 110 }} placeholder="Instruções para a entrega, horários ou observações." /></div>
                {form.deliveryMethod === "DELIVERY" ? (
                  <label className="inline-flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium" style={{ borderColor: "#F2D4CC", background: "#FFFDFC", color: "#1A1410" }}>
                    <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                    {savedAddresses.length === 0
                      ? "Guardar esta primeira morada no meu perfil para usar nas próximas compras"
                      : "Guardar esta morada no meu perfil"}
                  </label>
                ) : null}
                {form.deliveryMethod === "DELIVERY" && !isLoading && savedAddresses.length === 0 ? (
                  <div className="flex items-start gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: "#BAE6FD", background: "#F0F9FF" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0369A1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                    <p className="text-sm" style={{ color: "#0C4A6E" }}>
                      Guarda a morada agora e nas próximas compras o checkout fica pré-preenchido automaticamente.{" "}
                      <Link href="/profile#addresses" className="font-bold underline" style={{ color: "#0284C7" }}>
                        Gerir moradas no perfil
                      </Link>
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button type="submit" disabled={isSubmitting || isLoading || !checkoutItems.length} className="w-full rounded-2xl px-5 py-3.5 text-sm font-black text-white transition sm:w-auto" style={{ background: isSubmitting || isLoading || !checkoutItems.length ? "#FDB8A7" : RED, fontFamily: "'Sora', sans-serif" }}>
                {isSubmitting ? "A preparar pagamento..." : localItems.length > 0 ? "Confirmar e pagar" : "Criar proposta"}
              </button>
              <Link href="/cart" className="w-full rounded-2xl border px-5 py-3.5 text-center text-sm font-bold transition sm:w-auto" style={{ borderColor: "#F2D4CC", color: RED, background: "white" }}>Voltar ao carrinho</Link>
            </div>
            <ClientActionFeedback
              feedback={submitFeedback}
              onClose={() => setSubmitFeedback(null)}
              actionLabel={submitFeedback?.type === "error" && /sessão expirada|Inicia sessão/i.test(submitFeedback.msg) ? "Entrar novamente" : undefined}
              actionHref={submitFeedback?.type === "error" && /sessão expirada|Inicia sessão/i.test(submitFeedback.msg) ? "/login?redirect=%2Fcheckout" : undefined}
            />
          </form>
        </section>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-4 rounded-[22px] border bg-white p-4 shadow-sm sm:rounded-[28px] sm:p-5" style={{ borderColor: "#F2D4CC" }}>
            <h2 className="text-xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Resumo</h2>

            {isLoading ? (
              <ClientSectionSkeleton
                title="A montar o resumo"
                message="O total, os itens e a separação da compra composta aparecem já a seguir."
                rows={2}
              />
            ) : (
              <>
                <div className="space-y-3 rounded-2xl p-4" style={{ background: "#FFF8F5" }}>
                  <div className="flex items-center justify-between text-sm"><span style={{ color: "#6B7280" }}>Itens locais</span><strong style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{localItems.length}</strong></div>
                  <div className="flex items-center justify-between text-sm"><span style={{ color: "#6B7280" }}>Subtotal</span><strong style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{formatMoney(localSubtotal)}</strong></div>
                  <div className="flex items-start justify-between gap-3 text-sm"><span style={{ color: "#6B7280" }}>Entrega</span><strong className="text-right" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>A definir</strong></div>
                  {discountAmount > 0 ? (
                    <>
                      <div className="flex items-center justify-between text-sm"><span style={{ color: "#6B7280" }}>Total antes</span><strong style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{formatMoney(total)}</strong></div>
                      <div className="flex items-center justify-between text-sm"><span style={{ color: "#059669" }}>Desconto {coupon?.code}</span><strong style={{ color: "#059669", fontFamily: "'Sora', sans-serif" }}>-{formatMoney(discountAmount)}</strong></div>
                    </>
                  ) : null}
                  <div className="flex items-start justify-between gap-3 text-sm"><span style={{ color: RED }}>Total</span><strong className="text-right" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{formatMoney(totalAfterDiscount)}</strong></div>
                </div>

                <div className="rounded-2xl border p-4" style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}>
                  <label className="block text-sm font-semibold" style={{ color: "#1A1410" }}>Cupão</label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={couponCode}
                      onChange={(event) => {
                        setCouponCode(event.target.value.toUpperCase());
                        if (coupon) setCoupon(null);
                      }}
                      placeholder="Ex.: BEMVINDO10"
                      className="min-w-0 flex-1 rounded-2xl border px-4 py-3 text-sm outline-none"
                      style={{ borderColor: "#F2D4CC", color: "#1A1410" }}
                    />
                    {coupon?.valid ? (
                      <button type="button" onClick={removeCoupon} className="w-full rounded-2xl border px-4 py-3 text-sm font-bold sm:w-auto" style={{ borderColor: "#F2D4CC", color: RED }}>
                        Remover
                      </button>
                    ) : (
                      <button type="button" onClick={() => void applyCoupon()} disabled={isApplyingCoupon || !couponCode.trim() || isLoading} className="w-full rounded-2xl px-4 py-3 text-sm font-bold text-white sm:w-auto" style={{ background: isApplyingCoupon || !couponCode.trim() || isLoading ? "#FDB8A7" : RED }}>
                        {isApplyingCoupon ? "A aplicar..." : "Aplicar"}
                      </button>
                    )}
                  </div>
                  <ClientActionFeedback feedback={couponFeedback} onClose={() => setCouponFeedback(null)} />
                  {coupon?.valid ? <p className="mt-2 text-sm font-medium" style={{ color: "#059669" }}>{coupon.message || "Cupão aplicado."}</p> : null}
                  {externalItems.length > 0 && localItems.length === 0 ? <p className="mt-2 text-xs" style={{ color: "#9A3412" }}>Cupões para pedidos externos são aplicados na cotação quando houver total final.</p> : null}
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold" style={{ color: "#1A1410" }}>Produtos incluídos</p>
                  <div className="space-y-2">
                    {localItems.map((item: CartItem) => <div key={item.itemId} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-2xl px-3 py-2 text-sm" style={{ background: "#FFFDFC" }}><span className="min-w-0 break-words">{item.productName} x{item.quantity}</span><strong className="shrink-0 text-right" style={{ fontFamily: "'Sora', sans-serif" }}>{formatMoney(item.subTotal)}</strong></div>)}
                  </div>
                </div>

                {externalItems.length > 0 ? (
                  <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: "#FFF7ED", color: "#9A3412" }}>
                    <p className="font-semibold">Compra internacional em paralelo</p>
                    <p>{externalItems.length} item(ns) serão tratados numa proposta separada com preço final e prazo estimado. Esta etapa conclui apenas os produtos locais.</p>
                  </div>
                ) : null}

                <div className="rounded-2xl border px-4 py-4 text-sm" style={{ borderColor: "#F2D4CC", background: "#FFFDFC", color: "#6B7280" }}>
                  <p className="font-semibold" style={{ color: "#1A1410" }}>Depois de confirmar</p>
                  {localItems.length > 0 ? (
                    <>
                      <p className="mt-2">1. Criamos o teu pedido.</p>
                      <p className="mt-1">2. Vais direto para o pagamento.</p>
                      <p className="mt-1">3. Depois validamos e seguimos com a entrega.</p>
                    </>
                  ) : (
                    <>
                      <p className="mt-2">1. Criamos a tua proposta de compra internacional.</p>
                      <p className="mt-1">2. A equipa analisa preço, frete e prazo.</p>
                      <p className="mt-1">3. Depois recebes a cotação para aprovar.</p>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
