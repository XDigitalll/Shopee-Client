"use client";

import Image, { type ImageLoaderProps } from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/components/auth-provider";
import { ClientConfirmDialog, ClientFeedbackDock } from "@/components/client-feedback-state";
import { GoogleMapsLocationField } from "@/components/google-maps-location-field";
import type { CustomerProfile, OrderStats, UserAddress, VerificationDispatchResponse } from "@/lib/types";
import { normalizePhone, normalizeEmail } from "@/utils/input-normalizer";
import { cleanName, cleanCity, cleanAddress, cleanMessage } from "@/utils/text-cleaner";
import { validateName, validatePhoneOptional, validateEmailOptional, validateCity, validateNeighborhood, validateStreet, validateUrl } from "@/utils/validators";

const RED = "#E8431A";
const RED_DARK = "#C13210";
const RED_SOFT = "#FFF0EC";
const DANGER_SOFT = "#FCEBEB";
const GREEN = "#2E8B57";
const TEXT = "#1A1410";
const MUTED = "#6B7280";

const STEP_LABELS: Record<string, string> = {
  password: "Definir senha",
  name: "Nome completo",
  email: "Email real",
  phone: "Telefone valido",
};

const passthroughImageLoader = ({ src }: ImageLoaderProps) => src;

const inputStyle: CSSProperties = {
  borderColor: "#F2D4CC",
  background: "#FFFBFA",
  color: TEXT,
};

const inputDisabledStyle: CSSProperties = {
  borderColor: "#EDE0DC",
  background: "#F5F0EE",
  color: "#8B97A8",
  cursor: "not-allowed",
};

type SectionKey = "personal" | "addresses" | "notifications" | "security";

type PersonalForm = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  birthDate: string;
  gender: string;
  city: string;
};

type AddressForm = {
  id?: number;
  label: string;
  city: string;
  neighborhood: string;
  street: string;
  houseNumber: string;
  reference: string;
  googleMapsLink: string;
  defaultAddress: boolean;
};

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.3 21a2 2 0 0 0 3.4 0" />
      <path d="M4 17h16" />
      <path d="M6 17V11a6 6 0 1 1 12 0v6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function OrdersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function CameraAvatar({
  initials,
  name,
  avatarUrl,
  uploading,
  onTrigger,
}: {
  initials: string;
  name: string;
  avatarUrl?: string;
  uploading?: boolean;
  onTrigger: () => void;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative h-24 w-24">
      {avatarUrl && !failed ? (
        <Image
          loader={passthroughImageLoader}
          unoptimized
          src={avatarUrl}
          alt={name}
          fill
          sizes="96px"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="rounded-full border-4 object-cover shadow-sm"
          style={{ borderColor: "#FFE5DD", background: "#FFFFFF" }}
        />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 text-3xl font-black text-white shadow-sm" style={{ borderColor: "#FFE5DD", background: RED, fontFamily: "'Sora', sans-serif" }}>
          {initials}
        </div>
      )}
      <button
        type="button"
        onClick={onTrigger}
        disabled={uploading}
        className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 text-white shadow-sm transition hover:opacity-80 disabled:opacity-50"
        style={{ borderColor: "#FFF8F5", background: RED_DARK }}
        aria-label="Alterar foto de perfil"
        title="Clique para alterar a foto"
      >
        {uploading ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <PencilIcon />
        )}
      </button>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  const isLong = value.length > 8;
  return (
    <div className="rounded-2xl border p-3 min-w-0" style={{ borderColor: "#F3D5CC", background: "#FFF9F7" }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] leading-tight" style={{ color: "#94A3B8" }}>{label}</p>
      <p
        className={`mt-1.5 font-black leading-tight break-all ${isLong ? "text-sm" : "text-lg"}`}
        style={{ color: TEXT, fontFamily: "'Sora', sans-serif" }}
      >
        {value}
      </p>
    </div>
  );
}

