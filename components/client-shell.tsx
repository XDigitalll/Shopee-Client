"use client";

import Link from "next/link";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { GlobalAppLoader } from "@/components/global-app-loader";
import { Logo } from "@/components/logo";
import { NotificationBadge } from "@/components/notification-badge";
import { SiteFooter } from "@/components/site-footer";
import { useOrdersAttention } from "@/hooks/useOrdersAttention";
import type { Cart } from "@/lib/types";
import { CLIENT_DATA_CHANGED_EVENT } from "@/lib/api-client";

const RED = "#E8431A";
const RED_DARK = "#CC3315";

const navItems = [
  { href: "/", label: "Inicio" },
  { href: "/store", label: "Loja" },
  { href: "/orders", label: "Pedidos" },
  { href: "/orders/external/new", label: "Comprar do estrangeiro" },
];

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="7" x2="21" y2="7" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="17" x2="21" y2="17" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
      <path d="M2 3h3l2.6 10.4a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L21 6H6" />
    </svg>
  );
}

const PUBLIC_ORDER_ROUTES = ["/external-order", "/orders/external/new", "/delivery-address"];
const PUBLIC_CATALOG_ROUTES = ["/", "/store", "/cart"];
const REQUIRES_AUTH = ["/checkout", "/orders", "/profile", "/settings"];
const CART_COUNT_CACHE_TTL_MS = 8000;

