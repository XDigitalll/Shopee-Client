"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { CatalogDetails } from "@/components/catalog/catalog-details";
import { CatalogGallery } from "@/components/catalog/catalog-gallery";
import { CatalogGrid } from "@/components/catalog/catalog-grid";
import { ClientProductGridSkeleton, ClientStateCard } from "@/components/client-feedback-state";
import { fetchCatalogProduct, fetchRelatedCatalogProducts, type CatalogProduct } from "@/lib/catalog";

export default function CatalogDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = String(params.slug || "");
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [related, setRelated] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const payload = await fetchCatalogProduct(slug);
        const relatedPayload = await fetchRelatedCatalogProducts(slug, 8).catch(() => ({ content: [] }));
        if (!cancelled) {
          setProduct(payload);
          setRelated(relatedPayload.content || []);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (slug) void load();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return <ClientProductGridSkeleton items={4} />;
  }

  if (error || !product) {
    return (
      <div className="space-y-4">
        <ClientStateCard title="Produto nao encontrado" message="Este produto pode estar inactivo ou indisponivel." />
        <div className="text-center">
          <Link href="/catalogo" className="inline-flex rounded-2xl bg-[#E8431A] px-5 py-3 text-sm font-black text-white">Ver catalogo</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <nav className="text-sm font-semibold text-slate-500">
        <Link href="/" className="hover:text-[#E8431A]">Inicio</Link>
        <span className="mx-2">/</span>
        <Link href="/catalogo" className="hover:text-[#E8431A]">Escolhas da ShopeeMz</Link>
        <span className="mx-2">/</span>
        <span className="text-[#1A1410]">{product.name}</span>
      </nav>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <CatalogGallery product={product} />
        <CatalogDetails product={product} />
      </section>

      {related.length > 0 ? (
        <section className="space-y-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#E8431A]">Relacionados</p>
            <h2 className="font-[family-name:var(--font-sora)] text-2xl font-black text-[#1A1410]">Tambem podes gostar</h2>
          </div>
          <CatalogGrid products={related} />
        </section>
      ) : null}

      <div className="rounded-2xl border border-dashed border-[#F2D4CC] bg-white p-5 text-center">
        <p className="text-sm font-bold text-slate-700">Nao encontraste o que procuravas?</p>
        <Link href="/orders/external/new" className="mt-3 inline-flex rounded-2xl bg-[#E8431A] px-5 py-3 text-sm font-black text-white">
          Importar outro produto
        </Link>
      </div>
    </div>
  );
}
