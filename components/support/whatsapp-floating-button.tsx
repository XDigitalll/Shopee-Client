"use client";

import { usePathname } from "next/navigation";
import { SUPPORT_WHATSAPP_ORDER_HELP_URL } from "@/lib/support-contacts";

const HIDDEN_ROUTE_PREFIXES = ["/admin", "/admin-login", "/dashboard", "/login/admin"];

export function shouldShowWhatsappFloatingButton(pathname: string | null): boolean {
  const currentPath = pathname || "/";
  return !HIDDEN_ROUTE_PREFIXES.some(
    (prefix) => currentPath === prefix || currentPath.startsWith(`${prefix}/`),
  );
}

export function WhatsappFloatingButton() {
  const pathname = usePathname();

  if (!shouldShowWhatsappFloatingButton(pathname)) {
    return null;
  }

  return (
    <a
      href={SUPPORT_WHATSAPP_ORDER_HELP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com suporte no WhatsApp"
      title="Falar com suporte"
      className="group fixed right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+5.75rem)] z-[80] flex items-center gap-2 rounded-full bg-[#25D366] p-3 text-white shadow-[0_14px_34px_rgba(37,211,102,0.35)] ring-1 ring-white/40 transition duration-200 hover:-translate-y-0.5 hover:bg-[#1FB855] hover:shadow-[0_18px_42px_rgba(37,211,102,0.45)] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/30 sm:right-6 sm:bottom-6 sm:p-3.5"
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 rounded-full bg-[#25D366]/40 motion-safe:animate-ping"
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        className="h-7 w-7 shrink-0"
        fill="currentColor"
      >
        <path d="M16.04 3.2c-7.02 0-12.72 5.62-12.72 12.55 0 2.2.59 4.36 1.7 6.25L3.2 28.8l6.97-1.78a12.88 12.88 0 0 0 5.87 1.43c7.02 0 12.72-5.62 12.72-12.55S23.06 3.2 16.04 3.2Zm0 22.92c-1.86 0-3.68-.5-5.27-1.45l-.38-.23-4.14 1.06 1.1-4.01-.25-.41a10.13 10.13 0 0 1-1.46-5.24c0-5.64 4.66-10.23 10.4-10.23s10.4 4.59 10.4 10.23-4.66 10.28-10.4 10.28Zm5.7-7.7c-.31-.16-1.84-.9-2.12-1-.29-.1-.5-.16-.71.16-.2.31-.81 1-.99 1.21-.18.21-.36.23-.67.08-.31-.16-1.31-.48-2.5-1.53-.92-.81-1.55-1.82-1.73-2.13-.18-.31-.02-.48.14-.63.14-.14.31-.36.47-.54.16-.18.2-.31.31-.52.1-.21.05-.39-.03-.54-.08-.16-.71-1.69-.97-2.31-.25-.6-.51-.52-.71-.53h-.6c-.2 0-.54.08-.83.39-.29.31-1.08 1.05-1.08 2.55s1.11 2.96 1.26 3.16c.16.21 2.18 3.3 5.29 4.62.74.31 1.32.5 1.77.64.74.23 1.42.2 1.95.12.59-.09 1.84-.74 2.1-1.46.26-.72.26-1.33.18-1.46-.08-.13-.29-.21-.6-.36Z" />
      </svg>
      <span className="hidden max-w-[9rem] whitespace-nowrap rounded-full bg-white/95 px-3 py-1 text-xs font-black text-[#128C4A] shadow-sm transition group-hover:translate-x-0.5 sm:inline">
        WhatsApp
      </span>
      <span className="pointer-events-none absolute bottom-full right-0 mb-2 hidden whitespace-nowrap rounded-lg bg-[#111827] px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100 sm:block">
        Falar com suporte
      </span>
    </a>
  );
}
