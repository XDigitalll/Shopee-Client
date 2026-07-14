"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { CatalogFilters, type CatalogFilterState } from "@/components/catalog/catalog-filters";
import { CatalogGrid } from "@/components/catalog/catalog-grid";
import { ClientProductGridSkeleton, ClientStateCard } from "@/components/client-feedback-state";
import {
  fetchCatalogBrands,
  fetchCatalogCategories,
  fetchCatalogProducts,
  type CatalogProduct,
  type CatalogTaxonomy,
} from "@/lib/catalog";

const initialFilters: CatalogFilterState = {
  search: "",
  category: "",
  brand: "",
  promotion: false,
  bestSeller: false,
  newProduct: false,
};

export default function CatalogPage() {
  const [filters, setFilters] = useState(initialFilters);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CatalogTaxonomy[]>([]);
  const [brands, setBrands] = useState<CatalogTaxonomy[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const buildParams = useCallback((nextPage: number) => {
    const params = new URLSearchParams({ page: String(nextPage), size: "16" });
    if (filters.search.trim()) params.set("search", filters.search.trim());
    if (filters.category) params.set("category", filters.category);
    if (filters.brand) params.set("brand", filters.brand);
    if (filters.promotion) params.set("promotion", "true");
    if (filters.bestSeller) params.set("bestSeller", "true");
    if (filters.newProduct) params.set("newProduct", "true");
    return params;
  }, [filters]);

  const loadProducts = useCallback(async (nextPage = 0, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(false);
    try {
      const payload = await fetchCatalogProducts(buildParams(nextPage));
      setProducts((current) => {
        const nextProducts = append ? [...current, ...(payload.content || [])] : payload.content || [];
        return Array.from(new Map(nextProducts.map((product) => [product.id || product.slug, product])).values());
      });
      setPage(payload.number ?? nextPage);
      setTotalPages(payload.totalPages || 1);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [buildParams]);

  useEffect(() => {
    void Promise.all([
      fetchCatalogCategories().then(setCategories).catch(() => setCategories([])),
      fetchCatalogBrands().then(setBrands).catch(() => setBrands([])),
    ]);
  }, []);

  useEffect(() => {
    void loadProducts(0, false);
  }, [loadProducts]);

  return (
    <div className="space-y-6">
      <nav className="text-sm font-semibold text-slate-500">
        <Link href="/" className="hover:text-[#E8431A]">Início</Link>
        <span className="mx-2">/</span>
        <span className="text-[#1A1410]">Escolhas da ShopeeMz</span>
      </nav>

      <section className="rounded-[24px] bg-white px-5 py-6 shadow-sm sm:px-7">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#E8431A]">Produtos por encomenda</p>
        <h1 className="mt-2 font-[family-name:var(--font-sora)] text-3xl font-black text-[#1A1410]">Escolhas da ShopeeMz</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Produtos escolhidos pela ShopeeMz, com preço final em Meticais. Seleciona as opções, encomenda e acompanha tudo pela tua conta.
        </p>
      </section>

      <CatalogFilters filters={filters} categories={categories} brands={brands} onChange={setFilters} onSubmit={() => void loadProducts(0, false)} />

      {loading ? <ClientProductGridSkeleton items={8} /> : error ? (
        <ClientStateCard title="Não foi possível carregar o catálogo" message="Tenta novamente dentro de instantes." />
      ) : products.length === 0 ? (
        <div className="space-y-4">
          <ClientStateCard title="Sem produtos encontrados" message="Ajusta os filtros ou importa outro produto pelo link." />
          <div className="text-center">
            <Link href="/orders/external/new" className="inline-flex rounded-2xl bg-[#E8431A] px-5 py-3 text-sm font-black text-white">Importar outro produto</Link>
          </div>
        </div>
      ) : (
        <>
          <CatalogGrid products={products} />
          {page + 1 < totalPages ? (
            <div className="text-center">
              <button type="button" disabled={loadingMore} onClick={() => void loadProducts(page + 1, true)} className="rounded-2xl border border-[#F2D4CC] bg-white px-5 py-3 text-sm font-black text-[#E8431A]">
                {loadingMore ? "A carregar..." : "Carregar mais"}
              </button>
            </div>
          ) : null}
        </>
      )}

      <div className="rounded-2xl border border-dashed border-[#F2D4CC] bg-white p-5 text-center">
        <p className="text-sm font-bold text-slate-700">Não encontraste o que procuravas?</p>
        <Link href="/orders/external/new" className="mt-3 inline-flex rounded-2xl bg-[#E8431A] px-5 py-3 text-sm font-black text-white">
          Importar outro produto
        </Link>
      </div>
    </div>
  );
}
