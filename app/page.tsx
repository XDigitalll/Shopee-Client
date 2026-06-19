"use client";

import Link from "next/link";
import { FormEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CLIENT_DATA_CHANGED_EVENT, apiFetch } from "@/lib/api-client";
import { CategoryIcon } from "@/lib/category-icons";
import { formatMoney } from "@/lib/format";
import { orderDisplayCode } from "@/lib/order-label";
import { orderVisibleTotal } from "@/lib/order-money";
import { normalizeClientError } from "@/lib/client-errors";
import type { Category, Order, Product } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { ClientShell } from "@/components/client-shell";

// Constants

const RED = "#E8431A";
const RED_HOVER = "#C0360F";
const RED_PALE = "#FEF2F2";
const DARK = "#1A1410";
const BLUE_DARK = "#1A2744";

const ORDER_STEPS = [
  "Criado", "Em analise", "Cotado", "Aprovado",
  "Aguarda pagamento", "Pago", "Encomendado", "Em transito",
  "Chegou", "Saiu para entrega", "Entregue",
];

const STATUS_STEP: Record<string, number> = {
  PENDING: 0, UNDER_REVIEW: 1, QUOTED: 2, APPROVED: 3,
  PENDING_PAYMENT: 4, CONFIRMED: 4, PAID: 5, PROCESSING: 6,
  ORDERED: 6, SHIPPED: 7, IN_TRANSIT: 7, ARRIVED: 8,
  OUT_FOR_DELIVERY: 9, DELIVERED: 10,
};

const ALL_CATEGORIES_ICON = "package";

const STORES_META = [
  { id: "SHEIN",       label: "Shein",      color: "#E83B6D", abbr: "SH", hint: "shein.com" },
  { id: "AMAZON",      label: "Amazon",     color: "#FF9900", abbr: "AZ", hint: "amazon.com" },
  { id: "TEMU",        label: "Temu",       color: "#F5321F", abbr: "TM", hint: "temu.com" },
  { id: "ALI_EXPRESS", label: "AliExpress", color: "#FF4100", abbr: "AE", hint: "aliexpress.com" },
  { id: "ALI_BABA",    label: "Alibaba",    color: "#FF6A00", abbr: "AB", hint: "alibaba.com" },
  { id: "MR_PRICE",    label: "Mr Price",   color: "#CC0000", abbr: "MP", hint: "mrprice.co.za" },
  { id: "MAKRO",       label: "Makro",      color: "#003087", abbr: "MK", hint: "makro.co.za" },
  { id: "BASH",        label: "Bash",       color: "#2D2D3F", abbr: "BS", hint: "bash.com" },
  { id: "BUFFALO",     label: "Buffalo",    color: "#7B3F00", abbr: "BF", hint: "buffalo.com" },
  { id: "ZARA",        label: "Zara",       color: "#000000", abbr: "ZR", hint: "zara.com" },
  { id: "ASOS",        label: "ASOS",       color: "#2D2D2D", abbr: "AS", hint: "asos.com" },
  { id: "EBAY",        label: "eBay",       color: "#86B817", abbr: "EB", hint: "ebay.com" },
  { id: "OTHER",       label: "Outras",     color: "#6B7280", abbr: "OU", hint: "outra loja" },
];

// Icons

function SearchIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg>;
}
function PackageIcon({ size = 40 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>;
}
function HeartIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>;
}
function CartIconSvg({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h2l2.2 9h9.7l2-7H6.2" /><circle cx="10" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></svg>;
}
function UserIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>;
}
function XIconSvg() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}
function ArrowRight() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>;
}
function DoneMarkIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
}
function TruckIcon() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M3 6h11v9H3z" /><path d="M14 9h3l3 3v3h-6" /><circle cx="7.5" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></svg>;
}
function ShieldIcon() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
}
function StarIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill={RED} stroke={RED} strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
}
function FilterIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" /></svg>;
}

// Login Modal

type LoginModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) { setError(""); setEmail(""); setPassword(""); }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Preenche todos os campos."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json()) as { authenticated?: boolean; message?: string };
      if (!res.ok || !data.authenticated) throw new Error(data.message || "Credenciais invalidas.");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao ligar ao servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(26,20,16,0.75)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-7 shadow-2xl"
        style={{ background: "white" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-black" style={{ fontFamily: "'Sora',sans-serif", color: DARK }}>
              Entrar
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: "#6B7280" }}>
              Bem-vindo de volta
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <XIconSvg />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#374151" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="o-teu@email.com"
              autoComplete="email"
              className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-all"
              style={{ borderColor: "#E9ECEF", background: "#FAFAFA", color: DARK }}
              onFocus={(e) => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.boxShadow = `0 0 0 3px ${RED}1A`; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#E9ECEF"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: "#374151" }}>
              Palavra-passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-all"
              style={{ borderColor: "#E9ECEF", background: "#FAFAFA", color: DARK }}
              onFocus={(e) => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.boxShadow = `0 0 0 3px ${RED}1A`; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#E9ECEF"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>
          <div className="flex justify-end">
            <Link href="/forgot-password" onClick={onClose} className="text-xs font-medium" style={{ color: RED }}>
              Esqueceste a palavra-passe?
            </Link>
          </div>

          {error && (
            <p className="rounded-xl px-3 py-2 text-xs font-medium" style={{ background: "#FFF0F0", color: "#C0392B" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition-all"
            style={{ background: loading ? "#9CA3AF" : RED }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = RED_HOVER; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = RED; }}
          >
            {loading ? "A entrar..." : "Entrar"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm" style={{ color: "#6B7280" }}>
          Ainda nao tens conta?{" "}
          <Link href="/register" onClick={onClose} className="font-bold" style={{ color: RED }}>
            Regista-te gratis
          </Link>
        </p>
      </div>
    </div>
  );
}

// Hero

type HeroBanner = {
  id: number;
  title: string;
  subtitle: string;
  imageUrl: string;
  imageFocus?: "center" | "top" | "bottom" | "left" | "right";
  ctaText?: string;
  ctaUrl?: string;
};

function bannerObjectPosition(focus?: HeroBanner["imageFocus"]) {
  const positions: Record<NonNullable<HeroBanner["imageFocus"]>, string> = {
    center: "center 25%",
    top: "top center",
    bottom: "bottom center",
    left: "left 25%",
    right: "right 25%",
  };
  return positions[focus ?? "center"];
}

function HeroSection({ token, onLoginClick }: { token: string | null; onLoginClick: () => void }) {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const [banners, setBanners] = useState<HeroBanner[]>([]);
  const [current, setCurrent] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [failedBannerIds, setFailedBannerIds] = useState<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    apiFetch<HeroBanner[]>("banners", {}).then((data) => {
      if (Array.isArray(data) && data.length > 0) setBanners(data);
    }).catch(() => undefined).finally(() => setLoaded(true));
  }, []);

  const count = banners.length;

  const goTo = useCallback((idx: number) => {
    setCurrent((idx + count) % count);
  }, [count]);

  useEffect(() => {
    if (count < 2) return;
    timerRef.current = setInterval(() => setCurrent((c) => (c + 1) % count), 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [count]);

  const resetTimer = (idx: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    goTo(idx);
    if (count >= 2) {
      timerRef.current = setInterval(() => setCurrent((c) => (c + 1) % count), 5000);
    }
  };

  const handleSwipeStart = (event: ReactPointerEvent<HTMLElement>) => {
    swipeRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleSwipeEnd = (event: ReactPointerEvent<HTMLElement>) => {
    if (!swipeRef.current || count < 2) {
      swipeRef.current = null;
      return;
    }

    const deltaX = event.clientX - swipeRef.current.x;
    const deltaY = event.clientY - swipeRef.current.y;
    swipeRef.current = null;

    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
      return;
    }

    resetTimer(deltaX < 0 ? current + 1 : current - 1);
  };

  const banner = banners[current] ?? null;
  const hasBanners = loaded && count > 0;
  const isLoadingBanners = !loaded;

  return (
    <section
      className="hero-banner-section relative overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Background: banner image or gradient fallback */}
      {hasBanners && banner ? (
        <>
          {banners.map((b, i) => (
            <div
              key={b.id}
              className="hero-banner-slide absolute inset-0 transition-opacity duration-700"
              style={{ opacity: i === current ? 1 : 0, zIndex: 0 }}
            >
              {failedBannerIds.has(b.id) ? (
                <div className="hero-banner-fallback absolute inset-0" />
              ) : (
                <img
                  src={b.imageUrl}
                  alt={b.title}
                  className="hero-banner-image h-full w-full"
                  style={{ position: "absolute", inset: 0, objectPosition: bannerObjectPosition(b.imageFocus) }}
                  onError={() => setFailedBannerIds((currentIds) => new Set(currentIds).add(b.id))}
                />
              )}
            </div>
          ))}
          {/* Dark gradient overlay for text readability */}
          <div className="hero-banner-overlay absolute inset-0" style={{ zIndex: 1 }} />
          {/* Bottom gradient for dots */}
          <div
            className="hero-banner-bottom-shade absolute bottom-0 left-0 right-0 h-24 sm:h-28"
            style={{ zIndex: 1 }}
          />
        </>
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              background: isLoadingBanners
                ? `linear-gradient(150deg, ${RED} 0%, #9B2009 55%, ${BLUE_DARK} 100%)`
                : `linear-gradient(150deg, ${DARK} 0%, #332019 55%, ${BLUE_DARK} 100%)`,
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.06]"
            style={{
              backgroundImage: `linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)`,
              backgroundSize: "48px 48px",
            }}
          />
        </>
      )}

      {count > 1 && (
        <div
          className="absolute inset-0 touch-pan-y"
          style={{ zIndex: 2 }}
          aria-hidden="true"
          onPointerDown={handleSwipeStart}
          onPointerUp={handleSwipeEnd}
          onPointerCancel={() => { swipeRef.current = null; }}
        />
      )}

      {/* Content */}
      <div className="hero-banner-content pointer-events-none relative mx-auto flex max-w-7xl flex-col justify-between px-4 py-8 sm:justify-center sm:px-6 sm:py-14 lg:py-20" style={{ zIndex: 3 }}>
        <div className="hero-banner-copy pointer-events-auto w-[calc(100vw-2rem)] max-w-2xl space-y-3 text-white sm:w-full sm:space-y-5">
          <div
            className="inline-flex max-w-full items-center gap-2 rounded-full px-3 py-2 text-[11px] font-bold sm:gap-2.5 sm:px-4 sm:text-xs"
            style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}
          >
            {isLoadingBanners ? (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-white/70" />
                A carregar destaques
              </>
            ) : hasBanners ? (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                Plataforma lider de importacao em Mocambique
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-white/60" />
                Destaques indisponiveis
              </>
            )}
          </div>

          <h1
            className="hero-banner-title max-w-[13ch] text-[1.8rem] font-black leading-[1.08] sm:max-w-none sm:text-4xl lg:text-5xl"
            style={{ fontFamily: "'Sora',sans-serif", textShadow: "0 2px 32px rgba(0,0,0,0.5)" }}
          >
            {isLoadingBanners ? (
              <span className="block space-y-3" aria-label="A carregar destaque principal">
                <span className="block h-12 w-[min(100%,34rem)] animate-pulse rounded-2xl bg-white/25 sm:h-14 lg:h-16" />
                <span className="block h-12 w-[min(82%,28rem)] animate-pulse rounded-2xl bg-white/20 sm:h-14 lg:h-16" />
              </span>
            ) : hasBanners && banner ? (
              banner.title
            ) : (
              "Compra fácil em Moçambique"
            )}
          </h1>

          {isLoadingBanners ? (
            <div className="max-w-lg space-y-3" aria-label="A carregar descricao do destaque">
              <div className="h-4 w-full animate-pulse rounded-full bg-white/20" />
              <div className="h-4 w-11/12 animate-pulse rounded-full bg-white/20" />
              <div className="h-4 w-8/12 animate-pulse rounded-full bg-white/15" />
            </div>
          ) : hasBanners && banner?.subtitle ? (
            <p className="hero-banner-subtitle max-w-lg text-sm leading-6 opacity-90 sm:text-base sm:leading-7" style={{ fontFamily: "'DM Sans',sans-serif" }}>
              {banner.subtitle}
            </p>
          ) : (
            <p className="hero-banner-subtitle max-w-lg text-sm leading-6 opacity-90 sm:text-base sm:leading-7" style={{ fontFamily: "'DM Sans',sans-serif" }}>
              Produtos prontos para comprar, pagamento local e compra internacional assistida.
            </p>
          )}

          <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-3">
            <button
              type="button"
              onClick={() => scrollTo("produtos")}
              className="pointer-events-auto flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-2xl px-3 py-3 text-sm font-bold shadow-lg transition-all sm:w-auto sm:gap-2 sm:px-6 sm:py-3.5"
              style={{ background: "white", color: RED }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#FFD4C8")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
            >
              <span className="sm:hidden">Produtos</span>
              <span className="hidden sm:inline">Ver produtos</span>
              <ArrowRight />
            </button>
            <button
              type="button"
              onClick={() => scrollTo("pedido-externo")}
              className="pointer-events-auto flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-2xl border-2 border-white/40 px-3 py-3 text-[13px] font-bold text-white transition-all hover:bg-white/10 hover:border-white/70 sm:w-auto sm:gap-2 sm:px-6 sm:py-3.5 sm:text-sm"
            >
              <span className="sm:hidden">Encomendar do estrangeiro</span>
              <span className="hidden sm:inline">Comprar do estrangeiro</span>
              <ArrowRight />
            </button>
          </div>

        </div>

        {/* Slider controls */}
        {count > 1 && (
          <>
            {/* Prev / Next arrows — visible only on hover */}
            <button
              type="button"
              onClick={() => resetTimer(current - 1)}
              className="absolute left-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white hover:bg-white/20 sm:flex"
              style={{
                background: "rgba(0,0,0,0.28)",
                backdropFilter: "blur(4px)",
                zIndex: 3,
                opacity: hovered ? 1 : 0,
                pointerEvents: hovered ? "auto" : "none",
                transition: "opacity 0.3s",
              }}
              aria-label="Anterior"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button
              type="button"
              onClick={() => resetTimer(current + 1)}
              className="absolute right-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white hover:bg-white/20 sm:flex"
              style={{
                background: "rgba(0,0,0,0.28)",
                backdropFilter: "blur(4px)",
                zIndex: 3,
                opacity: hovered ? 1 : 0,
                pointerEvents: hovered ? "auto" : "none",
                transition: "opacity 0.3s",
              }}
              aria-label="Próximo"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>

            {/* Dot indicators */}
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2 sm:bottom-6" style={{ zIndex: 3 }}>
              {banners.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => resetTimer(i)}
                  className="rounded-full transition-all"
                  style={{
                    width: i === current ? 28 : 8,
                    height: 8,
                    background: i === current ? "white" : "rgba(255,255,255,0.45)",
                  }}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// Trust strip

function TrustStrip() {
  const items = [
    { icon: <TruckIcon />, title: "Entrega em Mocambique", sub: "Maputo, Matola e mais" },
    { icon: <ShieldIcon />, title: "Pagamento seguro", sub: "M-Pesa, e-Mola, transferencia" },
    { icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ), title: "Suporte em Portugues", sub: "Equipa local disponivel" },
    { icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ), title: "Alfandega incluida", sub: "Sem surpresas no desalfandegamento" },
  ];

  return (
    <div className="border-b" style={{ background: DARK, borderColor: "rgba(255,255,255,0.06)" }}>
      <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-white/10 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.title} className="flex items-center gap-3 px-5 py-4 lg:px-6">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: `${RED}33` }}
            >
              {item.icon}
            </div>
            <div>
              <p className="text-xs font-bold text-white sm:text-sm">{item.title}</p>
              <p className="text-[11px] text-white/50 hidden sm:block">{item.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// How it works

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Escolhe o produto",
      desc: "Navega na nossa loja ou partilha o link do carrinho de qualquer loja internacional.",
      color: "#FF9900",
    },
    {
      n: "02",
      title: "Nos tratamos de tudo",
      desc: "Compramos, importamos, tratamos da alfandega e da documentacao em teu nome.",
      color: RED,
    },
    {
      n: "03",
      title: "Recebe em casa",
      desc: "Entregamos na tua porta em Maputo, Matola e cidades principais de Mocambique.",
      color: "#16A34A",
    },
  ];

  return (
    <section className="px-4 py-10 sm:px-6" style={{ background: "#F8F9FA" }}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 text-center">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: RED }}>
            Como funciona
          </p>
          <h2 className="text-2xl font-black" style={{ fontFamily: "'Sora',sans-serif", color: DARK }}>
            Simples, rapido e seguro
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6" style={{ color: "#6B7280" }}>
            Toda a complexidade da importacao fica connosco. Tu so precisas de escolher o que queres.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.n}
              className="relative flex gap-3 overflow-hidden rounded-2xl p-4 sm:block"
              style={{ background: "white", boxShadow: "0 2px 16px rgba(0,0,0,0.06)", border: "1px solid #E9ECEF" }}
            >
              <div
                className="mb-0 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl sm:mb-3 sm:h-auto sm:w-auto sm:px-3 sm:py-1"
                style={{ background: `${step.color}18` }}
              >
                <span className="text-lg font-black sm:text-2xl" style={{ fontFamily: "'Sora',sans-serif", color: step.color }}>
                  {step.n}
                </span>
              </div>
              <div>
                <h3 className="mb-1 text-base font-black" style={{ color: DARK, fontFamily: "'Sora',sans-serif" }}>
                  {step.title}
                </h3>
                <p className="text-sm leading-5" style={{ color: "#6B7280" }}>
                  {step.desc}
                </p>
              </div>
              {/* Decorative */}
              <div
                className="absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-5"
                style={{ background: step.color }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Categories

type CategoriesSectionProps = {
  categories: Category[];
};

function CategoriesSection({ categories }: CategoriesSectionProps) {
  const featuredCategories = categories.filter((category) => category.showOnHomepage);
  const visibleCategories = (featuredCategories.length > 0 ? featuredCategories : categories).slice(0, 8);

  const displayed = visibleCategories.map((category) => ({
    id: category.id,
    icon: category.icon,
    name: category.name,
  }));

  if (displayed.length === 0) {
    return null;
  }

  return (
    <section className="bg-white px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: RED }}>
              Categorias
            </p>
            <h2 className="text-xl font-black" style={{ fontFamily: "'Sora',sans-serif", color: DARK }}>
              Explora por Categoria
            </h2>
          </div>
          <Link href="/store" className="text-sm font-semibold transition hover:underline" style={{ color: RED }}>
            <span className="inline-flex items-center gap-1">
              Ver tudo
              <ArrowRight />
            </span>
          </Link>
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: "none" }}>
          {/* "All" chip */}
          <Link
            href="/store"
            className="flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition-all"
            style={{ background: RED, borderColor: RED, color: "white" }}
          >
            <CategoryIcon icon={ALL_CATEGORIES_ICON} className="h-4 w-4" />
            Todos
          </Link>

          {displayed.map((cat) => {
            return (
              <Link
                key={cat.id}
                href={`/store?categoryId=${cat.id}`}
                className="flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all"
                style={{ background: "#F8F9FA", borderColor: "#E9ECEF", color: "#374151" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#FFF0EB";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#F8F9FA";
                }}
              >
                <CategoryIcon icon={cat.icon} className="h-4 w-4" />
                <span>{cat.name}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// External Order Banner

function ExternalOrderBanner() {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [selectedStore, setSelectedStore] = useState("SHEIN");
  const [submitting, setSubmitting] = useState(false);
  const store = STORES_META.find((s) => s.id === selectedStore)!;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const params = new URLSearchParams();
    params.set("store", selectedStore);
    if (link.trim()) {
      params.set("input", link.trim());
    }
    router.push(`/comprar-do-estrangeiro?${params.toString()}`);
  };

  return (
    <section id="pedido-externo" className="py-16 px-4 sm:px-6" style={{ background: BLUE_DARK }}>
      <div className="mx-auto max-w-3xl text-center text-white">
        {/* Icon */}
        <div
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: "rgba(255,255,255,0.10)" }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </div>

        <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-white/50">
          Compra internacional
        </p>
        <h2 className="mb-4 text-2xl font-black sm:text-3xl" style={{ fontFamily: "'Sora',sans-serif" }}>
          Compra no estrangeiro com apoio local em Mocambique
        </h2>
        <p className="mb-8 max-w-xl mx-auto text-sm leading-7 text-white/70">
          Cola o link agora. Depois confirmamos quantidade, variante e contacto no fluxo oficial.
        </p>

        {/* Store buttons */}
        <div className="mb-6 flex flex-wrap justify-center gap-2">
          {STORES_META.map((s) => {
            const active = selectedStore === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStore(s.id)}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition-all"
                style={{
                  background: active ? s.color : "rgba(255,255,255,0.08)",
                  color: "white",
                  border: `2px solid ${active ? "rgba(255,255,255,0.5)" : "transparent"}`,
                  transform: active ? "scale(1.06)" : "scale(1)",
                }}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-black text-white"
                  style={{ background: active ? "rgba(255,255,255,0.25)" : s.color, flexShrink: 0 }}
                >
                  {s.abbr.slice(0, 2)}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-lg flex-col gap-3 sm:flex-row"
        >
          <input
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Cole o link ou descreva o produto"
            className="flex-1 rounded-2xl px-4 py-3.5 text-sm outline-none"
            style={{
              background: "rgba(255,255,255,0.10)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = store.color)}
            onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)")}
          />
          <button
            type="submit"
            disabled={submitting}
            className="shrink-0 rounded-2xl px-6 py-3.5 text-sm font-bold text-white transition-all disabled:opacity-50"
            style={{ background: store.color }}
          >
            {submitting ? "A redirecionar..." : "Comecar pedido"}
          </button>
        </form>
      </div>
    </section>
  );
}

// Product Card

type FeedbackState = { msg: string; type: "success" | "error" } | null;

type ProductCardProps = {
  product: Product;
  token: string | null;
  authReady: boolean;
  onLoginClick: () => void;
  onFeedback: (msg: string, type: "success" | "error") => void;
};

function canAddToCart(product: Product) {
  if (product.madeToOrder) return true;
  if (product.hasVariants) return product.available !== false && Number(product.stockAvailable ?? product.stock ?? 0) > 0;
  return typeof product.stockAvailable === "number"
    ? product.stockAvailable > 0
    : typeof product.stock !== "number" || product.stock > 0;
}

function ProductCard({ product, token, authReady, onLoginClick, onFeedback }: ProductCardProps) {
  const [adding, setAdding] = useState(false);
  const [cardFeedback, setCardFeedback] = useState<FeedbackState>(null);
  const img =
    product.primaryThumbnailUrl ||
    product.primaryImageUrl ||
    product.gallery?.[0]?.thumbnailUrl ||
    product.gallery?.[0]?.originalUrl ||
    product.images?.[0] ||
    null;

  const canAdd = canAddToCart(product);
  const origPrice = Number(product.originalPrice ?? 0);
  const finalPrice = Number(product.finalPrice ?? 0);
  const hasDiscount = origPrice > 0 && finalPrice > 0 && origPrice > finalPrice;
  const discountPct = hasDiscount ? Math.round((1 - finalPrice / origPrice) * 100) : 0;

  const handleAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!authReady) return;
    if (!token) {
      setCardFeedback({ msg: "Inicia sessão para adicionar ao carrinho.", type: "error" });
      onFeedback("Inicia sessão para adicionar ao carrinho.", "error");
      onLoginClick();
      return;
    }
    setAdding(true);
    try {
      await apiFetch("cart/add", {
        method: "POST",
        token,
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      });
      setCardFeedback({ msg: "Produto adicionado ao carrinho!", type: "success" });
      onFeedback("Produto adicionado ao carrinho!", "success");
    } catch (err) {
      const message = normalizeClientError(err, "Não foi possível adicionar ao carrinho. Tenta novamente.").message;
      setCardFeedback({ msg: message, type: "error" });
      onFeedback(message, "error");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Link
      href={`/store/${product.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-white transition-all"
      style={{ borderColor: "#E9ECEF", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", textDecoration: "none" }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 8px 28px ${RED}18`)}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)")}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden" style={{ background: "#F8F9FA" }}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={product.name}
            className="h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <PackageIcon size={48} />
          </div>
        )}

        {/* Badges */}
        {discountPct > 0 && (
          <span
            className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black text-white"
            style={{ background: RED }}
          >
            -{discountPct}%
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug" style={{ color: DARK }}>
          {product.name}
        </h3>

        {product.availabilityNote && (
          <p className="rounded-lg px-2 py-1 text-[11px]" style={{ background: RED_PALE, color: RED }}>
            {product.availabilityNote}
          </p>
        )}

        {/* Rating placeholder */}
        {product.rating && (
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <StarIcon key={i} />
              ))}
            </div>
            <span className="text-[10px] text-gray-400">({product.reviewCount ?? 0})</span>
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-1">
          <div>
            {hasDiscount && (
              <p className="text-[11px] line-through" style={{ color: "#9CA3AF" }}>
                {formatMoney(origPrice)}
              </p>
            )}
            <p className="text-base font-black sm:text-lg" style={{ color: RED, fontFamily: "'Sora',sans-serif" }}>
              {product.hasVariants ? `A partir de ${formatMoney(finalPrice)}` : formatMoney(finalPrice)}
            </p>
          </div>
          <span className="text-[11px]" style={{ color: "#9CA3AF" }}>
            {product.stock != null ? `${product.stock} un.` : ""}
          </span>
        </div>

        <button
          type="button"
          onClick={(e) => void handleAdd(e)}
          disabled={adding || !canAdd || !authReady}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold text-white transition-all"
          style={{
            background: adding || !canAdd || !authReady ? "#9CA3AF" : RED,
            cursor: adding || !canAdd || !authReady ? "not-allowed" : "pointer",
          }}
          onMouseEnter={(e) => { if (!adding && canAdd && authReady) e.currentTarget.style.background = RED_HOVER; }}
          onMouseLeave={(e) => { if (!adding && canAdd && authReady) e.currentTarget.style.background = RED; }}
        >
          <CartIconSvg size={16} />
          {adding ? "A adicionar..." : !authReady ? "A preparar..." : canAdd ? "Carrinho" : "Sem stock"}
        </button>
        {cardFeedback ? (
          <p className="rounded-xl px-3 py-2 text-xs font-semibold" style={{
            background: cardFeedback.type === "success" ? "#F0FFF4" : "#FFF5F5",
            color: cardFeedback.type === "success" ? "#166534" : "#B42318",
          }}>
            {cardFeedback.msg}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

// Products Section

function productGroup(product: Product) {
  const category = (product.category?.name || "").toLowerCase();
  const text = [product.name, product.subCategory, product.description].filter(Boolean).join(" ").toLowerCase();

  if (category.includes("tecnologia")) return "tech";
  if (category.includes("moda")) return "style";
  if (["ps-", "playstation", "console", "gaming", "usb", "hub"].some((word) => text.includes(word))) return "tech";
  if (["óculos", "oculos", "fashion", "luz azul", "sol"].some((word) => text.includes(word))) return "style";
  return "other";
}

function productScore(product: Product) {
  const stock = typeof product.stockAvailable === "number" ? product.stockAvailable : typeof product.stock === "number" ? product.stock : 0;
  const final = Number(product.finalPrice ?? 0);
  const original = Number(product.originalPrice ?? 0);
  const discount = original > final && original > 0 ? Math.round((1 - final / original) * 100) : 0;
  return (canAddToCart(product) ? 1000 : -1000) + Math.min(stock, 12) * 10 + discount * 6 + Number(product.rating ?? 0) * 20;
}

function buildHomepageShelves(products: Product[], searchActive: boolean) {
  const sorted = [...products].sort((a, b) => productScore(b) - productScore(a));
  if (searchActive) {
    return [{ id: "results", title: "Resultados encontrados", subtitle: "Produtos ordenados pelos mais disponíveis.", products: sorted }];
  }

  const groups = sorted.reduce<Record<string, Product[]>>((acc, product) => {
    const key = productGroup(product);
    acc[key] = [...(acc[key] ?? []), product];
    return acc;
  }, {});

  return [
    { id: "tech", title: "Tecnologia pronta para comprar", subtitle: "Consoles e acessórios tecnológicos na mesma prateleira.", products: groups.tech ?? [] },
    { id: "style", title: "Moda e acessórios", subtitle: "Óculos e itens de estilo organizados para comparar rápido.", products: groups.style ?? [] },
    { id: "other", title: "Outros achados", subtitle: "Mais produtos disponíveis na XDigital.", products: groups.other ?? [] },
  ].filter((shelf) => shelf.products.length > 0);
}

type ProductsSectionProps = {
  products: Product[];
  isLoading: boolean;
  hasError: boolean;
  token: string | null;
  authReady: boolean;
  onLoginClick: () => void;
  searchQuery: string;
  onSearch: (v: string) => void;
  onSearchSubmit: () => void;
  searchActive: boolean;
};

function ProductsSection({
  products, isLoading, hasError, token, authReady, onLoginClick,
  searchQuery, onSearch, onSearchSubmit, searchActive,
}: ProductsSectionProps) {
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const displayProducts = useMemo(() => [...products].sort((a, b) => productScore(b) - productScore(a)).slice(0, 12), [products]);

  useEffect(() => {
    if (feedback) {
      const t = setTimeout(() => setFeedback(null), 3000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  return (
    <section id="produtos" className="py-12 px-4 sm:px-6" style={{ background: "#F8F9FA" }}>
      <div className="mx-auto max-w-7xl">
        {/* Header + Search */}
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: RED }}>
              Catalogo
            </p>
            <h2 className="text-xl font-black" style={{ fontFamily: "'Sora',sans-serif", color: DARK }}>
              Mais vendidos e novidades
            </h2>
            <p className="mt-1 text-sm" style={{ color: "#9CA3AF" }}>
              {searchActive && searchQuery
                ? `Resultados para "${searchQuery}"`
                : isLoading
                ? "A carregar..."
                : `${products.length} produto${products.length !== 1 ? "s" : ""} disponível${products.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); onSearchSubmit(); }}
            className="flex w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-sm"
            style={{ borderColor: "#E9ECEF" }}
          >
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Pesquisar produtos..."
              className="flex-1 px-4 py-3 text-sm outline-none"
              style={{ color: DARK, minWidth: 0 }}
            />
            <button
              type="submit"
              className="px-4 py-3 text-white transition-opacity hover:opacity-80"
              style={{ background: RED }}
            >
              <SearchIcon />
            </button>
          </form>
        </div>

        {/* Feedback toast */}
        {feedback && (
          <div
            className="mb-5 rounded-2xl px-4 py-3 text-sm font-medium border"
            style={{
              background: feedback.type === "success" ? "#F0FFF4" : "#FFF0F0",
              color: feedback.type === "success" ? "#16A34A" : "#C0392B",
              borderColor: feedback.type === "success" ? "#BBF7D0" : "#FECACA",
            }}
          >
            {feedback.msg}
          </div>
        )}

        {/* Grid */}
        {isLoading ? (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))" }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl" style={{ background: "#E9ECEF", height: 320 }} />
            ))}
          </div>
        ) : hasError ? (
          <div
            className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed py-20 text-center"
            style={{ borderColor: "#E9ECEF" }}
          >
            <PackageIcon size={48} />
            <p className="mt-4 text-sm font-semibold" style={{ color: "#6B7280" }}>
              Nao foi possivel carregar produtos.
            </p>
            <p className="mt-1 text-xs" style={{ color: "#9CA3AF" }}>
              Estamos com dificuldade em ligar ao serviço. Tenta novamente dentro de instantes.
            </p>
          </div>
        ) : products.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed py-20 text-center"
            style={{ borderColor: "#E9ECEF" }}
          >
            <PackageIcon size={48} />
            <p className="mt-4 text-sm font-semibold" style={{ color: "#6B7280" }}>
              Nenhum produto disponivel no momento.
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: RED }}>
                  Destaques
                </p>
                <h3 className="mt-1 text-xl font-black" style={{ color: DARK, fontFamily: "'Sora', sans-serif" }}>
                  Produtos prontos para comprar
                </h3>
              </div>
              <span className="text-xs font-bold" style={{ color: "#9CA3AF" }}>{displayProducts.length} produtos</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {displayProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  token={token}
                  authReady={authReady}
                  onLoginClick={onLoginClick}
                  onFeedback={(msg, type) => setFeedback({ msg, type })}
                />
              ))}
            </div>
          </div>
        )}

        {/* View all CTA */}
        {!isLoading && products.length > 0 && (
          <div className="mt-8 text-center">
            <Link
              href="/store"
              className="inline-flex items-center gap-2 rounded-2xl border-2 px-6 py-3 text-sm font-bold transition-all hover:border-[#E8431A] hover:text-[#E8431A]"
              style={{ borderColor: "#E9ECEF", color: "#374151" }}
            >
              Ver todos os produtos <ArrowRight />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

// Order Tracker

function OrderTracker({ order }: { order: Order }) {
  const currentStep = STATUS_STEP[order.status] ?? 0;

  return (
    <section className="bg-white py-12 px-4 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: RED }}>
              Rastreamento
            </p>
            <h2 className="text-xl font-black" style={{ fontFamily: "'Sora',sans-serif", color: DARK }}>
              O Teu Ultimo Pedido
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: "#9CA3AF" }}>
              Pedido {orderDisplayCode(order)} - {order.sourceStore ?? order.type}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {orderVisibleTotal(order) ? (
              <span className="text-sm font-bold" style={{ color: RED, fontFamily: "'Sora',sans-serif" }}>
                {formatMoney(orderVisibleTotal(order))}
              </span>
            ) : null}
            <span
              className="rounded-full px-3 py-1.5 text-xs font-bold text-white"
              style={{ background: RED }}
            >
              {ORDER_STEPS[currentStep]}
            </span>
            <Link href="/orders" className="text-xs font-semibold underline" style={{ color: RED }}>
              <span className="inline-flex items-center gap-1">
                Ver todos
                <ArrowRight />
              </span>
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max items-center">
            {ORDER_STEPS.map((label, i) => {
              const done = i <= currentStep;
              const current = i === currentStep;
              return (
                <div key={label} className="flex items-center">
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black transition-all"
                      style={{
                        background: done ? RED : "#F3F4F6",
                        color: done ? "white" : "#9CA3AF",
                        boxShadow: current ? `0 0 0 4px ${RED}26` : "none",
                        border: current ? `2px solid ${RED}` : "2px solid transparent",
                      }}
                    >
                      {done && !current ? <DoneMarkIcon /> : i + 1}
                    </div>
                    <span
                      className="max-w-16 text-center text-[11px] font-medium whitespace-nowrap"
                      style={{ color: done ? DARK : "#9CA3AF" }}
                    >
                      {label}
                    </span>
                  </div>
                  {i < ORDER_STEPS.length - 1 && (
                    <div
                      className="mx-1 mb-5 h-1 w-10 rounded-full"
                      style={{ background: i < currentStep ? RED : "#E9ECEF" }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// Main Page

export default function Home() {
  const { token, isReady, login } = useAuth();

  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [latestOrder, setLatestOrder] = useState<Order | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const loadPublicData = useCallback(
    async (name?: string) => {
      setLoadingProducts(true);
      setProductsError(false);
      try {
        const params = new URLSearchParams({ page: "0", size: "16" });
        if (name) params.set("name", name);

        const [catsRes, pageRes] = await Promise.all([
          fetch("/api/xdigital/categories"),
          fetch(`/api/xdigital/products?${params}`),
        ]);

        if (!catsRes.ok || !pageRes.ok) throw new Error("backend");

        const [cats, page] = await Promise.all([
          catsRes.json() as Promise<Category[]>,
          pageRes.json() as Promise<{ content: Product[] }>,
        ]);

        setCategories(Array.isArray(cats) ? cats : []);
        setProducts(Array.isArray(page?.content) ? page.content : []);
      } catch {
        setProductsError(true);
      } finally {
        setLoadingProducts(false);
      }
    },
    []
  );

  useEffect(() => { void loadPublicData(); }, [loadPublicData]);

  // Load and auto-refresh latest order for the tracker
  useEffect(() => {
    if (!token) { setLatestOrder(null); return; }
    const load = async () => {
      const page = await apiFetch<{ content: Order[] }>("orders/me?page=0&size=1", { token }).catch(() => null);
      if (page?.content?.[0]) setLatestOrder(page.content[0]);
    };
    void load();
    const id = window.setInterval(() => void load(), 15_000);
    window.addEventListener(CLIENT_DATA_CHANGED_EVENT, load);
    return () => { window.clearInterval(id); window.removeEventListener(CLIENT_DATA_CHANGED_EVENT, load); };
  }, [token]);

  const handleSearchSubmit = async () => {
    if (!searchQuery.trim()) { setSearchActive(false); await loadPublicData(); return; }
    setSearchActive(true);
    await loadPublicData(searchQuery.trim());
  };

  const handleSearchChange = (v: string) => {
    setSearchQuery(v);
    if (!v) { setSearchActive(false); void loadPublicData(); }
  };

  const handleLoginSuccess = () => { login(); setLoginModalOpen(false); };
  const openLogin = () => setLoginModalOpen(true);

  return (
    <ClientShell fullWidth>
      <LoginModal isOpen={loginModalOpen} onClose={() => setLoginModalOpen(false)} onSuccess={handleLoginSuccess} />

      <HeroSection token={token} onLoginClick={openLogin} />
      <TrustStrip />
      <HowItWorks />

      <CategoriesSection categories={categories} />

      <ExternalOrderBanner />

      <ProductsSection
        products={products}
        isLoading={loadingProducts}
        hasError={productsError}
        token={token}
        authReady={isReady}
        onLoginClick={openLogin}
        searchQuery={searchQuery}
        onSearch={handleSearchChange}
        onSearchSubmit={() => void handleSearchSubmit()}
        searchActive={searchActive}
      />

      {latestOrder && <OrderTracker order={latestOrder} />}
    </ClientShell>
  );
}



