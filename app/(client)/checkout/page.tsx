"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClientActionFeedback, ClientFeedbackBanner, ClientSectionSkeleton } from "@/components/client-feedback-state";
import { GoogleMapsLocationField } from "@/components/google-maps-location-field";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { orderDisplayCode } from "@/lib/order-label";
import { normalizeClientError } from "@/lib/client-errors";
import type { Cart, CartItem, CheckoutResponse, CouponValidation, CustomerProfile, Order, UserAddress } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { addressMatchesForm, applySavedAddress, createAddressLabel, createPrefilledAddress, createPrefilledContact } from "@/lib/address-book";
import { sanitizeTextField, normalizePhone, normalizeEmail, sanitizeUrl } from "@/utils/input-normalizer";
import { cleanName, cleanCity, cleanAddress } from "@/utils/text-cleaner";
import { validateName, validatePhone, validatePhoneOptional, validateEmailOptional, validateCity, validateNeighborhood, validateStreet, validateMessage, validateUrl } from "@/utils/validators";
import { useFormValidation } from "@/hooks/useFormValidation";

const RED = "#E8431A";
const ORANGE = "#F97316";
const CHECKOUT_SELECTION_KEY = "shopeex-checkout-selection";

function Req() {
  return (
    <span aria-label="obrigatório" title="Campo obrigatório" style={{ color: ORANGE, marginLeft: 4, fontSize: "0.65rem", verticalAlign: "middle" }}>●</span>
  );
}
type CheckoutPaymentMethod = "PAYSUITE" | "CASH_ON_DELIVERY";

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

