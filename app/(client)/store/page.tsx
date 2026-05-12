"use client";

import Link from "next/link";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { ClientFeedbackBanner, ClientListLoadingOverlay, ClientProductGridSkeleton, ClientStateCard } from "@/components/client-feedback-state";
import { CategoryIcon } from "@/lib/category-icons";
import { formatMoney } from "@/lib/format";
import type { Category, Product, SpringPage } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";

const RED = "#E8431A";
const RED_HOVER = "#CC3315";

function resolveProductImage(product?: Product) {
  if (!product) return "";
  return (
    product.primaryThumbnailUrl ||
    product.primaryImageUrl ||
    product.gallery?.find((img) => img.primaryImage)?.thumbnailUrl ||
    product.gallery?.[0]?.thumbnailUrl ||
    product.gallery?.find((img) => img.primaryImage)?.originalUrl ||
    product.gallery?.[0]?.originalUrl ||
    product.images?.[0] ||
    ""
  );
}

function CartPlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h2l2.2 9h9.7l2-7H6.2" />
      <circle cx="10" cy="19" r="1.4" />
      <circle cx="17" cy="19" r="1.4" />
      <path d="M20 2v6M17 5h6" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {direction === "left"
        ? <polyline points="15 18 9 12 15 6" />
        : <polyline points="9 18 15 12 9 6" />
      }
    </svg>
  );
}

function canAddToCart(product: Product) {
  if (product.madeToOrder) return true;
  return typeof product.stock !== "number" || product.stock > 0;
}

function discountPct(product: Product) {
  const orig = Number(product.originalPrice);
  const final = Number(product.finalPrice);
  if (orig > 0 && final > 0 && orig > final) {
    return Math.round((1 - final / orig) * 100);
  }
  return 0;
}

function productText(product: Product) {
  return [
    product.name,
    product.description,
    product.category?.name,
    product.subCategory,
    product.sourceStore,
  ].filter(Boolean).join(" ").toLowerCase();
}

function hasAny(value: string, words: string[]) {
  return words.some((word) => value.includes(word));
}

function productMerchScore(product: Product) {
  const stock = typeof product.stock === "number" ? product.stock : 0;
  const discount = discountPct(product);
  const rating = Number(product.rating ?? 0);
  const available = canAddToCart(product) ? 1000 : -1000;
  const readyNow = product.madeToOrder ? 0 : 180;
  const stockSignal = stock > 0 ? Math.min(stock, 12) * 8 : 0;
  return available + readyNow + stockSignal + discount * 7 + rating * 18;
}

function sortForMerch(products: Product[]) {
  return [...products].sort((left, right) => productMerchScore(right) - productMerchScore(left));
}

function shelfForProduct(product: Product) {
  const text = productText(product);
  const category = (product.category?.name || "").toLowerCase();

  if (category.includes("tecnologia")) {
    return "gaming";
  }
  if (category.includes("moda")) {
    return "style";
  }

  if (hasAny(text, ["óculos", "oculos", "fashion", "luz azul", "óculos de sol", "oculos de sol"])) {
    return "style";
  }
  if (hasAny(text, ["ps-", "playstation", "console", "gaming", "game", "usb", "hub", "tecnologia"])) {
    return "gaming";
  }
  return "finds";
}

function buildProductShelves(products: Product[], searchTerm: string, activeCategory: number | "all") {
  const sorted = sortForMerch(products);
  if (searchTerm.trim()) {
    return [{ id: "search", title: "Resultados encontrados", subtitle: "Ordenados pelos mais prontos para comprar.", products: sorted }];
  }

  if (activeCategory !== "all") {
    return [{ id: "category", title: "Melhores escolhas da categoria", subtitle: "Primeiro os produtos disponiveis e mais fortes.", products: sorted }];
  }

  const groups = sorted.reduce<Record<string, Product[]>>((acc, product) => {
    const key = shelfForProduct(product);
    acc[key] = [...(acc[key] ?? []), product];
    return acc;
  }, {});

  return [
    { id: "gaming", title: "Gaming e tecnologia", subtitle: "Consoles, acessórios e upgrades organizados para comparar rápido.", products: groups.gaming ?? [] },
    { id: "style", title: "Moda e acessórios", subtitle: "Óculos e itens de estilo agrupados numa prateleira própria.", products: groups.style ?? [] },
    { id: "finds", title: "Outros achados", subtitle: "Produtos úteis fora das categorias principais.", products: groups.finds ?? [] },
  ].filter((shelf) => shelf.products.length > 0);
}

