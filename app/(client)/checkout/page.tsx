"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClientFeedbackBanner, ClientSectionSkeleton } from "@/components/client-feedback-state";
import { formatMoney } from "@/lib/format";
import { orderDisplayCode } from "@/lib/order-label";
import type { Cart, CartItem, CheckoutResponse, CustomerProfile, Order, UserAddress } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { addressMatchesForm, applySavedAddress, createAddressLabel, createPrefilledAddress, createPrefilledContact } from "@/lib/address-book";

const RED = "#E8431A";
const DELIVERY_FEE = 150;
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
  return isValidPhone(trimmed) ? "" : "Numero invalido. Usa o formato +2588xxxxxxxx.";
}

function isCheckoutResponse(payload: CheckoutResponse | Order | null): payload is CheckoutResponse {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    "primaryOrder" in payload &&
    "mixedCheckout" in payload
  );
}

async function fetchWithAuth<T>(url: string, _token: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  if (response.status === 204) return null as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || payload?.error || "Nao foi possivel concluir a operacao.");
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState({ primary: false, alternative: false });

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
        setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel carregar o checkout." });
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
  const estimatedDelivery = form.deliveryMethod === "DELIVERY" && localSubtotal > 0 ? DELIVERY_FEE : 0;
  const total = localSubtotal + estimatedDelivery;
  const primaryPhoneError = getPhoneError(form.primaryPhoneNumber, true);
  const alternativePhoneError = getPhoneError(form.alternativePhoneNumber, false);
  const hasPhoneErrors = Boolean(primaryPhoneError || alternativePhoneError);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    if (hasPhoneErrors) {
      setPhoneTouched({ primary: true, alternative: true });
      setFeedback({ type: "error", msg: "Corrige os numeros de telefone antes de finalizar." });
      return;
    }
    setIsSubmitting(true);
    setFeedback({ type: "loading", msg: "Estamos a validar os teus dados, criar o pedido e fechar esta compra com seguranca." });
    try {
      const checkoutResult = await fetchWithAuth<CheckoutResponse | Order>("/api/xdigital/orders/from-cart", token, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          primaryPhoneNumber: form.primaryPhoneNumber.trim(),
          alternativePhoneNumber: form.alternativePhoneNumber.trim(),
          selectedItemIds: checkoutItems.map((item) => item.itemId),
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
          // nao bloqueia a compra se falhar ao guardar a morada
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

      setFeedback({
        type: "success",
        msg: result.mixedCheckout && externalOrder
          ? `Pedido local ${orderDisplayCode(localOrder ?? primaryOrder)} criado. A compra internacional ${orderDisplayCode(externalOrder)} sera tratada numa proposta separada.`
          : `Pedido ${orderDisplayCode(primaryOrder)} criado com sucesso!`,
      });
      router.push("/orders");
    } catch (error) {
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel criar o pedido." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFieldStyle = (hasError = false) => ({
    borderColor: hasError ? "#F04438" : "#F2D4CC",
    background: hasError ? "#FFF5F5" : "#FFFDFC",
    color: "#1A1410",
  } as const);

  return (
    <div className="min-h-screen">


      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
        <section className="space-y-4">
          <div className="rounded-[28px] border bg-white p-5 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
            <h1 className="text-2xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Finalizar compra</h1>
            <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>Confirma os teus dados e revê claramente o que fecha agora e o que segue como proposta internacional.</p>
          </div>

          {feedback ? <ClientFeedbackBanner message={feedback.msg} tone={feedback.type} /> : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-[28px] border bg-white p-5 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
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
                <div className="mb-5 rounded-[24px] border p-4" style={{ borderColor: "#F2D4CC", background: "#FFF9F7" }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Morada de entrega</p>
                      <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>
                        {savedAddresses.length
                          ? "Escolhe uma morada guardada ou usa preenchimento manual."
                          : "Ainda nao tens moradas guardadas. A primeira que preencheres pode ser salva no teu perfil."}
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
                            className="rounded-[22px] border p-4 text-left transition"
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
                <div><label className="mb-2 block text-sm font-semibold">Receber como</label><select value={form.deliveryMethod} onChange={(e) => setForm((current) => ({ ...current, deliveryMethod: e.target.value }))} className={fieldClass} style={getFieldStyle()}><option value="DELIVERY">Entrega ao domicilio</option><option value="STORE_PICKUP">Levantar na loja</option></select></div>
                <div><label className="mb-2 block text-sm font-semibold">Cidade</label><input value={form.city} onChange={(e) => setForm((current) => ({ ...current, city: e.target.value }))} className={fieldClass} style={getFieldStyle()} required={form.deliveryMethod === "DELIVERY"} /></div>
                <div><label className="mb-2 block text-sm font-semibold">Bairro</label><input value={form.neighborhood} onChange={(e) => setForm((current) => ({ ...current, neighborhood: e.target.value }))} className={fieldClass} style={getFieldStyle()} required={form.deliveryMethod === "DELIVERY"} /></div>
                <div><label className="mb-2 block text-sm font-semibold">Rua / Avenida</label><input value={form.street} onChange={(e) => setForm((current) => ({ ...current, street: e.target.value }))} className={fieldClass} style={getFieldStyle()} required={form.deliveryMethod === "DELIVERY"} /></div>
                <div><label className="mb-2 block text-sm font-semibold">Casa / Numero</label><input value={form.houseNumber} onChange={(e) => setForm((current) => ({ ...current, houseNumber: e.target.value }))} className={fieldClass} style={getFieldStyle()} /></div>
              </div>
              <div className="mt-4 grid gap-4">
                <div><label className="mb-2 block text-sm font-semibold">Referencia</label><textarea value={form.deliveryReference} onChange={(e) => setForm((current) => ({ ...current, deliveryReference: e.target.value }))} className={fieldClass} style={{ ...getFieldStyle(), minHeight: 96 }} required={form.deliveryMethod === "DELIVERY"} /></div>
                <div><label className="mb-2 block text-sm font-semibold">Google Maps</label><input value={form.googleMapsLink} onChange={(e) => setForm((current) => ({ ...current, googleMapsLink: e.target.value }))} className={fieldClass} style={getFieldStyle()} placeholder="https://maps.google.com/..." /></div>
                <div><label className="mb-2 block text-sm font-semibold">Notas</label><textarea value={form.customerNotes} onChange={(e) => setForm((current) => ({ ...current, customerNotes: e.target.value }))} className={fieldClass} style={{ ...getFieldStyle(), minHeight: 110 }} placeholder="Instrucoes para a entrega, horarios ou observacoes." /></div>
                {form.deliveryMethod === "DELIVERY" ? (
                  <label className="inline-flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium" style={{ borderColor: "#F2D4CC", background: "#FFFDFC", color: "#1A1410" }}>
                    <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                    {savedAddresses.length === 0
                      ? "Guardar esta primeira morada no meu perfil para usar nas proximas compras"
                      : "Guardar esta morada no meu perfil"}
                  </label>
                ) : null}
                {form.deliveryMethod === "DELIVERY" && !isLoading && savedAddresses.length === 0 ? (
                  <div className="flex items-start gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: "#BAE6FD", background: "#F0F9FF" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0369A1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                    <p className="text-sm" style={{ color: "#0C4A6E" }}>
                      Guarda a morada agora e nas proximas compras o checkout fica pre-preenchido automaticamente.{" "}
                      <Link href="/profile#addresses" className="font-bold underline" style={{ color: "#0284C7" }}>
                        Gerir moradas no perfil
                      </Link>
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={isSubmitting || isLoading || !checkoutItems.length} className="rounded-2xl px-5 py-3.5 text-sm font-black text-white transition" style={{ background: isSubmitting || isLoading || !checkoutItems.length ? "#FDB8A7" : RED, fontFamily: "'Sora', sans-serif" }}>{isSubmitting ? "A finalizar..." : externalItems.length > 0 && localItems.length > 0 ? "Criar compra composta" : "Criar pedido"}</button>
              <Link href="/cart" className="rounded-2xl border px-5 py-3.5 text-sm font-bold transition" style={{ borderColor: "#F2D4CC", color: RED, background: "white" }}>Voltar ao carrinho</Link>
            </div>
          </form>
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-4 rounded-[28px] border bg-white p-5 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
            <h2 className="text-xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Resumo</h2>

            {isLoading ? (
              <ClientSectionSkeleton
                title="A montar o resumo"
                message="O total, os itens e a separacao da compra composta aparecem ja a seguir."
                rows={2}
              />
            ) : (
              <>
                <div className="space-y-3 rounded-2xl p-4" style={{ background: "#FFF8F5" }}>
                  <div className="flex items-center justify-between text-sm"><span style={{ color: "#6B7280" }}>Itens locais</span><strong style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{localItems.length}</strong></div>
                  <div className="flex items-center justify-between text-sm"><span style={{ color: "#6B7280" }}>Subtotal</span><strong style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{formatMoney(localSubtotal)}</strong></div>
                  <div className="flex items-center justify-between text-sm"><span style={{ color: "#6B7280" }}>Entrega</span><strong style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{form.deliveryMethod === "DELIVERY" ? formatMoney(estimatedDelivery) : "—"}</strong></div>
                  <div className="flex items-center justify-between text-sm"><span style={{ color: RED }}>Total</span><strong style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{formatMoney(total)}</strong></div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold" style={{ color: "#1A1410" }}>Produtos incluidos</p>
                  <div className="space-y-2">
                    {localItems.map((item: CartItem) => <div key={item.itemId} className="flex items-center justify-between rounded-2xl px-3 py-2 text-sm" style={{ background: "#FFFDFC" }}><span className="truncate pr-3">{item.productName} x{item.quantity}</span><strong style={{ fontFamily: "'Sora', sans-serif" }}>{formatMoney(item.subTotal)}</strong></div>)}
                  </div>
                </div>

                <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: "#FFF7ED", color: "#9A3412" }}>
                  <p className="font-semibold">Compra internacional em paralelo</p>
                  <p>{externalItems.length} item(ns) serao tratados numa proposta separada com preco final e prazo estimado. Esta etapa conclui apenas os produtos locais.</p>
                </div>

                <div className="rounded-2xl border px-4 py-4 text-sm" style={{ borderColor: "#F2D4CC", background: "#FFFDFC", color: "#6B7280" }}>
                  <p className="font-semibold" style={{ color: "#1A1410" }}>Depois de confirmar</p>
                  <p className="mt-2">1. O pedido local sera criado agora.</p>
                  <p className="mt-1">2. A compra internacional vai aparecer no teu painel como proposta em analise.</p>
                  <p className="mt-1">3. Recebes tudo no mesmo painel, cada parte com o seu proximo passo.</p>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