function normalizeNameForCheck(value?: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function digitsOnly(value?: string) {
  return (value || "").replace(/\D/g, "");
}

function isPlaceholderName(name?: string, phone?: string) {
  const normalized = normalizeNameForCheck(name);
  if (!normalized) return false;

  const digits = digitsOnly(normalized);
  const phoneDigits = digitsOnly(phone);
  if (normalized === "cliente") return true;
  if (/^cliente\s*\+?258\d{8,}$/.test(normalized)) return true;
  if (/^cliente\s*\d{8,}$/.test(normalized)) return true;
  if (digits.length >= 8) return true;
  return Boolean(phoneDigits && phoneDigits.length >= 8 && normalized.includes(phoneDigits.slice(-8)));
}

function isPaymentNameReady(name?: string, phone?: string) {
  const cleaned = cleanName(name || "");
  return Boolean(cleaned && !validateName(cleaned) && !isPlaceholderName(cleaned, phone));
}

function splitFullName(fullName: string) {
  const parts = cleanName(fullName).split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

function profileDisplayName(profile: CustomerProfile | null) {
  return [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim()
    || profile?.displayName
    || profile?.name
    || "";
}

function buildProfileNameUpdatePayload(profile: CustomerProfile, fullName: string) {
  const names = splitFullName(fullName);
  const name = [names.firstName, names.lastName].filter(Boolean).join(" ");

  return {
    name,
    firstName: names.firstName,
    lastName: names.lastName,
    email: profile.email || "",
    phoneNumber: profile.phoneNumber || "",
    alternativePhoneNumber: profile.alternativePhoneNumber || "",
    birthDate: profile.birthDate || null,
    gender: profile.gender || "",
    city: profile.city || "",
    deliveryCity: profile.deliveryCity || "",
    deliveryNeighborhood: profile.deliveryNeighborhood || "",
    deliveryStreet: profile.deliveryStreet || "",
    houseNumber: profile.houseNumber || "",
    deliveryReference: profile.deliveryReference || "",
    googleMapsLink: profile.googleMapsLink || "",
    preferredDeliveryMethod: profile.preferredDeliveryMethod || null,
    notifyOrderUpdates: profile.notifyOrderUpdates,
    notifyQuoteReady: profile.notifyQuoteReady,
    notifyPromotions: profile.notifyPromotions,
    notifySms: profile.notifySms,
  };
}


export default function CheckoutPage() {
  const router = useRouter();
  const { isReady, token, userEmail, refreshProfile } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
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
  const [isSavingProfileName, setIsSavingProfileName] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<CouponValidation | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>("PAYSUITE");
  const primaryPhoneRef = useRef<HTMLInputElement | null>(null);
  const alternativePhoneRef = useRef<HTMLInputElement | null>(null);

  const isDelivery = form.deliveryMethod === "DELIVERY";
  const checkoutRules = useMemo(() => ({
    fullName: validateName,
    primaryPhoneNumber: validatePhone,
    alternativePhoneNumber: validatePhoneOptional,
    email: validateEmailOptional,
    ...(isDelivery ? {
      city: validateCity,
      neighborhood: validateNeighborhood,
      street: validateStreet,
    } : {}),
    customerNotes: validateMessage,
    googleMapsLink: validateUrl,
  }), [isDelivery]);

  const fv = useFormValidation(form, checkoutRules);

  useEffect(() => {
    const loadCheckout = async () => {
      if (!isReady || !token) return;
      setIsLoading(true);
      try {
        const [payload, me, addresses] = await Promise.all([
          apiFetch<Cart>("cart/me"),
          apiFetch<CustomerProfile>("users/me"),
          apiFetch<UserAddress[]>("users/me/addresses"),
        ]);
        setCart(payload);
        setCustomerProfile(me);
        setSavedAddresses(addresses);

        const contact = createPrefilledContact(me);
        const safeContactName = isPlaceholderName(contact.fullName, contact.primaryPhoneNumber) ? "" : contact.fullName;
        const defaultAddress = addresses.find((addr: UserAddress) => addr.defaultAddress);
        const address = defaultAddress
          ? applySavedAddress(createPrefilledAddress(me), defaultAddress)
          : createPrefilledAddress(me);

        setForm((current) => ({
          ...current,
          ...contact,
          fullName: safeContactName,
          ...address,
        }));
        setSelectedAddressId(defaultAddress?.id ?? (addresses.length ? addresses[0].id : "manual"));
        setSaveAddress(addresses.length === 0);

        if (typeof window !== "undefined") {
          const rawSelection = window.sessionStorage.getItem(CHECKOUT_SELECTION_KEY);
          if (rawSelection) {
            const parsedSelection = JSON.parse(rawSelection) as unknown;
            if (Array.isArray(parsedSelection)) {
              const validSelection = (parsedSelection as unknown[])
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value) && payload.items.some((item: CartItem) => item.itemId === value));
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
  }, [isReady, token]);

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
  const primaryPhoneError = fv.errors.primaryPhoneNumber ?? null;
  const alternativePhoneError = fv.errors.alternativePhoneNumber ?? null;
  const profileNameWasPlaceholder = customerProfile
    ? isPlaceholderName(profileDisplayName(customerProfile), customerProfile.phoneNumber)
    : false;
  const paymentNameNeedsAttention = !isPaymentNameReady(form.fullName, form.primaryPhoneNumber);
  const phoneVerificationPending = customerProfile?.phoneVerified === false;
  const emailVerificationPending = customerProfile?.hasRealEmail === true && customerProfile?.emailVerified === false;
  const cashOnDeliveryEligible = isDelivery && localItems.length > 0 && externalItems.length === 0;

  useEffect(() => {
    if (!cashOnDeliveryEligible && paymentMethod === "CASH_ON_DELIVERY") {
      setPaymentMethod("PAYSUITE");
    }
  }, [cashOnDeliveryEligible, paymentMethod]);

  const saveProfileNameForPayment = async (fullName: string) => {
    if (!token || !customerProfile) {
      return null;
    }

    const cleanedFullName = cleanName(fullName);
    if (!isPaymentNameReady(cleanedFullName, form.primaryPhoneNumber)) {
      setSubmitFeedback({
        type: "error",
        msg: "Completa o teu nome real para continuar. Nao uses telefone ou nome temporario.",
      });
      requestAnimationFrame(() => document.getElementById("co-fullName")?.focus());
      return null;
    }

    const updatedProfile = await apiFetch<CustomerProfile>("users/me", {
      method: "PUT",
      token,
      body: JSON.stringify(buildProfileNameUpdatePayload(customerProfile, cleanedFullName)),
    });
    setCustomerProfile(updatedProfile);
    setForm((current) => ({ ...current, fullName: profileDisplayName(updatedProfile) || cleanedFullName }));
    await refreshProfile();
    return updatedProfile;
  };

  const handleSaveProfileName = async () => {
    if (isSavingProfileName) return;
    setIsSavingProfileName(true);
    setSubmitFeedback({ type: "loading", msg: "A guardar o teu nome no perfil." });
    try {
      const result = await saveProfileNameForPayment(form.fullName);
      if (result) {
        setSubmitFeedback({ type: "success", msg: "Nome guardado. Ja podes continuar para o pagamento." });
      }
    } catch (error: any) {
      setSubmitFeedback({
        type: "error",
        msg: normalizeClientError(error, "Nao foi possivel guardar o nome agora. Tenta novamente.").message,
      });
    } finally {
      setIsSavingProfileName(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;

    if (isPlaceholderName(form.fullName, form.primaryPhoneNumber)) {
      setSubmitFeedback({
        type: "error",
        msg: "Completa o teu nome real para continuar. Precisamos dele para processar o pedido e o pagamento.",
      });
      requestAnimationFrame(() => document.getElementById("co-fullName")?.focus());
      return;
    }

    const isValid = fv.validateAll();
    if (!isValid) {
      setSubmitFeedback({ type: "error", msg: "Revê os campos destacados antes de continuar." });
      setTimeout(() => fv.scrollToFirstError(), 0);
      return;
    }

    // Sanitize all text fields before sending
    const cleanedFullName = cleanName(form.fullName);
    if (!isPaymentNameReady(cleanedFullName, form.primaryPhoneNumber)) {
      setForm((current) => ({ ...current, fullName: cleanedFullName }));
      setSubmitFeedback({
        type: "error",
        msg: "Completa o teu nome real para continuar. Precisamos dele para processar o pedido e o pagamento.",
      });
      setTimeout(() => fv.scrollToFirstError(), 0);
      return;
    }

    const sanitized = {
      ...form,
      fullName: sanitizeTextField(cleanedFullName).value || cleanedFullName,
      email: userEmail ? normalizeEmail(userEmail) : "",
      primaryPhoneNumber: normalizePhone(form.primaryPhoneNumber),
      alternativePhoneNumber: form.alternativePhoneNumber.trim()
        ? normalizePhone(form.alternativePhoneNumber)
        : "",
      city: sanitizeTextField(form.city).value || form.city,
      neighborhood: sanitizeTextField(form.neighborhood).value || form.neighborhood,
      street: sanitizeTextField(form.street).value || form.street,
      houseNumber: sanitizeTextField(form.houseNumber).value || form.houseNumber,
      deliveryReference: sanitizeTextField(form.deliveryReference).value || form.deliveryReference,
      customerNotes: sanitizeTextField(form.customerNotes).value || form.customerNotes,
      googleMapsLink: sanitizeUrl(form.googleMapsLink) ?? "",
    };


    if (externalItems.length > 0) {
      setFeedback({
        type: "error",
        msg: "O carrinho finaliza apenas produtos da loja local. Remove o item de compra do estrangeiro e envia-o pelo fluxo Comprar do estrangeiro.",
      });
      return;
    }
    setIsSubmitting(true);
    setSubmitFeedback({ type: "loading", msg: "Estamos a validar os teus dados, criar o pedido e preparar o pagamento." });
    setFeedback(null);
    try {
      if (customerProfile && profileNameWasPlaceholder) {
        const updatedProfile = await saveProfileNameForPayment(sanitized.fullName);
        if (!updatedProfile) {
          setIsSubmitting(false);
          return;
        }
      }

      const checkoutResult = await apiFetch<CheckoutResponse | Order>("orders/from-cart", {
        method: "POST",
        body: JSON.stringify({
          ...sanitized,
          paymentMethod: paymentMethod === "CASH_ON_DELIVERY" && cashOnDeliveryEligible
            ? "CASH_ON_DELIVERY"
            : "PAYSUITE",
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
          await apiFetch<UserAddress>("users/me/addresses", {
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
        const choseCashOnDelivery = paymentMethod === "CASH_ON_DELIVERY" && cashOnDeliveryEligible;
        setFeedback({
          type: "success",
          msg: choseCashOnDelivery
            ? `Pedido ${orderDisplayCode(internalOrderForPayment)} reservado. Vais pagar na entrega.`
            : result.mixedCheckout && externalOrder
            ? `Pedido ${orderDisplayCode(localOrder ?? internalOrderForPayment)} criado. Vais seguir para o pagamento.`
            : `Pedido ${orderDisplayCode(internalOrderForPayment)} criado. A abrir pagamento...`,
        });
        router.push(choseCashOnDelivery ? "/orders" : `/orders/${internalOrderForPayment.id}/payment`);
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
      setCouponFeedback({ type: "info", msg: "Cupões são aplicados apenas aos produtos locais do carrinho." });
      return;
    }
    setIsApplyingCoupon(true);
    setCouponFeedback({ type: "loading", msg: "A validar o cupão." });
    setFeedback(null);
    try {
      const payload = await apiFetch<CouponValidation>("coupons/validate", {
        method: "POST",
        body: JSON.stringify({
          code: couponCode.trim(),
          selectedItemIds: localItems.map((item) => item.itemId),
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
            <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>Confirma os teus dados e revê os produtos locais antes de finalizar a compra.</p>
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

              {!isLoading && (profileNameWasPlaceholder || paymentNameNeedsAttention) ? (
                <div className="mb-5 rounded-[20px] border p-4 sm:rounded-[24px]" style={{ borderColor: "#F2D4CC", background: "#FFF9F7" }}>
                  <p className="text-sm font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
                    Completa o teu nome para continuar
                  </p>
                  <p className="mt-1 text-sm leading-6" style={{ color: "#6B7280" }}>
                    Precisamos do teu nome real para processar o pedido e o pagamento. Nao uses telefone nem o nome temporario da conta.
                  </p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      onClick={() => void handleSaveProfileName()}
                      disabled={isSavingProfileName || paymentNameNeedsAttention}
                      className="rounded-2xl px-4 py-2.5 text-sm font-black text-white"
                      style={{ background: isSavingProfileName || paymentNameNeedsAttention ? "#FDB8A7" : RED }}
                    >
                      {isSavingProfileName ? "A guardar..." : "Guardar nome e continuar"}
                    </button>
                    <Link
                      href="/complete-account/profile"
                      className="rounded-2xl border px-4 py-2.5 text-center text-sm font-black"
                      style={{ borderColor: "#F2D4CC", color: RED, background: "white" }}
                    >
                      Completar perfil
                    </Link>
                  </div>
                  {paymentNameNeedsAttention ? (
                    <p className="mt-3 text-xs font-semibold" style={{ color: "#6B7280" }}>
                      Preenche o campo Nome completo abaixo com nome e apelido para liberar o pagamento.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {!isLoading && (phoneVerificationPending || emailVerificationPending) ? (
                <div className="mb-5 grid gap-3 md:grid-cols-2">
                  {phoneVerificationPending ? (
                    <div className="rounded-[20px] border p-4" style={{ borderColor: "#F2D4CC", background: "#FFFFFF" }}>
                      <p className="text-sm font-black" style={{ color: "#1A1410" }}>Verifica o teu numero</p>
                      <p className="mt-1 text-sm leading-6" style={{ color: "#6B7280" }}>
                        A verificacao por WhatsApp estara disponivel em breve. Por agora, completa os dados principais da conta.
                      </p>
                      <button
                        type="button"
                        disabled
                        className="mt-3 rounded-2xl px-4 py-2 text-sm font-black text-white"
                        style={{ background: "#FDB8A7" }}
                      >
                        Disponivel em breve
                      </button>
                    </div>
                  ) : null}
                  {emailVerificationPending ? (
                    <div className="rounded-[20px] border p-4" style={{ borderColor: "#F2D4CC", background: "#FFFFFF" }}>
                      <p className="text-sm font-black" style={{ color: "#1A1410" }}>Verifica o teu email</p>
                      <p className="mt-1 text-sm leading-6" style={{ color: "#6B7280" }}>
                        A verificacao de email ficara disponivel em breve. Enquanto isso, confirma que o email no perfil esta correcto.
                      </p>
                      <Link
                        href="/profile"
                        className="mt-3 inline-flex rounded-2xl border px-4 py-2 text-sm font-black"
                        style={{ borderColor: "#F2D4CC", color: RED, background: "white" }}
                      >
                        Ver perfil
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Método de entrega — cards */}
              <div className="mb-5">
                <p className="mb-2 text-sm font-semibold" style={{ color: "#1A1410" }}>
                  Como queres receber?<Req />
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setForm((c) => ({ ...c, deliveryMethod: "DELIVERY" }))}
                    className="flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition"
                    style={{
                      borderColor: form.deliveryMethod === "DELIVERY" ? RED : "#F2D4CC",
                      background: form.deliveryMethod === "DELIVERY" ? "#FFF5F1" : "#FFFDFC",
                    }}
                  >
                    <span className="text-xl">🏠</span>
                    <strong className="mt-1 block text-sm" style={{ color: "#1A1410" }}>Entrega ao domicílio</strong>
                    <span className="text-xs leading-5" style={{ color: "#6B7280" }}>Receberes em casa. Preenches a morada abaixo.</span>
                    {form.deliveryMethod === "DELIVERY" ? (
                      <span className="mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-black text-white" style={{ background: RED }}>Selecionado</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((c) => ({ ...c, deliveryMethod: "STORE_PICKUP" }))}
                    className="flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition"
                    style={{
                      borderColor: form.deliveryMethod === "STORE_PICKUP" ? RED : "#F2D4CC",
                      background: form.deliveryMethod === "STORE_PICKUP" ? "#FFF5F1" : "#FFFDFC",
                    }}
                  >
                    <span className="text-xl">🏪</span>
                    <strong className="mt-1 block text-sm" style={{ color: "#1A1410" }}>Levantar na loja</strong>
                    <span className="text-xs leading-5" style={{ color: "#6B7280" }}>Vens buscar ao nosso espaço. Não precisas de morada.</span>
                    {form.deliveryMethod === "STORE_PICKUP" ? (
                      <span className="mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-black text-white" style={{ background: RED }}>Selecionado</span>
                    ) : null}
                  </button>
                </div>
              </div>

              <p className="mb-4 text-xs" style={{ color: "#6B7280" }}>
                <span style={{ color: ORANGE, fontWeight: 600 }}>●</span> Campo obrigatório
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Nome completo */}
                <div>
                  <label className="mb-2 block text-sm font-semibold" htmlFor="co-fullName">
                    Nome completo<Req />
                  </label>
                  <input
                    id="co-fullName"
                    required
                    value={form.fullName}
                    onChange={(e) => setForm((c) => ({ ...c, fullName: e.target.value }))}
                    onBlur={(e) => { fv.touch("fullName"); setForm((c) => ({ ...c, fullName: cleanName(e.target.value) })); }}
                    className={fieldClass}
                    placeholder="Ex: João Machava"
                    style={getFieldStyle(Boolean(fv.errors.fullName))}
                    aria-invalid={Boolean(fv.errors.fullName)}
                    aria-describedby="co-fullName-hint"
                    ref={fv.registerRef("fullName")}
                  />
                  <p id="co-fullName-hint" className="mt-1.5 text-xs" style={{ color: fv.errors.fullName ? "#B42318" : "#6B7280" }}>
                    {fv.errors.fullName ?? "Nome e apelido reais — como no bilhete de identidade."}
                  </p>
                </div>

                {/* Telefone principal */}
                <div>
                  <label className="mb-2 block text-sm font-semibold" htmlFor="co-phone1">
                    Telefone principal<Req />
                  </label>
                  <input
                    id="co-phone1"
                    required
                    ref={(el) => { primaryPhoneRef.current = el; fv.registerRef("primaryPhoneNumber")(el); }}
                    value={form.primaryPhoneNumber}
                    onChange={(e) => setForm((c) => ({ ...c, primaryPhoneNumber: e.target.value }))}
                    onBlur={() => fv.touch("primaryPhoneNumber")}
                    className={fieldClass}
                    style={getFieldStyle(Boolean(primaryPhoneError))}
                    placeholder="+258849614486"
                    aria-invalid={Boolean(primaryPhoneError)}
                    aria-describedby="co-phone1-hint"
                    inputMode="tel"
                  />
                  <p id="co-phone1-hint" className="mt-1.5 text-xs" style={{ color: primaryPhoneError ? "#B42318" : "#6B7280" }}>
                    {primaryPhoneError ?? "Número M-Pesa ou e-Mola — formato +2588xxxxxxxx."}
                  </p>
                </div>

                {/* Telefone alternativo */}
                <div>
                  <label className="mb-2 block text-sm font-semibold" htmlFor="co-phone2">Telefone alternativo</label>
                  <input
                    id="co-phone2"
                    ref={(el) => { alternativePhoneRef.current = el; fv.registerRef("alternativePhoneNumber")(el); }}
                    value={form.alternativePhoneNumber}
                    onChange={(e) => setForm((c) => ({ ...c, alternativePhoneNumber: e.target.value }))}
                    onBlur={() => fv.touch("alternativePhoneNumber")}
                    className={fieldClass}
                    style={getFieldStyle(Boolean(alternativePhoneError))}
                    placeholder="+258841234567"
                    aria-invalid={Boolean(alternativePhoneError)}
                    aria-describedby="co-phone2-hint"
                    inputMode="tel"
                  />
                  <p id="co-phone2-hint" className="mt-1.5 text-xs" style={{ color: alternativePhoneError ? "#B42318" : "#6B7280" }}>
                    {alternativePhoneError ?? "Opcional — segundo número para contacto em caso de falha."}
                  </p>
                </div>

                {/* Email */}
                <div>
                  <label className="mb-2 block text-sm font-semibold" htmlFor="co-email">Email</label>
                  <div
                    id="co-email"
                    className={`${fieldClass} flex items-center`}
                    style={{ borderColor: "#F2D4CC", background: "#F9FAFB", color: userEmail ? "#374151" : "#9CA3AF" }}
                    aria-readonly="true"
                  >
                    {userEmail || "Email não adicionado"}
                  </div>
                  <p className="mt-1.5 text-xs" style={{ color: "#6B7280" }}>
                    O email da conta. Para alterar, vai ao{" "}
                    <a href="/profile" className="underline" style={{ color: "#0284C7" }}>teu perfil</a>.
                  </p>
                </div>

                {/* Cidade */}
                {isDelivery ? (
                  <div>
                    <label className="mb-2 block text-sm font-semibold" htmlFor="co-city">
                      Cidade<Req />
                    </label>
                    <input
                      id="co-city"
                      value={form.city}
                      onChange={(e) => setForm((c) => ({ ...c, city: e.target.value }))}
                      onBlur={(e) => { fv.touch("city"); setForm((c) => ({ ...c, city: cleanCity(e.target.value) })); }}
                      className={fieldClass}
                      placeholder="Ex: Maputo"
                      style={getFieldStyle(Boolean(fv.errors.city))}
                      required={isDelivery}
                      aria-invalid={Boolean(fv.errors.city)}
                      aria-describedby="co-city-hint"
                      ref={fv.registerRef("city")}
                    />
                    <p id="co-city-hint" className="mt-1.5 text-xs" style={{ color: fv.errors.city ? "#B42318" : "#6B7280" }}>
                      {fv.errors.city ?? "Ex: Maputo, Matola, Beira, Nampula."}
                    </p>
                  </div>
                ) : <div />}

                {/* Bairro */}
                {isDelivery ? (
                  <div>
                    <label className="mb-2 block text-sm font-semibold" htmlFor="co-neighborhood">
                      Bairro<Req />
                    </label>
                    <input
                      id="co-neighborhood"
                      value={form.neighborhood}
                      onChange={(e) => setForm((c) => ({ ...c, neighborhood: e.target.value }))}
                      onBlur={(e) => { fv.touch("neighborhood"); setForm((c) => ({ ...c, neighborhood: cleanAddress(e.target.value) })); }}
                      className={fieldClass}
                      placeholder="Ex: Polana, Sommerschield"
                      style={getFieldStyle(Boolean(fv.errors.neighborhood))}
                      required={isDelivery}
                      aria-invalid={Boolean(fv.errors.neighborhood)}
                      aria-describedby="co-neighborhood-hint"
                      ref={fv.registerRef("neighborhood")}
                    />
                    <p id="co-neighborhood-hint" className="mt-1.5 text-xs" style={{ color: fv.errors.neighborhood ? "#B42318" : "#6B7280" }}>
                      {fv.errors.neighborhood ?? "Ex: Polana, Sommerschield, Alto-Maé, Hulene, Zimpeto."}
                    </p>
                  </div>
                ) : null}

                {/* Rua */}
                {isDelivery ? (
                  <div>
                    <label className="mb-2 block text-sm font-semibold" htmlFor="co-street">
                      Rua / Avenida<Req />
                    </label>
                    <input
                      id="co-street"
                      value={form.street}
                      onChange={(e) => setForm((c) => ({ ...c, street: e.target.value }))}
                      onBlur={(e) => { fv.touch("street"); setForm((c) => ({ ...c, street: cleanAddress(e.target.value) })); }}
                      className={fieldClass}
                      placeholder="Ex: Av. Julius Nyerere"
                      style={getFieldStyle(Boolean(fv.errors.street))}
                      required={isDelivery}
                      aria-invalid={Boolean(fv.errors.street)}
                      aria-describedby="co-street-hint"
                      ref={fv.registerRef("street")}
                    />
                    <p id="co-street-hint" className="mt-1.5 text-xs" style={{ color: fv.errors.street ? "#B42318" : "#6B7280" }}>
                      {fv.errors.street ?? "Ex: Av. Julius Nyerere, Rua dos Desportistas, Av. Eduardo Mondlane."}
                    </p>
                  </div>
                ) : null}

                {/* Casa / Número */}
                {isDelivery ? (
                  <div>
                    <label className="mb-2 block text-sm font-semibold" htmlFor="co-house">Casa / Número</label>
                    <input
                      id="co-house"
                      value={form.houseNumber}
                      onChange={(e) => setForm((c) => ({ ...c, houseNumber: e.target.value }))}
                      placeholder="Ex: 1234 ou Apto 3B"
                      className={fieldClass}
                      style={getFieldStyle()}
                    />
                    <p className="mt-1.5 text-xs" style={{ color: "#6B7280" }}>Opcional — número da porta, casa ou apartamento.</p>
                  </div>
                ) : null}
              </div>
              <div className="mt-4 grid gap-4">
                {isDelivery ? (
                  <div>
                    <label className="mb-2 block text-sm font-semibold" htmlFor="co-ref">
                      Ponto de referência<Req />
                    </label>
                    <textarea
                      id="co-ref"
                      value={form.deliveryReference}
                      onChange={(e) => setForm((c) => ({ ...c, deliveryReference: e.target.value }))}
                      className={fieldClass}
                      placeholder="Ex: em frente ao supermercado Shoprite, portão vermelho, prédio com grade preta..."
                      style={{ ...getFieldStyle(), minHeight: 96 }}
                      required={isDelivery}
                    />
                    <p className="mt-1.5 text-xs" style={{ color: "#6B7280" }}>
                      Descreve um marco próximo que ajude o estafeta a encontrar a tua casa — supermercado, escola, cor do portão, etc.
                    </p>
                  </div>
                ) : null}
                {isDelivery ? (
                  <div>
                    <GoogleMapsLocationField
                      id="co-maps"
                      label="Google Maps"
                      value={form.googleMapsLink}
                      onChange={(value) => setForm((c) => ({ ...c, googleMapsLink: value }))}
                      onBlur={() => fv.touch("googleMapsLink")}
                      inputClassName={fieldClass}
                      inputStyle={getFieldStyle(Boolean(fv.errors.googleMapsLink))}
                      error={fv.errors.googleMapsLink}
                      hint="Opcional — abre o Google Maps, pesquisa a tua casa e copia o link. Ajuda o estafeta a navegar com precisão."
                    />
                  </div>
                ) : null}
                {isDelivery ? (
                  <div>
                    <label className="mb-2 block text-sm font-semibold" htmlFor="co-notes">Notas para a entrega</label>
                    <textarea
                      id="co-notes"
                      value={form.customerNotes}
                      onChange={(e) => setForm((c) => ({ ...c, customerNotes: e.target.value }))}
                      onBlur={() => fv.touch("customerNotes")}
                      className={fieldClass}
                      style={{ ...getFieldStyle(Boolean(fv.errors.customerNotes)), minHeight: 110 }}
                      placeholder="Ex: disponível a partir das 14h, toca à campainha 2 vezes, ligar antes de chegar..."
                      ref={fv.registerRef("customerNotes")}
                    />
                    <p className="mt-1.5 text-xs" style={{ color: fv.errors.customerNotes ? "#B42318" : "#6B7280" }}>
                      {fv.errors.customerNotes ?? "Opcional — horários preferidos, instruções especiais ou qualquer detalhe útil para a entrega."}
                    </p>
                  </div>
                ) : null}
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

            <div className="rounded-[22px] border bg-white p-4 shadow-sm sm:rounded-[28px] sm:p-5" style={{ borderColor: "#F2D4CC" }}>
              <p className="text-sm font-black" style={{ color: "#1A1410" }}>Como queres pagar?</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm" style={{ borderColor: paymentMethod === "PAYSUITE" ? RED : "#F2D4CC", background: paymentMethod === "PAYSUITE" ? "#FFF5F1" : "#FFFDFC" }}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="PAYSUITE"
                    checked={paymentMethod === "PAYSUITE"}
                    onChange={() => setPaymentMethod("PAYSUITE")}
                    className="mt-1"
                  />
                  <span>
                    <strong className="block" style={{ color: "#1A1410" }}>Pagar agora</strong>
                    <span style={{ color: "#6B7280" }}>M-Pesa, e-Mola, Visa ou transferencia manual depois de criar o pedido.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm" style={{ borderColor: paymentMethod === "CASH_ON_DELIVERY" ? RED : "#F2D4CC", background: paymentMethod === "CASH_ON_DELIVERY" ? "#FFF5F1" : "#FFFDFC", opacity: cashOnDeliveryEligible ? 1 : 0.62 }}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="CASH_ON_DELIVERY"
                    checked={paymentMethod === "CASH_ON_DELIVERY"}
                    onChange={() => {
                      if (cashOnDeliveryEligible) setPaymentMethod("CASH_ON_DELIVERY");
                    }}
                    disabled={!cashOnDeliveryEligible}
                    className="mt-1"
                  />
                  <span>
                    <strong className="block" style={{ color: "#1A1410" }}>Pagar na entrega</strong>
                    <span style={{ color: "#6B7280" }}>Disponivel apenas para produtos locais com entrega ao domicilio.</span>
                  </span>
                </label>
              </div>
              <p className="mt-3 text-xs leading-5" style={{ color: "#9A3412" }}>
                Disponivel apenas para produtos locais ou encomendas aprovadas pela equipa. Para produtos internacionais, pode ser necessario sinal para reservar e comprar o produto; nesse caso paga um sinal agora e o restante na entrega.
              </p>
            </div>

            {/* ── Coupon ── */}
            <div className="rounded-[22px] border bg-white p-4 shadow-sm sm:rounded-[28px] sm:p-5" style={{ borderColor: "#F2D4CC" }}>
              <p className="text-sm font-black" style={{ color: "#1A1410" }}>Tem cupão?</p>
              <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>Aplica o teu código antes de finalizar para garantir o desconto.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={couponCode}
                  onChange={(event) => {
                    setCouponCode(event.target.value.toUpperCase());
                    if (coupon) setCoupon(null);
                  }}
                  placeholder="Código do cupão"
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
              {externalItems.length > 0 && localItems.length === 0 ? <p className="mt-2 text-xs" style={{ color: "#9A3412" }}>Este carrinho finaliza apenas produtos locais.</p> : null}
            </div>

            {/* ── Order total summary (before submit) ── */}
            {localItems.length > 0 ? (
              <div className="rounded-[22px] border bg-white p-4 shadow-sm sm:rounded-[28px] sm:p-5" style={{ borderColor: "#F2D4CC" }}>
                <p className="text-sm font-black" style={{ color: "#1A1410" }}>Resumo do pagamento</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span style={{ color: "#6B7280" }}>Subtotal</span>
                    <strong style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{formatMoney(localSubtotal)}</strong>
                  </div>
                  {discountAmount > 0 ? (
                    <div className="flex items-center justify-between">
                      <span style={{ color: "#059669" }}>Desconto ({coupon?.code})</span>
                      <strong style={{ color: "#059669", fontFamily: "'Sora', sans-serif" }}>-{formatMoney(discountAmount)}</strong>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: "#F2D4CC" }}>
                    <span className="font-semibold" style={{ color: RED }}>Total a pagar</span>
                    <strong className="text-base" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{formatMoney(totalAfterDiscount)}</strong>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button type="submit" disabled={isSubmitting || isLoading || !checkoutItems.length || paymentNameNeedsAttention} className="w-full rounded-2xl px-5 py-3.5 text-sm font-black text-white transition sm:w-auto" style={{ background: isSubmitting || isLoading || !checkoutItems.length || paymentNameNeedsAttention ? "#FDB8A7" : RED, fontFamily: "'Sora', sans-serif" }}>
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
                message="O total e os produtos locais selecionados aparecem já a seguir."
                rows={2}
              />
            ) : (
              <>
                <div className="space-y-3 rounded-2xl p-4" style={{ background: "#FFF8F5" }}>
                  <div className="flex items-center justify-between text-sm"><span style={{ color: "#6B7280" }}>Itens locais</span><strong style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{localItems.length}</strong></div>
                  <div className="flex items-center justify-between text-sm"><span style={{ color: "#6B7280" }}>Subtotal</span><strong style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{formatMoney(localSubtotal)}</strong></div>
                  {discountAmount > 0 ? (
                    <>
                      <div className="flex items-center justify-between text-sm"><span style={{ color: "#6B7280" }}>Total antes</span><strong style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{formatMoney(total)}</strong></div>
                      <div className="flex items-center justify-between text-sm"><span style={{ color: "#059669" }}>Desconto {coupon?.code}</span><strong style={{ color: "#059669", fontFamily: "'Sora', sans-serif" }}>-{formatMoney(discountAmount)}</strong></div>
                    </>
                  ) : null}
                  <div className="flex items-start justify-between gap-3 text-sm"><span style={{ color: RED }}>Total</span><strong className="text-right" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{formatMoney(totalAfterDiscount)}</strong></div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold" style={{ color: "#1A1410" }}>Produtos incluídos</p>
                  <div className="space-y-2">
                    {localItems.map((item: CartItem) => (
                      <div key={item.itemId} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-2xl px-3 py-2 text-sm" style={{ background: "#FFFDFC" }}>
                        <span className="min-w-0 break-words">
                          <span className="font-medium">{item.productName}</span>
                          {item.variantLabel && (
                            <span className="block text-xs mt-0.5" style={{ color: "#9A3412" }}>{item.variantLabel}</span>
                          )}
                          <span className="block text-xs mt-0.5" style={{ color: "#6B7280" }}>x{item.quantity} · {formatMoney(item.price)} /un</span>
                        </span>
                        <strong className="shrink-0 text-right" style={{ fontFamily: "'Sora', sans-serif" }}>{formatMoney(item.subTotal)}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                {externalItems.length > 0 ? (
                  <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: "#FFF7ED", color: "#9A3412" }}>
                    <p className="font-semibold">Produto de compra do estrangeiro no carrinho</p>
                    <p>Remove esse item do carrinho e usa Comprar do estrangeiro para enviares o link ou descrição.</p>
                  </div>
                ) : null}

                <div className="rounded-2xl border px-4 py-4 text-sm" style={{ borderColor: "#F2D4CC", background: "#FFFDFC", color: "#6B7280" }}>
                  <p className="font-semibold" style={{ color: "#1A1410" }}>Depois de confirmar</p>
                  {localItems.length > 0 ? (
                    <>
                      <p className="mt-2">1. Criamos o teu pedido.</p>
                      <p className="mt-1">2. Vais direto para o pagamento.</p>
                      <p className="mt-1">3. Depois validamos e seguimos com a entrega.</p>
                      <p className="mt-3 font-semibold" style={{ color: "#15803D" }}>Em breve poderás acompanhar este pedido pelo WhatsApp.</p>
                      <p className="mt-1 text-xs">Por agora, acompanha o estado na área Meus pedidos.</p>
                    </>
                  ) : (
                    <>
                      <p className="mt-2">1. Remove o item internacional deste carrinho.</p>
                      <p className="mt-1">2. Usa Comprar do estrangeiro para enviar o link ou descrição.</p>
                      <p className="mt-1">3. A equipa prepara a cotação no fluxo correto.</p>
                      <p className="mt-3 font-semibold" style={{ color: "#15803D" }}>Em breve poderás acompanhar este pedido pelo WhatsApp.</p>
                      <p className="mt-1 text-xs">Por agora, acompanha o estado na área Meus pedidos.</p>
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