function ProductCard({
  product,
  adding,
  onAddToCart,
  compact = false,
}: {
  product: Product;
  adding: boolean;
  onAddToCart: (event: React.MouseEvent, productId: number) => void;
  compact?: boolean;
}) {
  const img = resolveProductImage(product);
  const canAdd = canAddToCart(product);
  const discount = discountPct(product);

  return (
    <Link
      href={`/store/${product.id}`}
      className="group block rounded-[20px] overflow-hidden border bg-white flex flex-col transition-all duration-200"
      style={{
        borderColor: "#F2D4CC",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        textDecoration: "none",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 28px rgba(232,67,26,0.15)"; e.currentTarget.style.borderColor = "#E8431A"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.05)"; e.currentTarget.style.borderColor = "#F2D4CC"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div className="relative overflow-hidden" style={{ height: compact ? 170 : 190, background: "#FFF8F5", flexShrink: 0 }}>
        {img ? (
          <img
            src={img}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PackageIcon />
          </div>
        )}

        {discount > 0 && (
          <span className="absolute top-2 left-2 text-xs font-black px-2 py-0.5 rounded-full text-white" style={{ background: RED }}>
            -{discount}%
          </span>
        )}

        {product.madeToOrder && (
          <span className="absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#92400E" }}>
            Sob encomenda
          </span>
        )}

        <div
          className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ background: "rgba(26,20,16,0.45)" }}
        >
          <span className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white" style={{ background: RED }}>
            <EyeIcon />
            Ver produto
          </span>
        </div>
      </div>

      <div className="flex flex-col flex-1 p-3 gap-2">
        <h3 className="text-sm font-bold leading-snug line-clamp-2" style={{ color: "#1A1410", minHeight: "2.5rem" }}>
          {product.name}
        </h3>

        <div className="mt-auto pt-1">
          {product.originalPrice && Number(product.originalPrice) > Number(product.finalPrice) && (
            <p className="text-xs line-through" style={{ color: "#B0B7C3" }}>
              {formatMoney(product.originalPrice)}
            </p>
          )}
          <p className="text-lg font-black" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>
            {formatMoney(product.finalPrice)}
          </p>
        </div>

        {!product.madeToOrder && (
          <p className="text-xs" style={{ color: canAdd ? "#6B7280" : "#EF4444" }}>
            {canAdd ? `${product.stock ?? 0} em stock` : "Sem stock"}
          </p>
        )}

        <button
          type="button"
          onClick={(e) => onAddToCart(e, product.id)}
          disabled={adding || !canAdd}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white transition-all mt-1"
          style={{
            background: adding || !canAdd ? "#D1D5DB" : RED,
            cursor: adding || !canAdd ? "not-allowed" : "pointer",
          }}
          onMouseEnter={(e) => { if (!adding && canAdd) e.currentTarget.style.background = RED_HOVER; }}
          onMouseLeave={(e) => { if (!adding && canAdd) e.currentTarget.style.background = RED; }}
        >
          <CartPlusIcon />
          {adding ? "A adicionar..." : canAdd ? "Carrinho" : "Sem stock"}
        </button>
      </div>
    </Link>
  );
}