function SidebarButton({
  active,
  icon,
  label,
  badge,
  danger = false,
  onClick,
}: {
  active?: boolean;
  icon: ReactNode;
  label: string;
  badge?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  const color = danger ? RED_DARK : active ? RED_DARK : MUTED;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition"
      style={{ background: active ? RED_SOFT : "transparent", color }}
    >
      <span className="flex items-center gap-3 text-sm font-bold">
        <span>{icon}</span>
        <span>{label}</span>
      </span>
      {badge ? (
        <span className="rounded-full px-2 py-0.5 text-[11px] font-black" style={{ background: active ? "#FFD9CF" : "#FFF3EF", color: RED_DARK }}>
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function Field({
  label,
  disabled,
  full = false,
  children,
}: {
  label: string;
  disabled?: boolean;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`grid gap-2 ${full ? "md:col-span-2" : ""}`}>
      <span className="text-sm font-bold" style={{ color: TEXT }}>{label}</span>
      <div className={disabled ? "opacity-80" : ""}>{children}</div>
    </label>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="relative inline-flex h-8 w-14 items-center rounded-full transition"
      style={{ background: checked ? RED : "#E5E7EB" }}
    >
      <span
        className="inline-block h-6 w-6 rounded-full bg-white shadow transition"
        style={{ transform: checked ? "translateX(30px)" : "translateX(4px)" }}
      />
    </button>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "MZN",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatMonthYear(value?: string) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("pt-PT", {
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDate(value?: string) {
  if (!value) return "Ainda nao definido";
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function splitName(profile: CustomerProfile | null, userLabel: string) {
  const firstName = profile?.firstName || "";
  const lastName = profile?.lastName || "";
  if (firstName || lastName) {
    return { firstName, lastName };
  }

  const parts = (profile?.displayName || profile?.name || userLabel || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

const emptyAddressForm: AddressForm = {
  label: "",
  city: "",
  neighborhood: "",
  street: "",
  houseNumber: "",
  reference: "",
  googleMapsLink: "",
  defaultAddress: false,
};

export default function ProfilePage() {
  const router = useRouter();
  const { token, userLabel, userEmail, userInitials, userAvatarUrl, authSource, logout, refreshProfile } = useAuth();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [active, setActive] = useState<SectionKey>("personal");
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [isSavingPersonal, setIsSavingPersonal] = useState(false);
  const [isXdigitalEmail, setIsXdigitalEmail] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressForm>(emptyAddressForm);
  const [savingAddress, setSavingAddress] = useState(false);
  const [feedback, setFeedback] = useState<string>("");
  const [dangerFeedback, setDangerFeedback] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [verifySent, setVerifySent] = useState(false);
  const [verifyChannel, setVerifyChannel] = useState<"EMAIL" | "PHONE" | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifySending, setVerifySending] = useState(false);
  const [verifyConfirming, setVerifyConfirming] = useState(false);
  const [verifyDestination, setVerifyDestination] = useState("");
  const [verifyCooldown, setVerifyCooldown] = useState(0);
  const [confirmDeleteAddressId, setConfirmDeleteAddressId] = useState<number | null>(null);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [personalErrors, setPersonalErrors] = useState<Partial<Record<keyof PersonalForm, string>>>({});
  const [personalTouched, setPersonalTouched] = useState<Partial<Record<keyof PersonalForm, boolean>>>({});
  const [addressErrors, setAddressErrors] = useState<Partial<Record<string, string>>>({});
  const [addressTouched, setAddressTouched] = useState<Partial<Record<string, boolean>>>({});

  const personalRef = useRef<HTMLElement | null>(null);
  const addressesRef = useRef<HTMLElement | null>(null);
  const notificationsRef = useRef<HTMLElement | null>(null);
  const securityRef = useRef<HTMLElement | null>(null);

  const [personalForm, setPersonalForm] = useState<PersonalForm>({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    birthDate: "",
    gender: "",
    city: "",
  });

  useEffect(() => {
    const loadAll = async () => {
      if (!token) return;
      try {
        const me = await apiFetch<CustomerProfile>("users/me", { token });

        setProfile(me);
        setVerifyDestination(me.verificationDestinationMasked || me.verificationDestination || me.email || "");

        const xdigital = me.email?.endsWith("@xdigital.local") ?? false;
        setIsXdigitalEmail(xdigital);

        const names = splitName(me, userLabel);
        setPersonalForm({
          firstName: names.firstName,
          lastName: names.lastName,
          email: xdigital ? "" : (me.email || userEmail || ""),
          phoneNumber: me.phoneNumber || "",
          birthDate: me.birthDate || "",
          gender: me.gender || "",
          city: me.city || "",
        });

        const [orderStats, savedAddresses] = await Promise.allSettled([
          apiFetch<OrderStats>("orders/my-stats", { token }),
          apiFetch<UserAddress[]>("users/me/addresses", { token }),
        ]);

        if (orderStats.status === "fulfilled") {
          setStats(orderStats.value);
        }

        if (savedAddresses.status === "fulfilled") {
          setAddresses(savedAddresses.value);
        }
      } catch (error) {
        setDangerFeedback(error instanceof Error ? error.message : "Nao foi possivel carregar o perfil.");
      }
    };

    void loadAll();
  }, [token, userEmail, userLabel]);

  useEffect(() => {
    if (verifyCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setVerifyCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [verifyCooldown]);

  const fullName = useMemo(() => {
    const names = [personalForm.firstName, personalForm.lastName].filter(Boolean).join(" ").trim();
    return names || profile?.displayName || userLabel || "Cliente";
  }, [personalForm.firstName, personalForm.lastName, profile?.displayName, userLabel]);

  const goToSection = (section: SectionKey) => {
    setActive(section);
    const target = {
      personal: personalRef,
      addresses: addressesRef,
      notifications: notificationsRef,
      security: securityRef,
    }[section];

    target.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const validatePersonalForm = (): Partial<Record<keyof PersonalForm, string>> => {
    const errors: Partial<Record<keyof PersonalForm, string>> = {};
    const firstErr = validateName(personalForm.firstName);
    if (firstErr) errors.firstName = firstErr;
    const lastErr = validateName(personalForm.lastName);
    if (lastErr) errors.lastName = lastErr;
    if (isXdigitalEmail && personalForm.email) {
      const emailErr = validateEmailOptional(personalForm.email);
      if (emailErr) errors.email = emailErr;
    }
    const normalised = personalForm.phoneNumber.trim() ? normalizePhone(personalForm.phoneNumber) : "";
    const phoneErr = validatePhoneOptional(normalised);
    if (phoneErr) errors.phoneNumber = phoneErr;
    if (personalForm.city) {
      const cityErr = validateCity(personalForm.city);
      if (cityErr) errors.city = cityErr;
    }
    return errors;
  };

  const validateAddressForm = (): Partial<Record<string, string>> => {
    const errors: Partial<Record<string, string>> = {};
    if (!addressForm.label.trim()) errors.label = "Nome da morada é obrigatório.";
    const cityErr = validateCity(addressForm.city);
    if (cityErr) errors.city = cityErr;
    const nbErr = validateNeighborhood(addressForm.neighborhood);
    if (nbErr) errors.neighborhood = nbErr;
    const streetErr = validateStreet(addressForm.street);
    if (streetErr) errors.street = streetErr;
    if (addressForm.googleMapsLink) {
      const urlErr = validateUrl(addressForm.googleMapsLink);
      if (urlErr) errors.googleMapsLink = urlErr;
    }
    return errors;
  };

  const scrollToFirstPersonalError = (errors: Partial<Record<string, string>>) => {
    const fields = ["firstName", "lastName", "email", "phoneNumber", "city"];
    for (const field of fields) {
      if (errors[field]) {
        const el = document.getElementById(`personal-${field}`);
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
        break;
      }
    }
  };

  const scrollToFirstAddressError = (errors: Partial<Record<string, string>>) => {
    const fields = ["label", "city", "neighborhood", "street", "googleMapsLink"];
    for (const field of fields) {
      if (errors[field]) {
        const el = document.getElementById(`addr-${field}`);
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
        break;
      }
    }
  };

  const handleSavePersonal = async () => {
    if (!token) return;

    const allTouched: Partial<Record<keyof PersonalForm, boolean>> = {
      firstName: true, lastName: true, email: true, phoneNumber: true, city: true,
    };
    setPersonalTouched(allTouched);
    const errors = validatePersonalForm();
    setPersonalErrors(errors);
    if (Object.keys(errors).length > 0) {
      scrollToFirstPersonalError(errors);
      return;
    }

    setIsSavingPersonal(true);
    setFeedback("");
    setDangerFeedback("");

    try {
      const cleanFirst = cleanName(personalForm.firstName);
      const cleanLast = cleanName(personalForm.lastName);
      const cleanPhone = personalForm.phoneNumber.trim() ? normalizePhone(personalForm.phoneNumber) : "";
      const cleanCityVal = personalForm.city ? cleanCity(personalForm.city) : "";
      const trimmedEmail = personalForm.email.trim() ? normalizeEmail(personalForm.email) : "";

      const payload = await apiFetch<CustomerProfile>("users/me", {
        method: "PUT",
        token,
        body: JSON.stringify({
          firstName: cleanFirst,
          lastName: cleanLast,
          name: [cleanFirst, cleanLast].filter(Boolean).join(" "),
          phoneNumber: cleanPhone || null,
          birthDate: personalForm.birthDate || null,
          gender: personalForm.gender || null,
          city: cleanCityVal || null,
          ...(isXdigitalEmail && trimmedEmail ? { email: trimmedEmail } : {}),
        }),
      });

      const nowXdigital = payload.email?.endsWith("@xdigital.local") ?? false;
      setIsXdigitalEmail(nowXdigital);
      setProfile(payload);
      setPersonalForm((current) => ({
        ...current,
        email: nowXdigital ? "" : (payload.email || current.email),
      }));
      setVerifyDestination(payload.verificationDestinationMasked || payload.verificationDestination || payload.email || "");
      await refreshProfile();
      setIsEditingPersonal(false);
      setPersonalErrors({});
      setPersonalTouched({});
      setFeedback("Dados pessoais atualizados com sucesso.");
    } catch (error) {
      setDangerFeedback(error instanceof Error ? error.message : "Nao foi possivel guardar os dados pessoais.");
    } finally {
      setIsSavingPersonal(false);
    }
  };

  const handleNotificationToggle = async (field: "notifyOrderUpdates" | "notifyQuoteReady" | "notifyPromotions" | "notifySms") => {
    if (!token || !profile) return;

    const nextProfile = { ...profile, [field]: !profile[field] };
    setProfile(nextProfile);

    try {
      const payload = await apiFetch<CustomerProfile>("users/me/notifications", {
        method: "PUT",
        token,
        body: JSON.stringify({
          notifyOrderUpdates: nextProfile.notifyOrderUpdates,
          notifyQuoteReady: nextProfile.notifyQuoteReady,
          notifyPromotions: nextProfile.notifyPromotions,
          notifySms: nextProfile.notifySms,
        }),
      });
      setProfile(payload);
    } catch (error) {
      setProfile(profile);
      setDangerFeedback(error instanceof Error ? error.message : "Nao foi possivel atualizar as notificacoes.");
    }
  };

  const handleSubmitAddress = async () => {
    if (!token) return;

    const allTouched: Partial<Record<string, boolean>> = {
      label: true, city: true, neighborhood: true, street: true, googleMapsLink: true,
    };
    setAddressTouched(allTouched);
    const errors = validateAddressForm();
    setAddressErrors(errors);
    if (Object.keys(errors).length > 0) {
      scrollToFirstAddressError(errors);
      return;
    }

    setSavingAddress(true);
    setFeedback("");
    setDangerFeedback("");

    try {
      const path = addressForm.id ? `users/me/addresses/${addressForm.id}` : "users/me/addresses";
      const method = addressForm.id ? "PUT" : "POST";
      await apiFetch<UserAddress>(path, {
        method,
        token,
        body: JSON.stringify({
          ...addressForm,
          city: cleanCity(addressForm.city),
          neighborhood: cleanAddress(addressForm.neighborhood),
          street: cleanAddress(addressForm.street),
          reference: addressForm.reference ? cleanMessage(addressForm.reference) : "",
        }),
      });

      const savedAddresses = await apiFetch<UserAddress[]>("users/me/addresses", { token });
      const updatedProfile = await apiFetch<CustomerProfile>("users/me", { token });
      setAddresses(savedAddresses);
      setProfile(updatedProfile);
      setVerifyDestination(updatedProfile.verificationDestinationMasked || updatedProfile.verificationDestination || updatedProfile.email || "");
      await refreshProfile();
      setAddressForm(emptyAddressForm);
      setAddressErrors({});
      setAddressTouched({});
      setAddressFormOpen(false);
      setFeedback(addressForm.id ? "Morada atualizada com sucesso." : "Nova morada adicionada com sucesso.");
    } catch (error) {
      setDangerFeedback(error instanceof Error ? error.message : "Nao foi possivel guardar a morada.");
    } finally {
      setSavingAddress(false);
    }
  };

  const handleEditAddress = (address: UserAddress) => {
    setAddressForm({
      id: address.id,
      label: address.label,
      city: address.city,
      neighborhood: address.neighborhood,
      street: address.street,
      houseNumber: address.houseNumber || "",
      reference: address.reference,
      googleMapsLink: address.googleMapsLink || "",
      defaultAddress: address.defaultAddress,
    });
    setAddressFormOpen(true);
    goToSection("addresses");
  };

  const handleDeleteAddress = async (id: number) => {
    if (!token) return;
    try {
      await apiFetch<void>(`users/me/addresses/${id}`, {
        method: "DELETE",
        token,
      });
      const savedAddresses = await apiFetch<UserAddress[]>("users/me/addresses", { token });
      const updatedProfile = await apiFetch<CustomerProfile>("users/me", { token });
      setAddresses(savedAddresses);
      setProfile(updatedProfile);
      setVerifyDestination(updatedProfile.verificationDestinationMasked || updatedProfile.verificationDestination || updatedProfile.email || "");
      await refreshProfile();
      setFeedback("Morada removida com sucesso.");
    } catch (error) {
      setDangerFeedback(error instanceof Error ? error.message : "Nao foi possivel remover a morada.");
    }
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await apiFetch<void>("auth/logout", {
          method: "POST",
          token,
        });
      } catch {
        // local logout fallback
      }
    }
    logout();
  };

  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token) return;
    setIsUploadingAvatar(true);
    setFeedback("");
    setDangerFeedback("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/xdigital/users/me/avatar", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null) as Record<string, unknown> | null;
        throw new Error(typeof err?.message === "string" ? err.message : "Nao foi possivel atualizar a foto.");
      }
      const updated = await response.json() as CustomerProfile;
      setProfile(updated);
      setVerifyDestination(updated.verificationDestinationMasked || updated.verificationDestination || updated.email || "");
      await refreshProfile();
      setFeedback("Foto de perfil atualizada com sucesso.");
    } catch (error) {
      setDangerFeedback(error instanceof Error ? error.message : "Nao foi possivel atualizar a foto.");
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCancelPersonal = () => {
    if (!profile) { setIsEditingPersonal(false); return; }
    const names = splitName(profile, userLabel);
    const xdigital = profile.email?.endsWith("@xdigital.local") ?? false;
    setPersonalForm({
      firstName: names.firstName,
      lastName: names.lastName,
      email: xdigital ? "" : (profile.email || userEmail || ""),
      phoneNumber: profile.phoneNumber || "",
      birthDate: profile.birthDate || "",
      gender: profile.gender || "",
      city: profile.city || "",
    });
    setPersonalErrors({});
    setPersonalTouched({});
    setIsEditingPersonal(false);
  };

  const handleSendVerifyCode = async (channel: "EMAIL" | "PHONE" = "EMAIL") => {
    if (!token) return;
    setVerifySending(true);
    setFeedback("");
    setDangerFeedback("");
    try {
      const path = channel === "PHONE"
        ? "users/me/phone-verification/request"
        : "users/me/email-verification/request";
      const dispatch = await apiFetch<VerificationDispatchResponse>(path, { method: "POST", token });
      setVerifySent(true);
      setVerifyChannel(channel);
      setVerifyCode("");
      setVerifyCooldown(60);
      setVerifyDestination(dispatch.destinationMasked || profile?.verificationDestinationMasked || profile?.email || userEmail || "");
      setFeedback(dispatch.message || `Codigo enviado para ${dispatch.destinationMasked || (channel === "PHONE" ? "o teu telefone" : "o teu email")}.`);
    } catch (error) {
      setDangerFeedback(error instanceof Error ? error.message : "Nao foi possivel enviar o codigo.");
    } finally {
      setVerifySending(false);
    }
  };

  const handleConfirmVerifyCode = async () => {
    if (!token || !verifyCode.trim()) return;
    setVerifyConfirming(true);
    setFeedback("");
    setDangerFeedback("");
    try {
      const path = verifyChannel === "PHONE"
        ? "users/me/phone-verification/confirm"
        : "users/me/email-verification/confirm";
      const updated = await apiFetch<CustomerProfile>(path, {
        method: "POST",
        token,
        body: JSON.stringify({ code: verifyCode.trim() }),
      });
      setProfile(updated);
      setVerifyDestination(updated.verificationDestinationMasked || updated.verificationDestination || updated.email || "");
      await refreshProfile();
      setVerifySent(false);
      setVerifyChannel(null);
      setVerifyCode("");
      setFeedback(verifyChannel === "PHONE" ? "Telefone verificado com sucesso!" : "Email verificado com sucesso!");
    } catch (error) {
      setDangerFeedback(error instanceof Error ? error.message : "Codigo incorreto ou expirado.");
    } finally {
      setVerifyConfirming(false);
    }
  };

  const initials = profile?.initials || userInitials;
  const accountPct = profile?.accountCompletionPercentage ?? 0;
  const isAccountActive = accountPct === 100;
  const isVerified = profile?.securityVerificationLevel === "VERIFIED";
  const verifiedBadge = isAccountActive
    ? (isVerified ? "Conta verificada" : "Conta ativa")
    : `Perfil ${accountPct}% completo`;

  return (
    <div className="space-y-5">
      <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-5">
          <section className="rounded-[28px] border bg-white p-5 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
            <div className="flex flex-col items-center text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
              <CameraAvatar
                key={profile?.avatarUrl || userAvatarUrl || "avatar"}
                initials={initials}
                name={fullName}
                avatarUrl={profile?.avatarUrl || userAvatarUrl}
                uploading={isUploadingAvatar}
                onTrigger={() => fileInputRef.current?.click()}
              />
              <h1 className="mt-4 max-w-full break-words text-2xl font-black" style={{ color: TEXT, fontFamily: "'Sora', sans-serif" }}>{fullName}</h1>
              {!isXdigitalEmail && (
                <p className="mt-1 max-w-full break-all text-sm" style={{ color: MUTED }}>{profile?.email || userEmail}</p>
              )}
              <span className="mt-3 inline-flex rounded-full px-3 py-1 text-xs font-black" style={{ background: isAccountActive ? "#ECFDF5" : "#FFF7E8", color: isAccountActive ? GREEN : "#A16207" }}>
                {verifiedBadge}
              </span>
            </div>

            {profile && accountPct < 100 && (
              <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: "#F3D5CC", background: "#FFF9F7" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: MUTED }}>Conta completa</span>
                  <span className="text-sm font-black" style={{ color: accountPct === 100 ? GREEN : RED }}>
                    {accountPct}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "#F2D4CC" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${accountPct}%`, background: accountPct === 100 ? GREEN : RED }}
                  />
                </div>
                {(profile.accountMissingSteps?.length ?? 0) > 0 && (
                  <ul className="mt-3 space-y-1">
                    {profile.accountMissingSteps?.map((step) => (
                      <li key={step} className="flex items-start gap-2 text-xs" style={{ color: MUTED }}>
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: RED }} />
                        {STEP_LABELS[step] ?? step}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2 overflow-hidden">
              <StatMini label="Total de pedidos" value={String(stats?.totalOrders ?? 0)} />
              <StatMini label="Em andamento" value={String(stats?.inProgress ?? 0)} />
              <StatMini label="MZN gastos" value={formatCurrency(stats?.totalSpent ?? 0)} />
              <StatMini label="Membro desde" value={formatMonthYear(profile?.memberSince)} />
            </div>
          </section>

          <section className="rounded-[28px] border bg-white p-3 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
            <SidebarButton active={active === "personal"} icon={<ProfileIcon />} label="Dados pessoais" onClick={() => goToSection("personal")} />
            <SidebarButton active={active === "addresses"} icon={<LocationIcon />} label="Moradas" onClick={() => goToSection("addresses")} />
            <SidebarButton active={active === "notifications"} icon={<BellIcon />} label="Notificacoes" onClick={() => goToSection("notifications")} />
            <SidebarButton active={active === "security"} icon={<ShieldIcon />} label="Seguranca" onClick={() => goToSection("security")} />
            <SidebarButton icon={<OrdersIcon />} label="Os meus pedidos" onClick={() => router.push("/orders")} />
            <SidebarButton danger icon={<LogoutIcon />} label="Terminar sessao" onClick={() => setConfirmLogoutOpen(true)} />
          </section>
        </aside>

        <main className="min-w-0 space-y-6">
          {profile && accountPct < 100 && (
            <section className="rounded-[28px] border p-6 shadow-sm" style={{ borderColor: "#F2D4CC", background: "linear-gradient(135deg, #FFF0EC 0%, #FFFBFA 100%)" }}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-black text-white" style={{ background: RED }}>!</span>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: RED }}>Conta quase pronta</p>
                  </div>
                  <h2 className="mt-2 text-xl font-black" style={{ color: TEXT, fontFamily: "'Sora', sans-serif" }}>
                    Completa a tua conta
                  </h2>
                  <p className="mt-1.5 max-w-md text-sm leading-6" style={{ color: MUTED }}>
                    Faltam alguns dados essenciais. Preenche o nome, email real e telefone valido para activar a conta completamente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setIsEditingPersonal(true); goToSection("personal"); }}
                  className="shrink-0 rounded-2xl px-5 py-3 text-sm font-black text-white transition hover:opacity-90"
                  style={{ background: RED }}
                >
                  Completar agora →
                </button>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: MUTED }}>
                    Perfil {profile.accountCompletionPercentage ?? 0}% completo
                  </span>
                  <span className="text-sm font-black" style={{ color: RED }}>
                    {profile.accountCompletionPercentage ?? 0}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full" style={{ background: "#F2D4CC" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${profile.accountCompletionPercentage ?? 0}%`, background: RED }}
                  />
                </div>
              </div>

              {(profile.accountMissingSteps?.length ?? 0) > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold" style={{ color: MUTED }}>Falta:</span>
                  {profile.accountMissingSteps?.map((step) => (
                    <span
                      key={step}
                      className="rounded-full px-3 py-1 text-xs font-bold"
                      style={{ background: "#FFE5DD", color: RED_DARK }}
                    >
                      {STEP_LABELS[step] ?? step}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {profile && accountPct === 100 && (
            <section className="rounded-[28px] border p-4 shadow-sm" style={{ borderColor: "#D1FAE5", background: "#ECFDF5" }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "#D1FAE5" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-black" style={{ color: GREEN }}>Conta pronta</p>
                    <p className="text-xs" style={{ color: "#065F46" }}>Todos os dados essenciais preenchidos.</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: isVerified ? "#D1FAE5" : "#E0F2FE", color: isVerified ? "#065F46" : "#0369A1" }}>
                  {isVerified ? "Verificado" : "Verificacao: basica"}
                </span>
              </div>
            </section>
          )}

          {profile && !profile.hasDeliveryAddress && (
            <section className="rounded-[28px] border p-5 shadow-sm" style={{ borderColor: "#BAE6FD", background: "#F0F9FF" }}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "#BAE6FD", color: "#0369A1" }}>
                    <LocationIcon />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-black" style={{ color: "#0369A1" }}>Adiciona uma morada de entrega</p>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "#E0F2FE", color: "#0369A1" }}>
                        Opcional, mas recomendado
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed" style={{ color: "#0C4A6E" }}>
                      Assim conseguimos preparar entregas mais rapido quando o teu pedido estiver pronto.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => goToSection("addresses")}
                  className="shrink-0 rounded-2xl px-4 py-2.5 text-sm font-black text-white transition hover:opacity-90"
                  style={{ background: "#0284C7" }}
                >
                  Adicionar morada
                </button>
              </div>
            </section>
          )}

          <section ref={personalRef} className="rounded-[28px] border bg-white p-6 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold" style={{ color: RED }}>Dados pessoais</p>
                <h2 className="mt-1 text-2xl font-black" style={{ color: TEXT, fontFamily: "'Sora', sans-serif" }}>Informacoes da conta</h2>
              </div>
              <div className="flex gap-2">
                {isEditingPersonal && (
                  <button
                    type="button"
                    onClick={handleCancelPersonal}
                    disabled={isSavingPersonal}
                    className="rounded-2xl border px-4 py-2.5 text-sm font-bold transition hover:bg-gray-50 disabled:opacity-50"
                    style={{ borderColor: "#D1D5DB", color: MUTED }}
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (isEditingPersonal ? void handleSavePersonal() : setIsEditingPersonal(true))}
                  disabled={isSavingPersonal}
                  className="rounded-2xl px-4 py-2.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-60"
                  style={{ background: RED }}
                >
                  {isSavingPersonal ? "A guardar..." : isEditingPersonal ? "Guardar" : "Editar"}
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field label="Nome" disabled={!isEditingPersonal}>
                <input
                  id="personal-firstName"
                  value={personalForm.firstName}
                  onChange={(event) => setPersonalForm((current) => ({ ...current, firstName: event.target.value }))}
                  onBlur={() => {
                    setPersonalTouched((t) => ({ ...t, firstName: true }));
                    if (isEditingPersonal) setPersonalForm((c) => ({ ...c, firstName: cleanName(c.firstName) }));
                  }}
                  disabled={!isEditingPersonal}
                  aria-invalid={!!(personalErrors.firstName && personalTouched.firstName)}
                  aria-describedby={personalErrors.firstName && personalTouched.firstName ? "personal-firstName-error" : undefined}
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
                  style={isEditingPersonal
                    ? { ...inputStyle, borderColor: personalErrors.firstName && personalTouched.firstName ? RED : "#F2D4CC" }
                    : inputDisabledStyle}
                />
                {personalErrors.firstName && personalTouched.firstName && (
                  <p id="personal-firstName-error" className="mt-1 text-xs font-medium" style={{ color: RED }}>{personalErrors.firstName}</p>
                )}
              </Field>
              <Field label="Apelido" disabled={!isEditingPersonal}>
                <input
                  id="personal-lastName"
                  value={personalForm.lastName}
                  onChange={(event) => setPersonalForm((current) => ({ ...current, lastName: event.target.value }))}
                  onBlur={() => {
                    setPersonalTouched((t) => ({ ...t, lastName: true }));
                    if (isEditingPersonal) setPersonalForm((c) => ({ ...c, lastName: cleanName(c.lastName) }));
                  }}
                  disabled={!isEditingPersonal}
                  aria-invalid={!!(personalErrors.lastName && personalTouched.lastName)}
                  aria-describedby={personalErrors.lastName && personalTouched.lastName ? "personal-lastName-error" : undefined}
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
                  style={isEditingPersonal
                    ? { ...inputStyle, borderColor: personalErrors.lastName && personalTouched.lastName ? RED : "#F2D4CC" }
                    : inputDisabledStyle}
                />
                {personalErrors.lastName && personalTouched.lastName && (
                  <p id="personal-lastName-error" className="mt-1 text-xs font-medium" style={{ color: RED }}>{personalErrors.lastName}</p>
                )}
              </Field>
              <Field label={isXdigitalEmail && isEditingPersonal ? "Email real" : "Email"} disabled={!isXdigitalEmail || !isEditingPersonal}>
                <div className="relative">
                  {isXdigitalEmail && isEditingPersonal ? (
                    <>
                      <input
                        id="personal-email"
                        type="email"
                        inputMode="email"
                        value={personalForm.email}
                        onChange={(event) => setPersonalForm((current) => ({ ...current, email: event.target.value }))}
                        onBlur={() => setPersonalTouched((t) => ({ ...t, email: true }))}
                        placeholder="o-teu@email.com"
                        aria-invalid={!!(personalErrors.email && personalTouched.email)}
                        aria-describedby={personalErrors.email && personalTouched.email ? "personal-email-error" : undefined}
                        className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
                        style={{ ...inputStyle, borderColor: personalErrors.email && personalTouched.email ? RED : "#F2D4CC" }}
                      />
                      {personalErrors.email && personalTouched.email && (
                        <p id="personal-email-error" className="mt-1 text-xs font-medium" style={{ color: RED }}>{personalErrors.email}</p>
                      )}
                      <p className="mt-1.5 text-xs" style={{ color: MUTED }}>
                        A tua conta foi criada via telefone. Adiciona um email real para receber confirmacoes.
                      </p>
                    </>
                  ) : isXdigitalEmail ? (
                    <button
                      type="button"
                      onClick={() => { setIsEditingPersonal(true); }}
                      className="flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm transition hover:opacity-80"
                      style={{ borderColor: "#FCA5A5", background: "#FFF5F5", color: RED_DARK }}
                    >
                      <span className="font-medium">Email ainda nao configurado</span>
                      <span className="rounded-full px-2.5 py-0.5 text-[11px] font-black" style={{ background: RED, color: "white" }}>Adicionar</span>
                    </button>
                  ) : (
                    <div className="relative">
                      <input
                        value={personalForm.email}
                        disabled
                        className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                        style={inputDisabledStyle}
                      />
                      {(profile?.authProvider === "GOOGLE" || authSource === "GOOGLE") && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white px-2 py-0.5 text-[10px] font-black" style={{ color: "#4285F4", border: "1px solid #E8E8E8" }}>Google</span>
                      )}
                    </div>
                  )}
                </div>
              </Field>
              <Field label="Telefone" disabled={!isEditingPersonal}>
                <input
                  id="personal-phoneNumber"
                  type="tel"
                  inputMode="tel"
                  value={personalForm.phoneNumber}
                  onChange={(event) => setPersonalForm((current) => ({ ...current, phoneNumber: event.target.value }))}
                  onBlur={() => setPersonalTouched((t) => ({ ...t, phoneNumber: true }))}
                  disabled={!isEditingPersonal}
                  placeholder="+258 8X XXX XXXX"
                  aria-invalid={!!(personalErrors.phoneNumber && personalTouched.phoneNumber)}
                  aria-describedby={personalErrors.phoneNumber && personalTouched.phoneNumber ? "personal-phoneNumber-error" : undefined}
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
                  style={isEditingPersonal
                    ? { ...inputStyle, borderColor: personalErrors.phoneNumber && personalTouched.phoneNumber ? RED : "#F2D4CC" }
                    : inputDisabledStyle}
                />
                {personalErrors.phoneNumber && personalTouched.phoneNumber && (
                  <p id="personal-phoneNumber-error" className="mt-1 text-xs font-medium" style={{ color: RED }}>{personalErrors.phoneNumber}</p>
                )}
              </Field>
              <Field label="Data de nascimento" disabled={!isEditingPersonal}>
                <input
                  type="date"
                  value={personalForm.birthDate}
                  onChange={(event) => setPersonalForm((current) => ({ ...current, birthDate: event.target.value }))}
                  disabled={!isEditingPersonal}
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
                  style={isEditingPersonal ? inputStyle : inputDisabledStyle}
                />
              </Field>
              <Field label="Genero" disabled={!isEditingPersonal}>
                <select
                  value={personalForm.gender}
                  onChange={(event) => setPersonalForm((current) => ({ ...current, gender: event.target.value }))}
                  disabled={!isEditingPersonal}
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
                  style={isEditingPersonal ? inputStyle : inputDisabledStyle}
                >
                  <option value="">Selecionar</option>
                  <option value="MASCULINO">Masculino</option>
                  <option value="FEMININO">Feminino</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </Field>
              <Field label="Cidade" disabled={!isEditingPersonal} full>
                <input
                  id="personal-city"
                  value={personalForm.city}
                  onChange={(event) => setPersonalForm((current) => ({ ...current, city: event.target.value }))}
                  onBlur={() => {
                    setPersonalTouched((t) => ({ ...t, city: true }));
                    if (isEditingPersonal) setPersonalForm((c) => ({ ...c, city: cleanCity(c.city) }));
                  }}
                  disabled={!isEditingPersonal}
                  placeholder="Ex: Maputo"
                  aria-invalid={!!(personalErrors.city && personalTouched.city)}
                  aria-describedby={personalErrors.city && personalTouched.city ? "personal-city-error" : undefined}
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
                  style={isEditingPersonal
                    ? { ...inputStyle, borderColor: personalErrors.city && personalTouched.city ? RED : "#F2D4CC" }
                    : inputDisabledStyle}
                />
                {personalErrors.city && personalTouched.city && (
                  <p id="personal-city-error" className="mt-1 text-xs font-medium" style={{ color: RED }}>{personalErrors.city}</p>
                )}
              </Field>
            </div>
          </section>

          <section ref={addressesRef} className="rounded-[28px] border bg-white p-6 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold" style={{ color: RED }}>Moradas</p>
                <h2 className="mt-1 text-2xl font-black" style={{ color: TEXT, fontFamily: "'Sora', sans-serif" }}>Moradas guardadas</h2>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {addresses.map((address) => (
                <article
                  key={address.id}
                  className="rounded-[24px] border p-5"
                  style={{
                    borderColor: address.defaultAddress ? RED : "#F2D4CC",
                    background: address.defaultAddress ? RED_SOFT : "#FFFFFF",
                  }}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: address.defaultAddress ? "#FFD9CF" : "#FFF3EF", color: RED_DARK }}>
                        <LocationIcon />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="min-w-0 break-words text-lg font-black" style={{ color: TEXT, fontFamily: "'Sora', sans-serif" }}>{address.label}</h3>
                          {address.defaultAddress ? (
                            <span className="rounded-full px-3 py-1 text-[11px] font-black" style={{ background: RED, color: "white" }}>
                              Predefinida
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 break-words text-sm leading-6" style={{ color: MUTED }}>{address.fullAddress}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-3">
                      <button type="button" onClick={() => handleEditAddress(address)} className="rounded-2xl border px-4 py-2 text-sm font-bold" style={{ borderColor: "#F2D4CC", color: RED_DARK }}>
                        Editar
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteAddressId(address.id)} className="rounded-2xl px-4 py-2 text-sm font-bold" style={{ background: DANGER_SOFT, color: RED_DARK }}>
                        Remover
                      </button>
                    </div>
                  </div>
                </article>
              ))}

              <button
                type="button"
                onClick={() => {
                  setAddressForm(emptyAddressForm);
                  setAddressFormOpen((current) => !current);
                }}
                className="rounded-[24px] border-2 border-dashed px-5 py-5 text-left text-sm font-bold transition hover:bg-[#FFF8F5]"
                style={{ borderColor: "#F2D4CC", color: RED_DARK }}
              >
                + Adicionar nova morada
              </button>
            </div>

            {addressFormOpen ? (
              <div className="mt-6 rounded-[24px] border bg-[#FFFDFC] p-5" style={{ borderColor: "#F2D4CC" }}>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Nome da morada">
                    <input
                      id="addr-label"
                      value={addressForm.label}
                      onChange={(event) => setAddressForm((current) => ({ ...current, label: event.target.value }))}
                      onBlur={() => setAddressTouched((t) => ({ ...t, label: true }))}
                      aria-invalid={!!(addressErrors.label && addressTouched.label)}
                      aria-describedby={addressErrors.label && addressTouched.label ? "addr-label-error" : undefined}
                      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                      style={{ ...inputStyle, borderColor: addressErrors.label && addressTouched.label ? RED : "#F2D4CC" }}
                    />
                    {addressErrors.label && addressTouched.label && (
                      <p id="addr-label-error" className="mt-1 text-xs font-medium" style={{ color: RED }}>{addressErrors.label}</p>
                    )}
                  </Field>
                  <Field label="Cidade">
                    <input
                      id="addr-city"
                      value={addressForm.city}
                      onChange={(event) => setAddressForm((current) => ({ ...current, city: event.target.value }))}
                      onBlur={() => {
                        setAddressTouched((t) => ({ ...t, city: true }));
                        setAddressForm((c) => ({ ...c, city: cleanCity(c.city) }));
                      }}
                      aria-invalid={!!(addressErrors.city && addressTouched.city)}
                      aria-describedby={addressErrors.city && addressTouched.city ? "addr-city-error" : undefined}
                      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                      style={{ ...inputStyle, borderColor: addressErrors.city && addressTouched.city ? RED : "#F2D4CC" }}
                    />
                    {addressErrors.city && addressTouched.city && (
                      <p id="addr-city-error" className="mt-1 text-xs font-medium" style={{ color: RED }}>{addressErrors.city}</p>
                    )}
                  </Field>
                  <Field label="Bairro">
                    <input
                      id="addr-neighborhood"
                      value={addressForm.neighborhood}
                      onChange={(event) => setAddressForm((current) => ({ ...current, neighborhood: event.target.value }))}
                      onBlur={() => {
                        setAddressTouched((t) => ({ ...t, neighborhood: true }));
                        setAddressForm((c) => ({ ...c, neighborhood: cleanAddress(c.neighborhood) }));
                      }}
                      aria-invalid={!!(addressErrors.neighborhood && addressTouched.neighborhood)}
                      aria-describedby={addressErrors.neighborhood && addressTouched.neighborhood ? "addr-neighborhood-error" : undefined}
                      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                      style={{ ...inputStyle, borderColor: addressErrors.neighborhood && addressTouched.neighborhood ? RED : "#F2D4CC" }}
                    />
                    {addressErrors.neighborhood && addressTouched.neighborhood && (
                      <p id="addr-neighborhood-error" className="mt-1 text-xs font-medium" style={{ color: RED }}>{addressErrors.neighborhood}</p>
                    )}
                  </Field>
                  <Field label="Rua">
                    <input
                      id="addr-street"
                      value={addressForm.street}
                      onChange={(event) => setAddressForm((current) => ({ ...current, street: event.target.value }))}
                      onBlur={() => {
                        setAddressTouched((t) => ({ ...t, street: true }));
                        setAddressForm((c) => ({ ...c, street: cleanAddress(c.street) }));
                      }}
                      aria-invalid={!!(addressErrors.street && addressTouched.street)}
                      aria-describedby={addressErrors.street && addressTouched.street ? "addr-street-error" : undefined}
                      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                      style={{ ...inputStyle, borderColor: addressErrors.street && addressTouched.street ? RED : "#F2D4CC" }}
                    />
                    {addressErrors.street && addressTouched.street && (
                      <p id="addr-street-error" className="mt-1 text-xs font-medium" style={{ color: RED }}>{addressErrors.street}</p>
                    )}
                  </Field>
                  <Field label="Casa / Numero">
                    <input
                      value={addressForm.houseNumber}
                      onChange={(event) => setAddressForm((current) => ({ ...current, houseNumber: event.target.value }))}
                      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Google Maps">
                    <GoogleMapsLocationField
                      id="addr-googleMapsLink"
                      label=""
                      value={addressForm.googleMapsLink}
                      onChange={(value) => setAddressForm((current) => ({ ...current, googleMapsLink: value }))}
                      onBlur={() => setAddressTouched((t) => ({ ...t, googleMapsLink: true }))}
                      inputClassName="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                      inputStyle={{ ...inputStyle, borderColor: addressErrors.googleMapsLink && addressTouched.googleMapsLink ? RED : "#F2D4CC" }}
                      error={addressErrors.googleMapsLink && addressTouched.googleMapsLink ? addressErrors.googleMapsLink : null}
                      hint="Opcional. Cola o link ou usa a tua localizacao atual para facilitar a entrega."
                    />
                  </Field>
                  <Field label="Referencia" full>
                    <input
                      value={addressForm.reference}
                      onChange={(event) => setAddressForm((current) => ({ ...current, reference: event.target.value }))}
                      onBlur={() => setAddressForm((c) => ({ ...c, reference: c.reference ? cleanMessage(c.reference) : "" }))}
                      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                      style={inputStyle}
                    />
                  </Field>
                </div>

                <label className="mt-4 inline-flex items-center gap-3 text-sm font-bold" style={{ color: TEXT }}>
                  <input type="checkbox" checked={addressForm.defaultAddress} onChange={(event) => setAddressForm((current) => ({ ...current, defaultAddress: event.target.checked }))} />
                  Definir como morada predefinida
                </label>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" onClick={handleSubmitAddress} disabled={savingAddress} className="rounded-2xl px-4 py-2.5 text-sm font-black text-white" style={{ background: RED }}>
                    {savingAddress ? "A guardar..." : addressForm.id ? "Guardar morada" : "Adicionar morada"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddressFormOpen(false);
                      setAddressForm(emptyAddressForm);
                      setAddressErrors({});
                      setAddressTouched({});
                    }}
                    className="rounded-2xl border px-4 py-2.5 text-sm font-bold"
                    style={{ borderColor: "#F2D4CC", color: RED_DARK }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section ref={notificationsRef} className="rounded-[28px] border bg-white p-6 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: RED }}>Notificacoes</p>
              <h2 className="mt-1 text-2xl font-black" style={{ color: TEXT, fontFamily: "'Sora', sans-serif" }}>Preferencias</h2>
            </div>

            <div className="mt-6 grid gap-4">
              {[
                { key: "notifyOrderUpdates", title: "Actualizacoes de pedidos", copy: "Receber avisos sobre cada fase da encomenda." },
                { key: "notifyQuoteReady", title: "Cotacoes recebidas", copy: "Ser notificado quando uma cotacao estiver pronta." },
                { key: "notifyPromotions", title: "Promocoes e descontos", copy: "Receber campanhas, novidades e oportunidades especiais." },
                { key: "notifySms", title: "Notificacoes por SMS", copy: "Usar o numero principal para atualizacoes importantes." },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-4 rounded-[24px] border p-4" style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}>
                  <div>
                    <p className="text-sm font-bold" style={{ color: TEXT }}>{item.title}</p>
                    <p className="mt-1 text-sm leading-6" style={{ color: MUTED }}>{item.copy}</p>
                  </div>
                  <Toggle checked={Boolean(profile?.[item.key as keyof CustomerProfile])} onChange={() => handleNotificationToggle(item.key as "notifyOrderUpdates" | "notifyQuoteReady" | "notifyPromotions" | "notifySms")} />
                </div>
              ))}
            </div>
          </section>

          <section ref={securityRef} className="rounded-[28px] border bg-white p-6 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: RED }}>Seguranca</p>
              <h2 className="mt-1 text-2xl font-black" style={{ color: TEXT, fontFamily: "'Sora', sans-serif" }}>Protecao da conta</h2>
            </div>

            <div className="mt-6 grid gap-4">
              <div className="rounded-[24px] border p-4" style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold" style={{ color: TEXT }}>Seguranca e verificacao</p>
                    <p className="mt-1 text-sm leading-6" style={{ color: MUTED }}>
                      Conta ativa significa que podes entrar. Conta verificada significa que podes pagar e concluir acoes sensiveis.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full px-3 py-1 text-xs font-black" style={{ background: "#ECFDF5", color: GREEN }}>Conta ativa</span>
                    <span className="rounded-full px-3 py-1 text-xs font-black" style={{ background: isVerified ? "#ECFDF5" : "#FFF7E8", color: isVerified ? GREEN : "#A16207" }}>
                      {isVerified ? "Conta verificada" : `${accountPct}% concluida`}
                    </span>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-sm" style={{ color: MUTED }}>
                  <div className="flex items-center justify-between gap-3">
                    <span>Nome</span>
                    <strong style={{ color: fullName && fullName !== "Cliente" ? GREEN : RED }}>{fullName && fullName !== "Cliente" ? "OK" : "Pendente"}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Morada</span>
                    <strong style={{ color: profile?.hasDeliveryAddress ? GREEN : RED }}>{profile?.hasDeliveryAddress ? "OK" : "Pendente"}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Canal verificado para pagamentos</span>
                    <strong style={{ color: isVerified ? GREEN : RED }}>{isVerified ? "OK" : "Verificar telefone"}</strong>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border p-4" style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}>
                <div>
                  <p className="text-sm font-bold" style={{ color: TEXT }}>Senha</p>
                  <p className="mt-1 text-sm leading-6" style={{ color: MUTED }}>
                    {profile?.canSetLocalPassword
                      ? "A tua conta entrou com Google. Define agora uma senha para tambem poderes entrar com email e senha."
                      : `Ultima alteracao: ${formatDate(profile?.passwordUpdatedAt)}`}
                  </p>
                </div>
                <Link href="/profile/change-password" className="rounded-2xl border px-4 py-2.5 text-sm font-bold" style={{ borderColor: "#F2D4CC", color: RED_DARK }}>
                  {profile?.canSetLocalPassword ? "Definir senha" : "Alterar senha"}
                </Link>
              </div>

              <div className="rounded-[24px] border p-4" style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold" style={{ color: TEXT }}>Telefone</p>
                    <p className="mt-1 break-all text-sm" style={{ color: MUTED }}>
                      {profile?.phoneNumber || "Adiciona um numero de telefone nos dados pessoais."}
                    </p>
                    <p className="mt-1 text-sm" style={{ color: profile?.phoneVerified ? GREEN : "#A16207" }}>
                      {profile?.phoneVerified ? "Verificado" : "Nao verificado"}
                    </p>
                  </div>
                  {profile?.phoneVerified ? (
                    <span className="rounded-full px-3 py-1 text-xs font-black" style={{ background: "#ECFDF5", color: GREEN }}>Verificado</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendVerifyCode("PHONE")}
                      disabled={verifySending || verifyCooldown > 0 || (verifySent && verifyChannel === "PHONE") || !profile?.phoneNumber}
                      className="rounded-2xl border px-4 py-2.5 text-sm font-bold transition hover:opacity-80 disabled:opacity-50"
                      style={{ borderColor: "#F2D4CC", color: RED_DARK }}
                    >
                      {verifyCooldown > 0 && verifyChannel === "PHONE" ? `Reenviar em ${verifyCooldown}s` : verifySending && verifyChannel === "PHONE" ? "A enviar..." : verifySent && verifyChannel === "PHONE" ? "Codigo enviado" : "Verificar por WhatsApp"}
                    </button>
                  )}
                </div>
                {false && verifySent && verifyChannel === "PHONE" && !(profile?.phoneVerified) && (
                  <div className="mt-4 rounded-[20px] border p-4" style={{ borderColor: "#F2D4CC", background: "#FFF9F7" }}>
                    <p className="text-sm font-semibold" style={{ color: TEXT }}>
                      Enviamos um codigo de 6 digitos por WhatsApp para <span style={{ color: RED_DARK }}>{verifyDestination || profile?.verificationDestinationMasked || profile?.phoneNumber || ""}</span>.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="000000"
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                        className="w-40 rounded-2xl border px-4 py-2.5 text-center text-lg font-black tracking-[0.35em] outline-none"
                        style={inputStyle}
                      />
                      <button
                        type="button"
                        onClick={handleConfirmVerifyCode}
                        disabled={verifyConfirming || verifyCode.length < 6}
                        className="rounded-2xl px-4 py-2.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-50"
                        style={{ background: RED }}
                      >
                        {verifyConfirming ? "A confirmar..." : "Confirmar codigo"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendVerifyCode("PHONE")}
                        disabled={verifySending}
                        className="rounded-2xl border px-4 py-2.5 text-sm font-bold transition hover:opacity-80 disabled:opacity-50"
                        style={{ borderColor: "#F2D4CC", color: RED_DARK }}
                      >
                        {verifySending ? "A reenviar..." : "Reenviar codigo"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-[24px] border p-4" style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}>
                {isXdigitalEmail ? (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold" style={{ color: TEXT }}>Verificacao de email</p>
                      <p className="mt-1 text-sm" style={{ color: MUTED }}>
                        Adiciona um email real nos teus dados pessoais para depois verificares a conta.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setIsEditingPersonal(true); goToSection("personal"); }}
                      className="rounded-2xl border px-4 py-2.5 text-sm font-bold transition hover:opacity-80"
                      style={{ borderColor: "#F2D4CC", color: RED_DARK }}
                    >
                      Adicionar email
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold" style={{ color: TEXT }}>Verificacao de email</p>
                        <p className="mt-1 text-sm" style={{ color: MUTED }}>
                          {profile?.emailVerified || profile?.authProvider === "GOOGLE"
                            ? "Email verificado."
                            : "Confirme o seu email para maior seguranca."}
                        </p>
                      </div>
                      {profile?.emailVerified || profile?.authProvider === "GOOGLE" ? (
                        <span className="rounded-full px-3 py-1 text-xs font-black" style={{ background: "#ECFDF5", color: GREEN }}>Verificado</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSendVerifyCode("EMAIL")}
                          disabled={verifySending || verifyCooldown > 0 || (verifySent && verifyChannel === "EMAIL")}
                          className="rounded-2xl border px-4 py-2.5 text-sm font-bold transition hover:opacity-80 disabled:opacity-50"
                          style={{ borderColor: "#F2D4CC", color: RED_DARK }}
                        >
                          {verifyCooldown > 0 && verifyChannel === "EMAIL" ? `Reenviar em ${verifyCooldown}s` : verifySending && verifyChannel === "EMAIL" ? "A enviar..." : verifySent && verifyChannel === "EMAIL" ? "Codigo enviado" : "Enviar codigo"}
                        </button>
                      )}
                    </div>

                    {false && verifySent && verifyChannel === "EMAIL" && !(profile?.emailVerified) && (
                      <div className="mt-4 rounded-[20px] border p-4" style={{ borderColor: "#F2D4CC", background: "#FFF9F7" }}>
                        <p className="text-sm font-semibold" style={{ color: TEXT }}>
                          Enviamos um codigo de 6 digitos para <span style={{ color: RED_DARK }}>{verifyDestination || profile?.verificationDestinationMasked || profile?.email || ""}</span>.
                        </p>
                        <p className="mt-1 text-sm" style={{ color: MUTED }}>
                          Introduza o codigo abaixo. Se nao recebeu, pode reenviar na mesma area.
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="000000"
                            value={verifyCode}
                            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                            className="w-40 rounded-2xl border px-4 py-2.5 text-center text-lg font-black tracking-[0.35em] outline-none"
                            style={inputStyle}
                          />
                          <button
                            type="button"
                            onClick={handleConfirmVerifyCode}
                            disabled={verifyConfirming || verifyCode.length < 6}
                            className="rounded-2xl px-4 py-2.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-50"
                            style={{ background: RED }}
                          >
                            {verifyConfirming ? "A confirmar..." : "Confirmar codigo"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendVerifyCode("EMAIL")}
                            disabled={verifySending}
                            className="rounded-2xl border px-4 py-2.5 text-sm font-bold transition hover:opacity-80 disabled:opacity-50"
                            style={{ borderColor: "#F2D4CC", color: RED_DARK }}
                          >
                            {verifySending ? "A reenviar..." : "Reenviar codigo"}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border p-4" style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}>
                <div>
                  <p className="text-sm font-bold" style={{ color: TEXT }}>Sessoes activas</p>
                  <p className="mt-1 text-sm leading-6" style={{ color: MUTED }}>
                    Dispositivo actual ligado a esta conta.
                  </p>
                </div>
                <button type="button" onClick={() => setConfirmLogoutOpen(true)} className="rounded-2xl px-4 py-2.5 text-sm font-bold" style={{ background: DANGER_SOFT, color: RED_DARK }}>
                  Terminar todas
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
      <ClientFeedbackDock
        feedback={feedback ? { type: "success", msg: feedback } : dangerFeedback ? { type: "error", msg: dangerFeedback } : null}
        onClose={() => {
          setFeedback("");
          setDangerFeedback("");
        }}
      />
      <ClientConfirmDialog
        open={confirmDeleteAddressId !== null}
        title="Remover esta morada?"
        message="A morada sera retirada do teu perfil e deixara de aparecer nas proximas compras."
        confirmLabel="Remover morada"
        danger
        pending={false}
        onCancel={() => setConfirmDeleteAddressId(null)}
        onConfirm={() => {
          if (confirmDeleteAddressId == null) return;
          void handleDeleteAddress(confirmDeleteAddressId).finally(() => setConfirmDeleteAddressId(null));
        }}
      />
      <ClientConfirmDialog
        open={confirmLogoutOpen}
        title="Terminar a sessao?"
        message="Vamos encerrar esta sessao da tua conta neste dispositivo."
        confirmLabel="Terminar sessao"
        danger
        onCancel={() => setConfirmLogoutOpen(false)}
        onConfirm={() => {
          void handleLogout();
          setConfirmLogoutOpen(false);
        }}
      />
      {verifySent && verifyChannel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl" style={{ border: "1px solid #F2D4CC" }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold" style={{ color: RED }}>
                  {verifyChannel === "PHONE" ? "Verificacao por WhatsApp" : "Verificacao de email"}
                </p>
                <h3 className="mt-1 text-2xl font-black" style={{ color: TEXT, fontFamily: "'Sora', sans-serif" }}>
                  Introduz o codigo recebido
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setVerifySent(false);
                  setVerifyChannel(null);
                  setVerifyCode("");
                }}
                className="rounded-full px-3 py-1 text-sm font-black"
                style={{ background: "#FFF0EC", color: RED_DARK }}
              >
                X
              </button>
            </div>
            <p className="mt-4 text-sm leading-6" style={{ color: MUTED }}>
              Codigo enviado para {verifyDestination || (verifyChannel === "PHONE" ? profile?.phoneNumber : profile?.email) || "o teu contacto"}.
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={verifyCode}
              onChange={(event) => setVerifyCode(event.target.value.replace(/\D/g, ""))}
              className="mt-5 w-full rounded-2xl border px-4 py-3 text-center text-2xl font-black tracking-[0.35em] outline-none"
              style={inputStyle}
            />
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleConfirmVerifyCode}
                disabled={verifyConfirming || verifyCode.length < 6}
                className="flex-1 rounded-2xl px-4 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: RED }}
              >
                {verifyConfirming ? "A confirmar..." : "Confirmar"}
              </button>
              <button
                type="button"
                onClick={() => handleSendVerifyCode(verifyChannel)}
                disabled={verifySending || verifyCooldown > 0}
                className="rounded-2xl border px-4 py-3 text-sm font-bold transition hover:opacity-80 disabled:opacity-50"
                style={{ borderColor: "#F2D4CC", color: RED_DARK }}
              >
                {verifyCooldown > 0 ? `Reenviar em ${verifyCooldown}s` : verifySending ? "A reenviar..." : "Reenviar codigo"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