function normalizeOrderAttentionHref(actionUrl: string | null | undefined, orderId?: number | null) {
  if (!actionUrl) return null;
  if (/^\/orders\/[^/]+\/payment(?:[?#].*)?$/.test(actionUrl)) {
    return orderId ? `/orders?highlight=${encodeURIComponent(String(orderId))}` : "/orders";
  }
  return actionUrl;
}

export function ClientShell({ children, fullWidth = false }: { children: ReactNode; fullWidth?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isReady, token, logout, userInitials, userLabel, userAvatarUrl, hasProfileWarning, accountCompletionPercentage, emailVerified, hasRealEmail } = useAuth();
  const { summary: ordersAttentionSummary, attentionCount } = useOrdersAttention();
  const ordersAttentionHref = ordersAttentionSummary.orders
    .map((order) => normalizeOrderAttentionHref(order.actionUrl, order.orderId))
    .find(Boolean) ?? "/orders";
  const needsAuth = useMemo(() => {
    const isPublicOrderRoute = PUBLIC_ORDER_ROUTES.some((p) => pathname === p || pathname?.startsWith(p + "/"));
    const isPublicCatalogRoute = PUBLIC_CATALOG_ROUTES.some((p) => pathname === p || (p !== "/" && pathname?.startsWith(p + "/")));
    return !isPublicOrderRoute && !isPublicCatalogRoute && REQUIRES_AUTH.some((p) => pathname === p || pathname?.startsWith(p + "/"));
  }, [pathname]);

  useEffect(() => {
    if (!isReady || token) return;
    if (needsAuth) router.replace("/login?expired=true");
  }, [isReady, needsAuth, token, router]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const cartFetchInFlightRef = useRef<Promise<void> | null>(null);
  const lastCartFetchAtRef = useRef(0);
  const lastCartTokenRef = useRef<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const showMobileAccountWarnings = Boolean(token) && (hasProfileWarning || (hasRealEmail && !emailVerified));

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuPanelRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      setMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setAvatarFailed(false);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [userAvatarUrl]);

  const loadCartCount = useCallback((options?: { force?: boolean }) => {
    if (!isReady || !token) {
      setCartCount(0);
      lastCartTokenRef.current = null;
      lastCartFetchAtRef.current = 0;
      return Promise.resolve();
    }

    const force = Boolean(options?.force);
    const now = Date.now();
    const tokenChanged = lastCartTokenRef.current !== token;
    if (!force && !tokenChanged && now - lastCartFetchAtRef.current < CART_COUNT_CACHE_TTL_MS) {
      return Promise.resolve();
    }
    if (cartFetchInFlightRef.current) {
      return cartFetchInFlightRef.current;
    }

    lastCartTokenRef.current = token;
    lastCartFetchAtRef.current = now;
    const request = (async () => {
      try {
        const response = await fetch("/api/cart", { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) return;
        const cart = await response.json() as Cart;
        setCartCount((cart.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0));
      } catch {
        setCartCount(0);
      } finally {
        cartFetchInFlightRef.current = null;
      }
    })();

    cartFetchInFlightRef.current = request;
    return request;
  }, [isReady, token]);

  useEffect(() => {
    if (!isReady || !token) {
      const timeoutId = window.setTimeout(() => {
        setCartCount(0);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    const initialLoadTimeoutId = window.setTimeout(() => {
      void loadCartCount({ force: true });
    }, 0);

    const refresh = () => {
      void loadCartCount({ force: true });
    };

    window.addEventListener(CLIENT_DATA_CHANGED_EVENT, refresh);

    return () => {
      window.clearTimeout(initialLoadTimeoutId);
      window.removeEventListener(CLIENT_DATA_CHANGED_EVENT, refresh);
    };
  }, [isReady, loadCartCount, token]);

  const pageTitle = useMemo(() => {
    if (pathname?.startsWith("/orders/external/new")) return "Comprar do estrangeiro";
    if (pathname?.startsWith("/orders")) return "Meus pedidos";
    if (pathname?.startsWith("/cart")) return "Carrinho";
    if (pathname?.startsWith("/checkout")) return "Checkout";
    if (pathname?.startsWith("/external-order")) return "Comprar do estrangeiro";
    if (pathname?.startsWith("/store")) return "Loja";
    if (pathname?.startsWith("/profile")) return "Meu perfil";
    if (pathname?.startsWith("/settings")) return "Definicoes";
    return "Pagina inicial";
  }, [pathname]);

  if (needsAuth && (!isReady || !token)) {
    return <GlobalAppLoader />;
  }

  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#FFF8F5" }}>
      <header className="fixed inset-x-0 top-0 z-50 overflow-x-clip border-b shadow-sm" style={{ background: RED, borderColor: "rgba(255,255,255,0.12)" }}>
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:h-16 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-2 shrink">
            <Logo size="sm" white />
          </Link>

          <div className="hidden lg:flex flex-1 items-center justify-center gap-2">
            {navItems.map((item) => {
              const matches = item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname?.startsWith(item.href + "/");
              const isActive = matches && !navItems.some(
                (other) =>
                  other.href !== item.href &&
                  other.href.length > item.href.length &&
                  (pathname === other.href || pathname?.startsWith(other.href + "/"))
              );
              return (
                <Link
                  key={item.href}
                  href={item.href === "/orders" && attentionCount > 0 ? ordersAttentionHref : item.href}
                  className="rounded-full px-3 py-1.5 text-[13px] font-semibold transition xl:px-4 xl:py-2 xl:text-sm"
                  style={{
                    background: isActive ? "white" : "transparent",
                    color: isActive ? RED : "rgba(255,255,255,0.92)",
                  }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {item.label}
                    {item.href === "/orders" && attentionCount > 0 ? <NotificationBadge count={attentionCount} tone={isActive ? "warm" : "light"} /> : null}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="hidden xl:block text-center flex-1 lg:flex-none">
            <p className="text-sm font-black text-white" style={{ fontFamily: "'Sora', sans-serif" }}>{pageTitle}</p>
          </div>

          <div className="ml-auto hidden sm:flex items-center gap-3">
            {!isReady ? (
              <div className="h-10 w-32 rounded-full animate-pulse" style={{ background: "rgba(255,255,255,0.2)" }} />
            ) : token ? (
              <>
                <Link href="/cart" className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/16 text-white transition hover:bg-white/24" aria-label="Carrinho">
                  <CartIcon />
                  {cartCount > 0 ? (
                    <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-white px-1.5 text-center text-[10px] font-black" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{cartCount}</span>
                  ) : null}
                </Link>
                {hasProfileWarning && (
                  <Link
                    href="/profile?focus=pending"
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition hover:opacity-90"
                    style={{ background: "rgba(255,255,255,0.18)", color: "white" }}
                    title="Perfil incompleto"
                  >
                    <span>⚠</span>
                    <span>{accountCompletionPercentage}%</span>
                  </Link>
                )}
                {hasRealEmail && !emailVerified ? (
                  <Link
                    href="/profile?focus=verification"
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition hover:opacity-90"
                    style={{ background: "#FFF7E8", color: "#7C2D12" }}
                    title="Email nao verificado"
                  >
                    Email nao verificado
                  </Link>
                ) : null}
                <div className="flex items-center gap-2 rounded-full bg-white/14 px-2 py-1 text-white">
                  <Link href="/profile" className="flex items-center gap-2 rounded-full transition hover:bg-white/10">
                    <span className="relative inline-flex">
                      {userAvatarUrl && !avatarFailed ? (
                        <img
                          src={userAvatarUrl}
                          alt={userLabel}
                          className="h-9 w-9 rounded-full border border-white/30 object-cover bg-white"
                          referrerPolicy="no-referrer"
                          onError={() => setAvatarFailed(true)}
                        />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-xs font-black" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{userInitials}</span>
                      )}
                    </span>
                    <div className="pr-2">
                      <p className="max-w-28 truncate text-xs font-semibold">{userLabel}</p>
                      <p className="text-[11px] text-white/80">Ver perfil</p>
                    </div>
                  </Link>
                  <button type="button" onClick={logout} className="rounded-full px-2 text-[11px] text-white/80 hover:text-white">Sair</button>
                </div>
              </>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm transition hover:bg-white/90"
                style={{ color: RED }}
              >
                Entrar
              </Link>
            )}
          </div>

          <Link href="/cart" className="relative ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/16 text-white transition hover:bg-white/24 sm:hidden" aria-label="Carrinho">
            <CartIcon />
            {cartCount > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-white px-1.5 text-center text-[10px] font-black" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{cartCount}</span>
            ) : null}
          </Link>

          <button ref={menuButtonRef} type="button" className="relative sm:hidden p-2 rounded-lg text-white/90 hover:bg-white/15" onClick={() => setMenuOpen((value) => !value)} aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}>
            {attentionCount > 0 ? <NotificationBadge count={attentionCount} tone="light" className="absolute -right-1 -top-1" /> : null}
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>

        {showMobileAccountWarnings ? (
          <div className="sm:hidden border-t px-3 py-2" style={{ borderColor: "rgba(255,255,255,0.16)", background: RED_DARK }}>
            <div className="mx-auto flex max-w-7xl flex-row flex-wrap gap-2">
              {hasRealEmail && !emailVerified ? (
                <Link
                  href="/profile?focus=verification"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex min-h-9 min-w-[132px] flex-1 items-center justify-center rounded-full px-3 py-2 text-center text-[12px] font-black leading-tight shadow-sm"
                  style={{ background: "#FFF7E8", color: "#7C2D12" }}
                >
                  <span className="mr-1.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-black" style={{ background: "#FED7AA", color: "#7C2D12" }}>!</span>
                  Email nao verificado
                </Link>
              ) : null}
              {hasProfileWarning ? (
                <Link
                  href="/profile?focus=pending"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex min-h-9 min-w-[132px] flex-1 items-center justify-center rounded-full px-3 py-2 text-center text-[12px] font-black leading-tight text-white shadow-sm"
                  style={{ background: "rgba(255,255,255,0.18)" }}
                >
                  <span className="mr-1.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-black" style={{ color: RED }}>!</span>
                  Conta {accountCompletionPercentage}% completa
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        {menuOpen && (
          <div ref={menuPanelRef} className="sm:hidden border-t" style={{ borderColor: "rgba(255,255,255,0.2)", background: RED_DARK }}>
            <div className="space-y-2 px-4 py-4">
              {!isReady ? (
                <div className="h-[68px] rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.1)" }} />
              ) : token ? (
                <>
                  <div className="flex items-center justify-between rounded-2xl bg-white/10 px-3 py-3 text-white">
                    <Link href="/profile" onClick={() => setMenuOpen(false)} className="flex flex-1 items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-white/75">Conta</p>
                        <p className="text-sm font-bold">{userLabel}</p>
                        <p className="text-xs text-white/75">Abrir perfil</p>
                      </div>
                      {userAvatarUrl && !avatarFailed ? (
                        <img src={userAvatarUrl} alt={userLabel} className="h-10 w-10 rounded-full border border-white/30 object-cover bg-white" referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-black" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{userInitials}</div>
                      )}
                    </Link>
                  </div>
                  <Link href="/profile" onClick={() => setMenuOpen(false)} className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-semibold text-white/90 hover:bg-white/10">
                    Meu perfil
                  </Link>
                  <Link href="/cart" onClick={() => setMenuOpen(false)} className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-semibold text-white/90 hover:bg-white/10">
                    Carrinho
                    {cartCount > 0 ? <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black" style={{ color: RED }}>{cartCount}</span> : null}
                  </Link>
                </>
              ) : (
                <Link href="/login" onClick={() => setMenuOpen(false)} className="flex w-full items-center justify-center rounded-2xl bg-white py-3 text-sm font-bold" style={{ color: RED }}>
                  Entrar / Registar
                </Link>
              )}
              {navItems.map((item) => (
                <Link key={item.href} href={item.href === "/orders" && attentionCount > 0 ? ordersAttentionHref : item.href} onClick={() => setMenuOpen(false)} className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-semibold text-white/90 hover:bg-white/10">
                  {item.label}
                  {item.href === "/orders" && attentionCount > 0 ? <NotificationBadge count={attentionCount} tone="light" /> : null}
                </Link>
              ))}
              {token && (
                <button type="button" onClick={() => { setMenuOpen(false); logout(); }} className="flex items-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold text-white/90 hover:bg-white/10">
                  <LogoutIcon />Sair
                </button>
              )}
            </div>
          </div>
        )}
      </header>
      <div className={showMobileAccountWarnings ? "h-[110px] shrink-0 sm:h-16" : "h-14 shrink-0 sm:h-16"} />

      <main className={fullWidth ? "flex-1 overflow-x-hidden" : `mx-auto w-full max-w-7xl flex-1 overflow-x-hidden px-4 pb-6 ${showMobileAccountWarnings ? "pt-3" : "pt-6"} sm:px-6 sm:py-6 lg:px-8`}>{children}</main>

      <SiteFooter />
    </div>
  );
}