export default function StorePage() {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [activeCategory, setActiveCategory] = useState<number | "all">(() => {
    const id = searchParams.get("categoryId");
    return id ? Number(id) : "all";
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingId, setIsAddingId] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<Category[]>("categories", { token: token ?? undefined })
      .then(setCategories)
      .catch(() => null);
  }, [token]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const categoryParam = activeCategory !== "all" ? `&categoryId=${activeCategory}` : "";
        const productPage = await apiFetch<SpringPage<Product>>(
          `products?page=${page}&size=8${categoryParam}`,
          { token: token ?? undefined }
        );
        setProducts(productPage.content);
        setTotalPages(Math.max(productPage.totalPages || 1, 1));
      } catch (err) {
        setFeedback({ type: "error", msg: err instanceof Error ? err.message : "Nao foi possivel carregar a loja." });
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [page, activeCategory, token]);

  const handleCategoryChange = (cat: number | "all") => {
    setActiveCategory(cat);
    setPage(0);
    const url = cat === "all" ? "/store" : `/store?categoryId=${cat}`;
    router.replace(url, { scroll: false });
  };

  const visibleProducts = searchTerm.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(searchTerm.trim().toLowerCase()) || p.category?.name?.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : products;
  const productShelves = useMemo(
    () => buildProductShelves(visibleProducts, searchTerm, activeCategory),
    [activeCategory, searchTerm, visibleProducts]
  );

  const handleAddToCart = async (e: React.MouseEvent, productId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!token) {
      setFeedback({ type: "info", msg: "Podes ver a loja sem conta. Para guardar carrinho e finalizar compra, entra na tua conta." });
      return;
    }
    setIsAddingId(productId);
    setFeedback(null);
    try {
      await apiFetch("cart/add", {
        method: "POST",
        token,
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      setFeedback({ type: "success", msg: "Produto adicionado ao carrinho." });
    } catch (err) {
      setFeedback({ type: "error", msg: err instanceof Error ? err.message : "Nao foi possivel adicionar." });
    } finally {
      setIsAddingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-[28px] border bg-white p-5 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: RED }}>Catálogo</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
              Loja XDigital
            </h1>
            <p className="mt-1 text-sm" style={{ color: "#9CA3AF" }}>
              {categories.length} categorias · {visibleProducts.length} produtos nesta página
            </p>
          </div>
          <div className="w-full max-w-sm">
            <div className="flex overflow-hidden rounded-2xl border bg-white" style={{ borderColor: "#E9ECEF" }}>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Pesquisar produto..."
                className="flex-1 px-4 py-3 text-sm outline-none"
              />
              <div className="flex items-center px-4" style={{ background: RED, color: "white" }}>
                <SearchIcon />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Categorias */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        <button
          type="button"
          onClick={() => handleCategoryChange("all")}
          className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all"
          style={{ background: activeCategory === "all" ? RED : "#F3F4F6", color: activeCategory === "all" ? "white" : "#6B7280" }}
        >
          Todos
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => handleCategoryChange(cat.id)}
            className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all"
            style={{ background: activeCategory === cat.id ? RED : "#F3F4F6", color: activeCategory === cat.id ? "white" : "#6B7280" }}
          >
            <span className="inline-flex items-center gap-2">
              <CategoryIcon icon={cat.icon} className="h-4 w-4" />
              <span>{cat.name}</span>
            </span>
          </button>
        ))}
      </div>

      {feedback ? <ClientFeedbackBanner message={feedback.msg} tone={feedback.type} /> : null}

      {/* Grid de produtos */}
      <div className="relative" aria-busy={isLoading}>
      {isLoading && visibleProducts.length === 0 ? (
        <div className="space-y-4">
          <ClientStateCard
            title="A carregar a loja"
            message="Estamos a preparar categorias, produtos e precos desta pagina."
          />
          <ClientProductGridSkeleton items={8} />
        </div>
      ) : visibleProducts.length === 0 ? (
        <div className="space-y-4">
          <ClientStateCard
            title="Nada encontrado"
            message="Nao encontramos produtos para esta combinacao de categoria e pesquisa."
          />
          <div className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center py-20 text-center" style={{ borderColor: "#E9ECEF" }}>
            <PackageIcon />
            <p className="mt-4 text-sm font-medium" style={{ color: "#9CA3AF" }}>
              Nenhum produto disponível com esse filtro.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-7">
          {productShelves.map((shelf) => (
            <section key={shelf.id} className="rounded-[28px] border bg-white p-4 shadow-sm sm:p-5" style={{ borderColor: "#F2D4CC" }}>
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: RED }}>Prateleira</p>
                  <h2 className="mt-1 text-xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{shelf.title}</h2>
                  <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>{shelf.subtitle}</p>
                </div>
                <span className="text-xs font-bold" style={{ color: "#9CA3AF" }}>{shelf.products.length} produtos</span>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {shelf.products.map((product) => (
                  <ProductCard
                    key={`${shelf.id}-${product.id}`}
                    product={product}
                    adding={isAddingId === product.id}
                    onAddToCart={(event, productId) => void handleAddToCart(event, productId)}
                    compact
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Paginação */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          disabled={isLoading || page === 0}
          onClick={() => setPage((p) => Math.max(p - 1, 0))}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: "#E9ECEF", color: "#374151" }}
          onMouseEnter={(e) => { if (page > 0) { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED; } }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E9ECEF"; e.currentTarget.style.color = "#374151"; }}
        >
          <ChevronIcon direction="left" />
          Anterior
        </button>

        <span className="text-sm font-semibold" style={{ color: "#6B7280" }}>
          {page + 1} / {totalPages}
        </span>

        <button
          type="button"
          disabled={isLoading || page + 1 >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: "#E9ECEF", color: "#374151" }}
          onMouseEnter={(e) => { if (page + 1 < totalPages) { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED; } }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E9ECEF"; e.currentTarget.style.color = "#374151"; }}
        >
          Seguinte
          <ChevronIcon direction="right" />
        </button>
      </div>
      <ClientListLoadingOverlay
        visible={isLoading && visibleProducts.length > 0}
        title="A carregar produtos"
        message="Estamos a buscar a pagina da loja."
      />
      </div>
    </div>
  );
}


