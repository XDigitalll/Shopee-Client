"use client";

import Image from "next/image";
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { formatMoney } from "@/lib/format";

const RED = "#E8431A";
const RED_HOVER = "#C0360F";

export type SharedProductCardProps = {
  href: string; name: string; imageUrl?: string | null; price: number; originalPrice?: number | null;
  pricePrefix?: string; badges?: string[]; availability?: string | null; availabilityTone?: "neutral" | "danger";
  actionLabel: string; actionIcon?: ReactNode; actionDisabled?: boolean; actionPending?: boolean;
  onAction?: (event: MouseEvent<HTMLButtonElement>) => void; feedback?: ReactNode;
};

function PackageIcon() {
  return <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73Z" /><path d="m3.3 7 8.7 5 8.7-5M12 22V12" /></svg>;
}

export function SharedProductCard({ href, name, imageUrl, price, originalPrice, pricePrefix, badges = [], availability, availabilityTone = "neutral", actionLabel, actionIcon, actionDisabled = false, actionPending = false, onAction, feedback }: SharedProductCardProps) {
  const hasDiscount = Number(originalPrice) > Number(price);
  const discount = hasDiscount ? Math.round((1 - Number(price) / Number(originalPrice)) * 100) : 0;
  const visibleBadges = [...(discount > 0 ? [`-${discount}%`] : []), ...badges].slice(0, 2);
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[18px] border bg-white transition-all duration-200" style={{ borderColor: "#F2D4CC", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }} onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 28px rgba(232,67,26,0.15)"; e.currentTarget.style.borderColor = RED; e.currentTarget.style.transform = "translateY(-2px)"; }} onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.05)"; e.currentTarget.style.borderColor = "#F2D4CC"; e.currentTarget.style.transform = "translateY(0)"; }}>
      <Link href={href} className="relative block aspect-square shrink-0 overflow-hidden bg-[#FFF8F5]">
        {imageUrl ? <Image src={imageUrl} alt={name} fill unoptimized sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-contain p-3 transition-transform duration-300 group-hover:scale-105" /> : <div className="flex h-full w-full items-center justify-center"><PackageIcon /></div>}
        {visibleBadges.length ? <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5">{visibleBadges.map((badge) => <span key={badge} className="rounded-full px-2 py-0.5 text-[10px] font-black text-white" style={{ background: RED }}>{badge}</span>)}</div> : null}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100" style={{ background: "rgba(26,20,16,0.45)" }}><span className="rounded-full px-3 py-1.5 text-xs font-bold text-white" style={{ background: RED }}>Ver produto</span></div>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link href={href} className="line-clamp-2 min-h-10 text-sm font-bold leading-snug text-[#1A1410]">{name}</Link>
        <div className="mt-auto pt-1">{hasDiscount ? <p className="text-xs line-through text-[#B0B7C3]">{formatMoney(Number(originalPrice))}</p> : null}<p className="font-[family-name:var(--font-sora)] text-base font-black text-[#E8431A] sm:text-lg">{pricePrefix}{formatMoney(price)}</p></div>
        {availability ? <p className="text-xs" style={{ color: availabilityTone === "danger" ? "#EF4444" : "#6B7280" }}>{availability}</p> : null}
        {onAction ? <button type="button" onClick={onAction} disabled={actionDisabled || actionPending} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-white transition-all" style={{ background: actionDisabled || actionPending ? "#D1D5DB" : RED, cursor: actionDisabled || actionPending ? "not-allowed" : "pointer" }} onMouseEnter={(e) => { if (!actionDisabled && !actionPending) e.currentTarget.style.background = RED_HOVER; }} onMouseLeave={(e) => { if (!actionDisabled && !actionPending) e.currentTarget.style.background = RED; }}>{actionIcon}{actionLabel}</button> : <Link href={href} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#E8431A] py-2 text-xs font-bold text-white transition-all hover:bg-[#C0360F]">{actionIcon}{actionLabel}</Link>}
        {feedback}
      </div>
    </article>
  );
}
