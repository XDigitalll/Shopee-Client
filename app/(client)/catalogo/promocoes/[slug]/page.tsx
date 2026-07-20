"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { CatalogProduct, fetchCatalogProducts, fetchPerfumePromotion } from "@/lib/catalog";

const variantOption = (product: CatalogProduct, volume: string) => product.variants
  ?.flatMap((variant) => variant.options || []).find((option) => option.value.toLowerCase() === volume.toLowerCase());
const money = (value: number) => new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN" }).format(value);

export default function PerfumePromotionPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [promotion, setPromotion] = useState<Awaited<ReturnType<typeof fetchPerfumePromotion>> | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID().replaceAll("-", ""));

  useEffect(() => {
    Promise.all([fetchPerfumePromotion(slug), fetchCatalogProducts(new URLSearchParams({ page: "0", size: "100" }))])
      .then(([deal, page]) => { setPromotion(deal); setProducts(page.content); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar a promoção."));
  }, [slug]);

  const eligible = useMemo(() => {
    if (!promotion) return [];
    const ids = new Set(promotion.participants.map((item) => item.productId));
    return products.filter((product) => ids.has(product.id) && variantOption(product, promotion.fixedVolume)?.available !== false);
  }, [products, promotion]);
  const total = Object.values(selected).reduce((sum, quantity) => sum + quantity, 0);

  function choose(productId: number) {
    if (!promotion) return;
    setError("");
    setSelected((current) => {
      const quantity = current[productId] || 0;
      if (!promotion.allowRepeats && quantity) { const next = { ...current }; delete next[productId]; return next; }
      if (Object.values(current).reduce((sum, value) => sum + value, 0) >= promotion.choiceQuantity) {
        setError(`Só podes escolher ${promotion.choiceQuantity} perfumes nesta promoção.`); return current;
      }
      return { ...current, [productId]: quantity + 1 };
    });
  }

  function remove(productId: number) {
    setSelected((current) => {
      const next = { ...current }; const quantity = next[productId] || 0;
      if (quantity <= 1) delete next[productId]; else next[productId] = quantity - 1;
      return next;
    });
  }

  async function order() {
    if (!promotion || total !== promotion.choiceQuantity || busy) return;
    setBusy(true); setError("");
    try {
      const result = await apiFetch<{ id: number; paymentUrl?: string }>(`catalog/perfume-promotions/${promotion.slug}/order`, {
        method: "POST", headers: { "Idempotency-Key": key.current },
        body: JSON.stringify({ choices: Object.entries(selected).map(([productId, quantity]) => ({ productId: Number(productId), quantity })) }),
      });
      router.push(result.paymentUrl || `/orders/${result.id}/payment`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível preparar a encomenda.");
      key.current = crypto.randomUUID().replaceAll("-", "");
    } finally { setBusy(false); }
  }

  if (!promotion && !error) return <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-16">A carregar promoção...</main>;
  if (!promotion) return <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-16 text-red-600">{error}</main>;

  return <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
    <nav className="mb-6 text-sm text-slate-500"><Link href="/">Início</Link> / <Link href="/catalogo">Escolhas da ShopeeMz</Link> / {promotion.name}</nav>
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
      <p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#ee3f18]">Promoção de perfumes</p>
      <h1 className="mt-2 text-3xl font-black text-slate-950">{promotion.name}</h1>
      {promotion.description && <p className="mt-3 max-w-3xl text-slate-600">{promotion.description}</p>}
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm text-slate-500">Volume fixo</p><p className="font-extrabold">{promotion.fixedVolume}</p></div>
        <div><p className="text-sm text-slate-500">Preço total</p><p className="text-2xl font-black text-[#ee3f18]">{money(promotion.bundlePrice)}</p></div>
        <div className="rounded-full bg-slate-950 px-5 py-3 font-black text-white">{total} de {promotion.choiceQuantity} selecionados</div>
      </div>
    </section>
    <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {eligible.map((product) => {
        const option = variantOption(product, promotion.fixedVolume)!; const count = selected[product.id] || 0;
        return <article key={product.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${count ? "border-[#ee3f18] ring-2 ring-[#ee3f18]/20" : "border-slate-200"}`}>
          <div className="relative aspect-square bg-slate-50"><Image src={option.imageUrl || product.images[0]?.originalUrl || "/placeholder.png"} alt={product.name} fill className="object-cover" /></div>
          <div className="p-4"><h2 className="font-extrabold text-slate-950">{product.name}</h2><p className="text-sm text-slate-500">{product.brand?.name} · {promotion.fixedVolume}</p>
            {count > 0 && <p className="mt-2 font-black text-[#ee3f18]">Selecionado × {count}</p>}
            <div className="mt-4 flex gap-2"><button type="button" onClick={() => choose(product.id)} className="flex-1 rounded-xl bg-[#ee3f18] px-4 py-3 font-bold text-white hover:bg-[#d93614]">{count && !promotion.allowRepeats ? "Remover" : "Selecionar"}</button>
              {promotion.allowRepeats && count > 0 && <button type="button" onClick={() => remove(product.id)} className="rounded-xl border border-slate-300 px-4 font-bold">−</button>}</div>
          </div>
        </article>;
      })}
    </section>
    {error && <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
    <div className="sticky bottom-4 mt-8 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur"><button type="button" disabled={busy || total !== promotion.choiceQuantity} onClick={order} className="w-full rounded-xl bg-[#ee3f18] px-6 py-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-45">{busy ? "A preparar encomenda..." : total === promotion.choiceQuantity ? "Encomendar agora" : `Seleciona ${promotion.choiceQuantity - total} perfume(s)`}</button></div>
  </main>;
}
