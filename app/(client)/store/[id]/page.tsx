"use client";

import Link from "next/link";
import Image, { type ImageLoaderProps } from "next/image";
import { memo, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { catalogEstimatedDeliveryTime, fetchCatalogProduct, fetchRelatedCatalogProducts, type CatalogProduct } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import type { Product, ProductReview, ProductReviewSummary, SpringPage } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";

const RED = "#E8431A";
const GREEN = "#16A34A";

const passthroughImageLoader = ({ src }: ImageLoaderProps) => src;

/* ─── Icons ─────────────────────────────────────────────── */
function ChevronRightIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>;
}
function ChevronLeftIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>;
}
function ChevronPrevIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>;
}
function ChevronNextIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>;
}
function HeartIcon({ filled }: { filled: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? RED : "none"} stroke={filled ? RED : "#6B7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>;
}
function ShareIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>;
}
function ZoomIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>;
}
function PackageIcon() {
  return <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>;
}
function CheckCircleIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" /></svg>;
}
function XIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}

/* ─── Helpers ────────────────────────────────────────────── */
function resolveImages(product?: Product): string[] {
  if (!product) return [];
  const gallery = (product.gallery || []).map((img) => img.originalUrl || img.thumbnailUrl).filter(Boolean) as string[];
  const fallback = [product.primaryImageUrl, product.primaryThumbnailUrl, ...(product.images || [])].filter(Boolean) as string[];
  return Array.from(new Set([...gallery, ...fallback]));
}

function colorSwatch(value: string) {
  const palette: Record<string, string> = {
    preto: "#111827", branco: "#F9FAFB", azul: "#2563EB", vermelho: "#DC2626",
    verde: "#16A34A", amarelo: "#F59E0B", rosa: "#EC4899", cinza: "#6B7280",
    castanho: "#8B5E3C", dourado: "#C9A227", prata: "#A8A29E",
  };
  return palette[value.trim().toLowerCase()] ?? "linear-gradient(135deg,#E5E7EB,#9CA3AF)";
}

function buildSpecs(product?: Product) {
  if (!product) return [];
  return [
    ["Categoria", product.category?.name],
    ["Subcategoria", product.subCategory],
    ["Peso", product.weight ? `${product.weight} kg` : undefined],
    ["Volume", product.volume ? String(product.volume) : undefined],
    ["Origem", product.sourceStore || product.source],
    ["Stock", typeof product.stock === "number" ? `${product.stock} unidades` : product.madeToOrder ? "Por encomenda" : undefined],
    ["Disponibilidade", product.availabilityNote],
  ].filter(([, v]) => Boolean(v)) as [string, string][];
}

function RichSection({ title, icon, content }: { title: string; icon: string; content: string }) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold" style={{ color: "#111827" }}>{icon} {title}</p>
      <div className="rounded-2xl border p-4 text-sm leading-7" style={{ borderColor: "#F0F0F0", background: "#FAFAFA", color: "#4B5563" }}>
        {content.split("\n").filter(Boolean).map((line, i) => <p key={i}>{line}</p>)}
      </div>
    </div>
  );
}

/* ─── Visual variant helpers ─────────────────────────────── */
const VISUAL_ATTR_NORMALIZED = new Set([
  "cor", "color", "modelo", "estampa", "design", "lente", "armacao", "material",
  "tonalidade", "acabamento", "padrao",
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function isVisualAttr(key: string): boolean {
  const norm = normalizeKey(key);
  // exact match OR the key contains a visual term (handles "Cor da lente", "Cor da armação")
  return [...VISUAL_ATTR_NORMALIZED].some((term) => norm === term || norm.includes(term));
}

type StockStatus = "available" | "limited" | "unavailable";

function isColorAttr(key: string): boolean {
  const norm = normalizeKey(key);
  return norm === "cor" || norm === "color" || norm.startsWith("cor ");
}

function isPhotoAttr(key: string): boolean {
  const norm = normalizeKey(key);
  return ["modelo", "foto", "estampa", "design", "lente", "armacao", "padrao"].some((term) => norm.includes(term));
}

function isSizeAttr(key: string): boolean {
  const norm = normalizeKey(key);
  return ["tamanho", "size", "numero", "medida"].some((term) => norm.includes(term));
}

function isTechAttr(key: string): boolean {
  const norm = normalizeKey(key);
  return ["ram", "armazenamento", "capacidade", "cpu", "processador", "memoria", "storage"].some((term) => norm.includes(term));
}

function getAttrValueStock(
  variants: NonNullable<Product["variants"]>,
  attrKey: string,
  attrValue: string,
  madeToOrder: boolean | undefined,
  currentSelections: Record<string, string>
): StockStatus {
  if (madeToOrder) {
    return variants.some((variant) => variant.active !== false && variant.attributes?.[attrKey] === attrValue)
      ? "available" : "unavailable";
  }
  const compatible = variants.filter((v) => {
    if (!v.active) return false;
    const attrs = v.attributes ?? {};
    if (attrs[attrKey] !== attrValue) return false;
    for (const [k, val] of Object.entries(currentSelections)) {
      if (k === attrKey) continue;
      if (attrs[k] !== undefined && attrs[k] !== val) return false;
    }
    return true;
  });
  if (compatible.length === 0) return "unavailable";
  const totalStock = compatible.reduce((sum, v) => sum + (v.stock ?? 0), 0);
  if (totalStock <= 0) return "unavailable";
  if (totalStock <= 5) return "limited";
  return "available";
}

const VariantThumb = memo(function VariantThumb({
  value, imageUrl, fallbackUrl, stockStatus, isActive, onClick,
}: {
  value: string; imageUrl?: string | null; fallbackUrl?: string | null; stockStatus: StockStatus; isActive: boolean; onClick: () => void;
}) {
  const resolvedImage = imageUrl ?? fallbackUrl;
  const isUnavailable = stockStatus === "unavailable";
  const isLimited = stockStatus === "limited";
  return (
    <button
      type="button"
      onClick={isUnavailable ? undefined : onClick}
      disabled={isUnavailable}
      title={isUnavailable ? `${value} — sem stock` : isLimited ? `${value} — poucas unidades` : value}
      className="relative flex-none flex flex-col items-center gap-1.5 transition-opacity"
      style={{ opacity: isUnavailable ? 0.4 : 1, cursor: isUnavailable ? "not-allowed" : "pointer" }}
    >
      <div
        className="relative overflow-hidden rounded-xl border-2 transition-all duration-200"
        style={{
          width: 80, height: 80,
          borderColor: isActive ? RED : "#E5E7EB",
          boxShadow: isActive ? `0 0 0 2px ${RED}` : "none",
          transform: isActive ? "scale(1.06)" : "scale(1)",
        }}
      >
        {resolvedImage
          ? <img src={resolvedImage} alt={value} loading="lazy" className="h-full w-full object-cover" />
          : <div className="h-full w-full" style={{ background: colorSwatch(value) }} />}
        {isUnavailable && (
          <div
            className="absolute inset-0"
            style={{ background: "repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.55) 4px,rgba(255,255,255,0.55) 6px)" }}
          />
        )}
        {isActive && (
          <div className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2.5" stroke={RED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        )}
        {isLimited && (
          <div className="absolute left-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-white" style={{ background: "#F97316" }} />
        )}
      </div>
      <span
        className="max-w-[80px] truncate text-center text-[10px] font-semibold leading-none"
        style={{ color: isActive ? RED : isUnavailable ? "#9CA3AF" : "#4B5563" }}
      >
        {value}
      </span>
    </button>
  );
});

const ColorSwatchOption = memo(function ColorSwatchOption({
  value, stockStatus, isActive, onClick,
}: {
  value: string; stockStatus: StockStatus; isActive: boolean; onClick: () => void;
}) {
  const isUnavailable = stockStatus === "unavailable";
  const isLimited = stockStatus === "limited";
  const swatch = colorSwatch(value);
  return (
    <button
      type="button"
      onClick={isUnavailable ? undefined : onClick}
      disabled={isUnavailable}
      className="group relative flex min-w-[92px] items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition-all"
      style={{
        borderColor: isActive ? RED : "#E5E7EB",
        background: isActive ? "#FFF4F0" : "white",
        color: isUnavailable ? "#9CA3AF" : "#111827",
        boxShadow: isActive ? "0 12px 30px rgba(232,67,26,0.14), 0 0 0 1px #E8431A" : "0 6px 18px rgba(17,24,39,0.04)",
        cursor: isUnavailable ? "not-allowed" : "pointer",
        opacity: isUnavailable ? 0.5 : 1,
      }}
    >
      <span
        className="grid h-8 w-8 flex-none place-items-center rounded-full border"
        style={{ borderColor: isActive ? RED : "#D1D5DB", background: "#fff" }}
      >
        <span className="h-5 w-5 rounded-full border border-black/10" style={{ background: swatch }} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black">{value}</span>
        <span className="block text-[10px] font-semibold uppercase tracking-wide" style={{ color: isLimited ? "#F97316" : "#9CA3AF" }}>
          {isUnavailable ? "Sem stock" : isLimited ? "Poucas" : "Disponivel"}
        </span>
      </span>
      {isActive && (
        <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full text-white shadow-sm" style={{ background: RED }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      )}
    </button>
  );
});

const VariantPill = memo(function VariantPill({
  value, stockStatus, isActive, onClick, tone = "default",
}: {
  value: string; stockStatus: StockStatus; isActive: boolean; onClick: () => void; tone?: "default" | "size" | "tech";
}) {
  const isUnavailable = stockStatus === "unavailable";
  const isLimited = stockStatus === "limited";
  const compact = tone === "size";
  return (
    <button
      type="button"
      onClick={isUnavailable ? undefined : onClick}
      disabled={isUnavailable}
      className={`relative border text-sm font-black transition-all ${compact ? "min-w-12 rounded-xl px-4 py-3" : "rounded-2xl px-4 py-3"}`}
      style={{
        borderColor: isActive ? RED : "#E5E7EB",
        background: isActive ? "#FFF4F0" : isUnavailable ? "#F9FAFB" : "white",
        color: isActive ? RED : isUnavailable ? "#9CA3AF" : tone === "tech" ? "#111827" : "#374151",
        boxShadow: isActive ? `0 10px 24px rgba(232,67,26,0.12), 0 0 0 1px ${RED}` : "0 6px 18px rgba(17,24,39,0.04)",
        cursor: isUnavailable ? "not-allowed" : "pointer",
        textDecoration: isUnavailable ? "line-through" : "none",
        opacity: isUnavailable ? 0.55 : 1,
      }}
    >
      {value}
      {isLimited && (
        <span
          className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white"
          style={{ background: "#F97316" }}
        />
      )}
    </button>
  );
});

/* ─────────────────────────────────────────────────────────── */

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i < Math.round(rating) ? "#F59E0B" : "#E5E7EB"} stroke="none">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────── */
function catalogToStoreProduct(item: CatalogProduct): Product {
  const definitions = (item.variants || []).filter((variant) => variant.values?.length);
  const combinations = definitions.reduce<Record<string, string>[]>((rows, definition) => rows.flatMap((row) => definition.values.map((value) => ({ ...row, [definition.key]: value }))), [{}]);
  return {
    id: item.id, name: item.name, slug: item.slug, description: item.description || undefined,
    shortDescription: item.shortDescription || undefined, finalPrice: Number(item.finalPrice || 0), available: true,
    pricingMode: item.pricingMode || "FIXED_PRICE", quoteMessage: item.quoteMessage || undefined, quoteResponseDeadline: item.quoteResponseDeadline || undefined,
    externalLink: item.supplierLink || undefined,
    madeToOrder: true, source: "EXTERNAL", availabilityNote: `Prazo estimado: ${catalogEstimatedDeliveryTime(item)}`,
    category: item.category ? { id: item.category.parentId || item.category.id, name: item.category.parentName || item.category.name, slug: item.category.parentSlug || item.category.slug } : undefined,
    subCategory: item.category?.parentId ? item.category.name : undefined,
    gallery: (item.images || []).map((image) => ({ id: image.id, originalUrl: image.originalUrl, thumbnailUrl: image.thumbnailUrl, displayOrder: image.displayOrder, primaryImage: image.primaryImage, altText: image.altText || undefined })),
    primaryImageUrl: item.images?.find((image) => image.primaryImage)?.originalUrl || item.images?.[0]?.originalUrl,
    specifications: item.specifications, hasVariants: definitions.length > 0,
    variantAttributeKeys: definitions.map((definition) => definition.key),
    variants: definitions.length ? combinations.map((attributes, index) => {
      const enriched = definitions.flatMap((definition) => definition.options || []).find((option) => Object.values(attributes).includes(option.value));
      return { id: index + 1, active: enriched?.available !== false, inStock: enriched?.available !== false, stock: enriched?.stock ?? undefined, attributes, mainImageUrl: enriched?.imageUrl || undefined, finalPrice: Number(enriched?.price ?? item.finalPrice), effectivePrice: Number(enriched?.price ?? item.finalPrice) };
    }) : undefined,
  };
}

export default function ProductDetailPage({ source = "store" }: { source?: "store" | "catalog" }) {
  const params = useParams<{ id?: string; slug?: string }>();
  const router = useRouter();
  const { token, isReady } = useAuth();
  const routeKey = source === "catalog" ? String(params.slug || "") : String(params.id || "");
  const productId = Number(params.id);

  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewSummary, setReviewSummary] = useState({ averageRating: 0, reviewCount: 0 });
  const [related, setRelated] = useState<Product[]>([]);
  const [activeImage, setActiveImage] = useState("");
  const [activeTab, setActiveTab] = useState<"description" | "specs" | "reviews" | "delivery" | "guide">("description");
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedAttrValues, setSelectedAttrValues] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [pageError, setPageError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<"add" | "buy" | null>(null);
  const [wishlist, setWishlist] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [imgFading, setImgFading] = useState(false);
  const imageSwipeRef = useRef<{ x: number; y: number } | null>(null);
  const suppressImageClickRef = useRef(false);
  const catalogOrderKeyRef = useRef<string | null>(null);
  const catalogSubmittingRef = useRef(false);

  useEffect(() => {
    const loadPage = async () => {
      if (!routeKey) return;
      setLoading(true);
      setPageError(null);
      try {
        const catalogItem = source === "catalog" ? await fetchCatalogProduct(routeKey) : null;
        const data = catalogItem ? catalogToStoreProduct(catalogItem) : await apiFetch<Product>(`products/${productId}`, token ? { token } : {});
        setProduct(data);
        const imgs = resolveImages(data);
        setActiveImage(imgs[0] || "");
        const activeVariants = (data.variants || []).filter((v) => v.active !== false);
        const sizes = Array.from(new Set(activeVariants.map((v) => v.size).filter(Boolean) as string[]));
        const colors = Array.from(new Set(activeVariants.map((v) => v.color).filter(Boolean) as string[]));
        setSelectedSize(sizes[0] || "");
        setSelectedColor(colors[0] || "");

        // Pre-select first option for each attribute key
        if (data.hasVariants && data.variantAttributeKeys?.length) {
          const defaults: Record<string, string> = {};
          for (const key of data.variantAttributeKeys) {
            const firstVal = activeVariants.map((v) => v.attributes?.[key]).find(Boolean);
            if (firstVal) defaults[key] = firstVal;
          }
          setSelectedAttrValues(defaults);
        }

        const [revPayload] = source === "catalog" ? [] : await Promise.allSettled([
          apiFetch<ProductReviewSummary>(`products/${productId}/reviews`, token ? { token } : {}),
        ]);
        if (revPayload?.status === "fulfilled") {
          setReviews(Array.isArray(revPayload.value.reviews) ? revPayload.value.reviews : []);
          setReviewSummary({
            averageRating: Number(revPayload.value.averageRating || data.rating || 0),
            reviewCount: Number(revPayload.value.reviewCount || data.reviewCount || 0),
          });
        }

        if (source === "catalog" && catalogItem) {
          fetchRelatedCatalogProducts(catalogItem.slug, 6).then((page) => setRelated((page.content || []).map(catalogToStoreProduct))).catch(() => undefined);
        } else if (data.category?.id) {
          apiFetch<SpringPage<Product>>(`products?page=0&size=12`, token ? { token } : {})
            .then((p) => setRelated((p.content || []).filter((i) => i.id !== data.id && i.category?.id === data.category?.id).slice(0, 6)))
            .catch(() => undefined);
        }
      } catch (err) {
        setPageError(err instanceof Error ? err.message : "Não foi possível carregar este produto.");
      } finally {
        setLoading(false);
      }
    };
    void loadPage();
  }, [productId, routeKey, source, token]);

  const selectedVariant = useMemo(() => {
    const variants = (product?.variants || []).filter((v) => v.active !== false);
    if (!variants.length) return undefined;
    const firstAvailable = variants.find((v) => Number(v.stockAvailable ?? v.stock ?? 0) > 0) ?? variants[0];

    // New attribute-based selection
    if (product?.hasVariants && Object.keys(selectedAttrValues).length > 0) {
      const match = variants.find((v) => {
        const attrs = v.attributes ?? {};
        return Object.entries(selectedAttrValues).every(([key, val]) => attrs[key] === val);
      });
      return match ?? firstAvailable;
    }

    // Legacy color/size fallback
    const match = variants.find((v) => {
      const sOk = selectedSize ? v.size === selectedSize : true;
      const cOk = selectedColor ? v.color === selectedColor : true;
      return sOk && cOk;
    });
    return match ?? firstAvailable;
  }, [product, selectedColor, selectedSize, selectedAttrValues]);

  const images = useMemo(() => {
    const base = resolveImages(product ?? undefined);
    if (selectedVariant?.mainImageUrl && !base.includes(selectedVariant.mainImageUrl)) {
      return [selectedVariant.mainImageUrl, ...base];
    }
    return base;
  }, [product, selectedVariant]);

  // Switch main image when variant changes
  useEffect(() => {
    if (selectedVariant?.mainImageUrl) {
      setActiveImage(selectedVariant.mainImageUrl);
    } else if (images.length > 0) {
      setActiveImage(images[0]);
    }
  }, [selectedVariant]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fade-in on image change
  useEffect(() => {
    setImgFading(true);
    const t = setTimeout(() => setImgFading(false), 30);
    return () => clearTimeout(t);
  }, [activeImage]);

  const price = Number(selectedVariant?.effectivePrice ?? selectedVariant?.finalPrice ?? product?.finalPrice ?? 0);
  const originalPrice = Number(product?.originalPrice || 0);
  const discountPct = originalPrice > price && price > 0 ? Math.round((1 - price / originalPrice) * 100) : 0;
  const stock = typeof selectedVariant?.stockAvailable === "number"
    ? selectedVariant.stockAvailable
    : typeof selectedVariant?.stock === "number"
      ? selectedVariant.stock
      : product?.stockAvailable ?? product?.stock;
  const variantRequired = product?.hasVariants && !selectedVariant;
  const isExternalProduct = product?.madeToOrder || product?.source === "EXTERNAL";
  const quoteRequired = source === "catalog" && product?.pricingMode === "QUOTE_REQUIRED";
  const canAdd = !variantRequired && (isExternalProduct || typeof stock !== "number" || stock > 0);
  const canUseCta = canAdd && (isReady || isExternalProduct);
  const sizeOptions = Array.from(new Set((product?.variants || []).map((v) => v.size).filter(Boolean) as string[]));
  const colorOptions = Array.from(new Set((product?.variants || []).map((v) => v.color).filter(Boolean) as string[]));

  // Smart attribute split: selector (>1 unique value) vs characteristic (exactly 1 value)
  const attrValueCounts = useMemo(() => {
    const active = (product?.variants || []).filter((v) => v.active !== false);
    const counts: Record<string, Set<string>> = {};
    for (const v of active) {
      for (const [k, val] of Object.entries(v.attributes ?? {})) {
        if (!counts[k]) counts[k] = new Set();
        counts[k].add(val);
      }
    }
    return counts;
  }, [product]);

  const selectorKeys = (product?.variantAttributeKeys ?? []).filter((k) => (attrValueCounts[k]?.size ?? 0) > 1);
  const characteristicKeys = (product?.variantAttributeKeys ?? []).filter((k) => (attrValueCounts[k]?.size ?? 0) === 1);

  // Fallback image for variant thumbs that have no individual mainImageUrl
  const productFallbackImage = useMemo(
    () => product?.primaryImageUrl ?? product?.gallery?.[0]?.originalUrl ?? null,
    [product]
  );
  const specs = buildSpecs(product ?? undefined);
  const avgRating = reviewSummary.averageRating;
  const totalReviews = reviewSummary.reviewCount;
  const productReference = selectedVariant?.sku || product?.externalProductId;

  const activeImageIndex = images.indexOf(activeImage);
  const goImage = (dir: 1 | -1) => {
    const next = (activeImageIndex + dir + images.length) % images.length;
    setActiveImage(images[next]);
  };

  const handleImageSwipeStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (images.length < 2) return;
    imageSwipeRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleImageSwipeEnd = (event: ReactPointerEvent<HTMLElement>) => {
    if (!imageSwipeRef.current || images.length < 2) {
      imageSwipeRef.current = null;
      return;
    }

    const deltaX = event.clientX - imageSwipeRef.current.x;
    const deltaY = event.clientY - imageSwipeRef.current.y;
    imageSwipeRef.current = null;

    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
      return;
    }

    suppressImageClickRef.current = true;
    goImage(deltaX < 0 ? 1 : -1);
    window.setTimeout(() => {
      suppressImageClickRef.current = false;
    }, 120);
  };

  const addToCart = async (targetId: number, mode: "add" | "buy", variantVal?: string | number, qty = quantity) => {
    if (isExternalProduct) {
      if (source === "catalog" && product?.slug) {
        if (catalogSubmittingRef.current) return;
        if (!isReady) return;
        if (!token) {
          router.push(`/login?redirect=${encodeURIComponent(`/catalogo/${product.slug}`)}`);
          return;
        }
        catalogSubmittingRef.current = true;
        setBusyAction("buy");
        setFeedback(null);
        catalogOrderKeyRef.current ||= crypto.randomUUID();
        try {
          const order = await apiFetch<{ id: number; paymentUrl?: string }>(`catalog/products/${product.slug}/order`, {
            method: "POST",
            token,
            headers: { "Idempotency-Key": catalogOrderKeyRef.current },
            body: JSON.stringify({ quantity: qty, selectedVariants: selectedAttrValues }),
          });
          catalogOrderKeyRef.current = null;
          catalogSubmittingRef.current = false;
          setBusyAction(null);
          router.push(quoteRequired ? "/orders" : order.paymentUrl || `/orders/${order.id}/payment`);
        } catch (err) {
          setFeedback({ type: "error", msg: err instanceof Error ? err.message : "Não foi possível preparar a encomenda." });
          setBusyAction(null);
          catalogSubmittingRef.current = false;
        }
        return;
      }
      const input = product?.externalLink || product?.name || "";
      const query = input ? `?input=${encodeURIComponent(input)}` : "";
      setFeedback({ type: "info", msg: "Este produto requer um pedido assistido. Confirma os dados para continuar." });
      router.push(`/orders/external/new${query}`);
      return;
    }
    if (!isReady) return;
    if (!token) {
      setFeedback({ type: "info", msg: "Inicia sessão para adicionar ao carrinho." });
      router.push(`/login?redirect=${encodeURIComponent(`/store/${productId}`)}`);
      return;
    }
    setBusyAction(mode);
    setFeedback(null);
    try {
      await apiFetch("cart/add", {
        method: "POST",
        token,
        body: JSON.stringify({
          productId: targetId,
          quantity: qty,
          variantId: variantVal ?? selectedVariant?.id ?? undefined,
        }),
      });
      if (mode === "buy") {
        router.push("/cart");
      } else {
        setFeedback({ type: "success", msg: "Produto adicionado ao carrinho!" });
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (err) {
      setFeedback({ type: "error", msg: err instanceof Error ? err.message : "Não foi possível adicionar o produto." });
    } finally {
      setBusyAction(null);
    }
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="space-y-8 pb-24">
        <div className="h-5 w-56 animate-pulse rounded-full bg-gray-100" />
        <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
          <div className="space-y-3">
            <div className="aspect-[4/3] animate-pulse rounded-3xl bg-gray-100" />
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 w-16 animate-pulse rounded-xl bg-gray-100" />)}
            </div>
          </div>
          <div className="space-y-4">
            {[40, 70, 50, 100, 60, 80].map((w, i) => <div key={i} className="animate-pulse rounded-full bg-gray-100" style={{ height: 18, width: `${w}%` }} />)}
          </div>
        </div>
      </div>
    );
  }

  /* ── Not found ── */
  if (!product) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 text-center">
        <PackageIcon />
        <div>
          <p className="text-xl font-bold text-gray-900">Produto não encontrado</p>
          <p className="mt-1 text-sm text-gray-500">O produto que procuras não está disponível.</p>
        </div>
        {pageError && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{pageError}</p>}
        <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-1.5 rounded-full border px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
          <ChevronLeftIcon /> Voltar à loja
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Lightbox */}
      {lightbox && activeImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" onClick={() => setLightbox(false)}>
          <button type="button" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20" onClick={() => setLightbox(false)}><XIcon /></button>
          {images.length > 1 && (
            <>
              <button type="button" className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20" onClick={(e) => { e.stopPropagation(); goImage(-1); }}><ChevronPrevIcon /></button>
              <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20" onClick={(e) => { e.stopPropagation(); goImage(1); }}><ChevronNextIcon /></button>
            </>
          )}
          <img
            src={activeImage}
            alt={product.name}
            className="max-h-[88vh] max-w-[90vw] touch-pan-y rounded-2xl object-contain"
            onPointerDown={handleImageSwipeStart}
            onPointerUp={(event) => {
              event.stopPropagation();
              handleImageSwipeEnd(event);
            }}
            onPointerCancel={() => { imageSwipeRef.current = null; }}
            onClick={(e) => e.stopPropagation()}
          />
          {images.length > 1 && <p className="absolute bottom-6 text-sm font-medium text-white/70">{activeImageIndex + 1} / {images.length}</p>}
        </div>
      )}

      {/* Toast feedback */}
      {feedback && (
        <div className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold shadow-xl lg:bottom-10 ${feedback.type === "success" ? "border-green-200 bg-white text-green-800" : feedback.type === "info" ? "border-orange-200 bg-white text-orange-800" : "border-red-200 bg-white text-red-700"}`}>
          {feedback.type === "success" ? <CheckCircleIcon /> : null}
          {feedback.msg}
        </div>
      )}

      <div className="pb-28 space-y-10 lg:pb-12">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm" style={{ color: "#9CA3AF" }}>
          <Link href="/" className="transition hover:text-gray-700">Início</Link>
          <ChevronRightIcon />
          <Link href={source === "catalog" ? "/catalogo" : "/store"} className="transition hover:text-gray-700">{source === "catalog" ? "Escolhas da ShopeeMz" : "Loja"}</Link>
          {product.category?.name && (
            <>
              <ChevronRightIcon />
              <span className="text-gray-500">{product.category.name}</span>
            </>
          )}
          {product.subCategory && (
            <>
              <ChevronRightIcon />
              <span className="text-gray-500">{product.subCategory}</span>
            </>
          )}
          <ChevronRightIcon />
          <span className="line-clamp-1 max-w-[140px] font-medium" style={{ color: "#374151" }}>{product.name}</span>
        </nav>

        {/* Main grid */}
        <section className="grid gap-8 lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_460px]">

          {/* ── Gallery ── */}
          <div className="space-y-3">
            <div
              className="group relative touch-pan-y cursor-zoom-in overflow-hidden rounded-3xl border bg-white"
              style={{ borderColor: "#F0F0F0" }}
              onPointerDown={handleImageSwipeStart}
              onPointerUp={handleImageSwipeEnd}
              onPointerCancel={() => { imageSwipeRef.current = null; }}
              onClick={() => {
                if (suppressImageClickRef.current) return;
                setLightbox(true);
              }}
            >
              {discountPct > 0 && (
                <span className="absolute left-4 top-4 z-10 rounded-full px-3 py-1.5 text-xs font-black text-white" style={{ background: RED }}>
                  -{discountPct}%
                </span>
              )}
              <div className="absolute right-3 top-3 z-10 rounded-full bg-white/80 p-1.5 opacity-0 shadow backdrop-blur-sm transition group-hover:opacity-100">
                <ZoomIcon />
              </div>
              <div className="relative flex aspect-[4/3] items-center justify-center bg-[#FAFAFA] p-6 lg:aspect-square">
                {activeImage
                  ? <Image
                      loader={passthroughImageLoader}
                      unoptimized
                      src={activeImage}
                      alt={product.name}
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      className="object-contain p-6"
                      style={{ opacity: imgFading ? 0 : 1, transition: "opacity 0.22s ease" }}
                    />
                  : <PackageIcon />}
              </div>
              {images.length > 1 && (
                <>
                  <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-md transition hover:bg-white" onClick={(e) => { e.stopPropagation(); goImage(-1); }}><ChevronPrevIcon /></button>
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-md transition hover:bg-white" onClick={(e) => { e.stopPropagation(); goImage(1); }}><ChevronNextIcon /></button>
                </>
              )}
            </div>

            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, idx) => {
                  const active = img === activeImage;
                  return (
                    <button key={img} type="button" onClick={() => setActiveImage(img)} className="flex-none overflow-hidden rounded-xl border-2 bg-white transition" style={{ borderColor: active ? RED : "transparent", outline: active ? `none` : "1px solid #F0F0F0" }}>
                      <Image
                        loader={passthroughImageLoader}
                        unoptimized
                        src={img}
                        alt={`${product.name} ${idx + 1}`}
                        width={64}
                        height={64}
                        className="h-14 w-14 object-cover sm:h-16 sm:w-16"
                      />
                    </button>
                  );
                })}
              </div>
            )}

            {images.length > 1 && (
              <div className="flex justify-center gap-1.5">
                {images.map((img, idx) => (
                  <button key={img} type="button" onClick={() => setActiveImage(img)} className="rounded-full transition" style={{ width: img === activeImage ? 20 : 6, height: 6, background: img === activeImage ? RED : "#E5E7EB" }} />
                ))}
              </div>
            )}
          </div>

          {/* ── Product info ── */}
          <div className="space-y-5">

            {/* Header */}
            <div>
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex rounded-full px-3 py-1 text-xs font-bold" style={{ background: "#FFF0EB", color: RED }}>
                  {product.category?.name || "Produto"}
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setWishlist((w) => !w)} className="rounded-full border bg-white p-2 shadow-sm transition hover:scale-105" style={{ borderColor: "#F0F0F0" }}>
                    <HeartIcon filled={wishlist} />
                  </button>
                  <button type="button" className="rounded-full border bg-white p-2 shadow-sm transition hover:scale-105" style={{ borderColor: "#F0F0F0" }}>
                    <ShareIcon />
                  </button>
                </div>
              </div>
              <h1 className="mt-3 text-2xl font-black leading-snug sm:text-3xl" style={{ color: "#111827", fontFamily: "'Sora', sans-serif" }}>
                {product.name}
              </h1>

              {/* Rating row */}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {avgRating > 0 ? (
                  <>
                    <StarRow rating={avgRating} />
                    <span className="text-sm font-bold" style={{ color: "#F59E0B" }}>{avgRating.toFixed(1)}</span>
                    <span className="text-sm" style={{ color: "#6B7280" }}>({totalReviews} {totalReviews === 1 ? "avaliação" : "avaliações"})</span>
                  </>
                ) : (
                  <span className="text-sm" style={{ color: "#9CA3AF" }}>Sem avaliações ainda</span>
                )}
                {product.madeToOrder && (
                  <span className="rounded-full border px-2.5 py-0.5 text-xs font-semibold" style={{ borderColor: "#FDE68A", background: "#FFFBEB", color: "#92400E" }}>Por encomenda</span>
                )}
              </div>
            </div>

            {/* Price */}
            <div className="rounded-2xl border p-4" style={{ borderColor: "#F0F0F0", background: "#FAFAFA" }}>
              {quoteRequired ? <div><p className="text-2xl font-black sm:text-3xl" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>Preço sob consulta</p><p className="mt-2 max-w-xl text-sm leading-6 text-gray-600">{product.quoteMessage || "O preço poderá variar conforme disponibilidade, câmbio ou fornecedor. Respondemos rapidamente com uma cotação personalizada."}</p>{product.quoteResponseDeadline ? <p className="mt-2 text-sm font-bold text-gray-800">{product.quoteResponseDeadline}</p> : null}</div> : <>
              <div className="flex flex-wrap items-end gap-3">
                <span className="text-3xl font-black sm:text-4xl" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>
                  {formatMoney(price)}
                </span>
                {originalPrice > price && (
                  <span className="mb-1 text-base line-through" style={{ color: "#9CA3AF" }}>{formatMoney(originalPrice)}</span>
                )}
                {discountPct > 0 && (
                  <span className="mb-1 rounded-full px-2.5 py-1 text-xs font-black" style={{ background: "#ECFDF5", color: GREEN }}>
                    Poupa {discountPct}%
                  </span>
                )}
              </div>
              {discountPct > 0 && (
                <p className="mt-1 text-xs" style={{ color: "#6B7280" }}>
                  Poupas {formatMoney(originalPrice - price)} em relação ao preço original
                </p>
              )}
              </>}
            </div>

            {/* Dynamic attribute-based variant selectors (only multi-value keys) */}
            {product.hasVariants && selectorKeys.length > 0 && (
              <div className="space-y-5">
                {selectorKeys.map((attrKey) => {
                  const activeVariants = product.variants || [];
                  const values = Array.from(new Set(
                    activeVariants.map((v) => v.attributes?.[attrKey]).filter(Boolean) as string[]
                  ));
                  if (values.length === 0) return null;
                  const selected = selectedAttrValues[attrKey];
                  const colorSelector = isColorAttr(attrKey);
                  const photoSelector = !colorSelector && isPhotoAttr(attrKey);
                  const sizeSelector = isSizeAttr(attrKey);
                  const techSelector = isTechAttr(attrKey);
                  return (
                    <div key={attrKey} className="rounded-3xl border p-4" style={{ borderColor: "#F1E7E2", background: "rgba(255,255,255,0.72)" }}>
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-black" style={{ color: "#111827" }}>{attrKey}</p>
                          <p className="text-xs" style={{ color: "#9CA3AF" }}>
                            {colorSelector
                              ? "Escolhe a cor"
                              : photoSelector
                                ? "Escolhe o modelo"
                                : sizeSelector
                                  ? "Escolhe o tamanho"
                                  : techSelector
                                    ? "Escolhe a configuracao"
                                    : "Escolhe uma opcao"}
                          </p>
                        </div>
                        {selected && <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: "#FFF0EB", color: RED }}>{selected}</span>}
                      </div>
                      {colorSelector ? (
                        <div className="flex flex-wrap gap-2.5">
                          {values.map((val) => {
                            const stockStatus = getAttrValueStock(activeVariants, attrKey, val, product.madeToOrder, selectedAttrValues);
                            return (
                              <ColorSwatchOption
                                key={val}
                                value={val}
                                stockStatus={stockStatus}
                                isActive={selected === val}
                                onClick={() => setSelectedAttrValues((prev) => ({ ...prev, [attrKey]: val }))}
                              />
                            );
                          })}
                        </div>
                      ) : photoSelector ? (
                        <div className="flex gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden">
                          {values.map((val) => {
                            const variantForVal = activeVariants.find((v) => v.attributes?.[attrKey] === val);
                            const stockStatus = getAttrValueStock(activeVariants, attrKey, val, product.madeToOrder, selectedAttrValues);
                            return (
                              <VariantThumb
                                key={val}
                                value={val}
                                imageUrl={variantForVal?.mainImageUrl}
                                fallbackUrl={productFallbackImage}
                                stockStatus={stockStatus}
                                isActive={selected === val}
                                onClick={() => setSelectedAttrValues((prev) => ({ ...prev, [attrKey]: val }))}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {values.map((val) => {
                            const stockStatus = getAttrValueStock(activeVariants, attrKey, val, product.madeToOrder, selectedAttrValues);
                            return (
                              <VariantPill
                                key={val}
                                value={val}
                                stockStatus={stockStatus}
                                isActive={selected === val}
                                tone={sizeSelector ? "size" : techSelector ? "tech" : "default"}
                                onClick={() => setSelectedAttrValues((prev) => ({ ...prev, [attrKey]: val }))}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Fixed characteristics — single-value attrs shown as info, not selectors */}
            {product.hasVariants && characteristicKeys.length > 0 && (
              <div className="rounded-2xl border p-4" style={{ borderColor: "#F0F0F0", background: "#FAFAFA" }}>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: "#374151" }}>Características incluídas</p>
                <div className="flex flex-col gap-2">
                  {characteristicKeys.map((k) => {
                    const val = selectedVariant?.attributes?.[k] ?? [...(attrValueCounts[k] ?? new Set())][0];
                    return val ? (
                      <div key={k} className="flex items-center justify-between text-sm">
                        <span style={{ color: "#6B7280" }}>{k}</span>
                        <span className="font-semibold" style={{ color: "#374151" }}>{val}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}

            {/* Selected variant summary */}
            {product.hasVariants && selectedVariant && (
              <div className="rounded-2xl border p-4" style={{ borderColor: "#E8431A22", background: "#FFF8F7" }}>
                <p className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: "#374151" }}>Selecionado</p>
                {Object.keys(selectedVariant.attributes ?? {}).length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {Object.entries(selectedVariant.attributes ?? {}).map(([k, v]) => (
                      <span key={k} className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "#F3F4F6", color: "#374151" }}>
                        {k}: <span style={{ color: RED }}>{v}</span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {selectedVariant.sku && (
                    <span className="font-mono" style={{ color: "#6B7280" }}>SKU: {selectedVariant.sku}</span>
                  )}
                  <span className="font-semibold" style={{ color: typeof stock === "number" && stock <= 5 && stock > 0 ? "#DC2626" : "#16A34A" }}>
                    {typeof stock === "number"
                      ? stock === 0 ? "Sem stock" : stock <= 5 ? `Apenas ${stock} restante${stock > 1 ? "s" : ""}` : `${stock} disponíveis`
                      : product.madeToOrder ? "Por encomenda" : "Disponível"}
                  </span>
                </div>
              </div>
            )}

            {/* Legacy size/color selectors for products without the new attribute system */}
            {!product.hasVariants && sizeOptions.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-bold" style={{ color: "#111827" }}>Tamanho</p>
                  {selectedSize && <span className="text-xs font-medium" style={{ color: RED }}>{selectedSize}</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {sizeOptions.map((size) => {
                    const active = size === selectedSize;
                    return (
                      <button key={size} type="button" onClick={() => setSelectedSize(size)} className="rounded-xl border px-4 py-2 text-sm font-bold transition" style={{ borderColor: active ? RED : "#E5E7EB", background: active ? "#FFF0EB" : "white", color: active ? RED : "#374151", boxShadow: active ? `0 0 0 1px ${RED}` : "none" }}>
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {!product.hasVariants && colorOptions.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-bold" style={{ color: "#111827" }}>Cor</p>
                  {selectedColor && <span className="text-xs font-medium" style={{ color: RED }}>{selectedColor}</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((color) => {
                    const active = color === selectedColor;
                    const swatch = colorSwatch(color);
                    return (
                      <button key={color} type="button" onClick={() => setSelectedColor(color)} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition" style={{ borderColor: active ? RED : "#E5E7EB", background: active ? "#FFF0EB" : "white", color: "#374151", boxShadow: active ? `0 0 0 1px ${RED}` : "none" }}>
                        <span className="h-4 w-4 rounded-full border" style={{ background: swatch, borderColor: "#D1D5DB" }} />
                        {color}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Qty + stock */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="mb-2 text-sm font-bold" style={{ color: "#111827" }}>Quantidade</p>
                <div className="inline-flex items-center gap-1 rounded-2xl border bg-white" style={{ borderColor: "#E5E7EB" }}>
                  <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="flex h-10 w-10 items-center justify-center rounded-l-2xl text-xl font-black transition hover:bg-gray-50" style={{ color: RED }}>−</button>
                  <span className="min-w-[2.5rem] text-center text-sm font-bold" style={{ color: "#111827" }}>{quantity}</span>
                  <button type="button" onClick={() => setQuantity((q) => Math.min(99, q + 1))} className="flex h-10 w-10 items-center justify-center rounded-r-2xl text-xl font-black transition hover:bg-gray-50" style={{ color: RED }}>+</button>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium" style={{ color: "#9CA3AF" }}>{product.madeToOrder ? "Chegada estimada" : "Disponível"}</p>
                <p className="text-sm font-bold" style={{ color: typeof stock === "number" && stock <= 3 ? "#DC2626" : GREEN }}>
                  {typeof stock === "number"
                    ? stock <= 3 && stock > 0
                      ? `Apenas ${stock} restante${stock > 1 ? "s" : ""}!`
                      : stock === 0
                        ? "Sem stock"
                        : `${stock} unidades`
                    : product.madeToOrder
                      ? product.availabilityNote?.replace(/^Prazo estimado:\s*/i, "") || "Sob confirmação"
                      : product.availabilityNote || "Disponível"}
                </p>
                {typeof stock === "number" && stock > 0 && stock <= 10 && (
                  <div className="mt-1.5 h-1.5 w-20 overflow-hidden rounded-full bg-gray-200 ml-auto">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (stock / 10) * 100)}%`, background: stock <= 3 ? "#DC2626" : GREEN }} />
                  </div>
                )}
              </div>
            </div>

            {/* CTAs */}
            <div className={`hidden gap-3 lg:grid ${isExternalProduct ? "lg:grid-cols-1" : "lg:grid-cols-2"}`}>
              {!isExternalProduct && <button type="button" onClick={() => void addToCart(product.id, "add")} disabled={busyAction !== null || !canUseCta} className="rounded-2xl border px-5 py-3.5 text-sm font-black transition" style={{ borderColor: canUseCta ? RED : "#E5E7EB", color: canUseCta ? RED : "#9CA3AF", background: canUseCta ? "white" : "#F9FAFB" }}>
                {busyAction === "add" ? "A adicionar..." : !isReady ? "A preparar..." : canAdd ? "Adicionar ao carrinho" : "Sem stock"}
              </button>}
              <button type="button" onClick={() => void addToCart(product.id, "buy")} disabled={busyAction !== null || !canUseCta} className="rounded-2xl px-5 py-3.5 text-sm font-black text-white shadow-md transition hover:opacity-90" style={{ background: canUseCta ? RED : "#9CA3AF" }}>
                {isExternalProduct ? busyAction === "buy" ? (quoteRequired ? "A solicitar cotação..." : "A preparar encomenda...") : (quoteRequired ? "Solicitar cotação" : "Encomendar agora") : busyAction === "buy" ? "A processar..." : canAdd ? "Comprar agora" : "Indisponível"}
              </button>
            </div>

            {/* Trust badges */}
            <div className="grid grid-cols-3 gap-2 rounded-2xl border p-4" style={{ borderColor: "#F0F0F0", background: "#FAFAFA" }}>
              {[
                { icon: "🚚", title: "Entrega rápida", sub: "Maputo e arredores" },
                { icon: "🔒", title: "Pagamento seguro", sub: "M-Pesa · e-Mola" },
                { icon: "↩️", title: "7 dias", sub: "Devolução simples" },
              ].map((badge) => (
                <div key={badge.title} className="flex flex-col items-center gap-1 text-center">
                  <span className="text-xl">{badge.icon}</span>
                  <p className="text-xs font-bold" style={{ color: "#111827" }}>{badge.title}</p>
                  <p className="text-[10px] leading-tight" style={{ color: "#9CA3AF" }}>{badge.sub}</p>
                </div>
              ))}
            </div>

            {/* SKU / ref */}
            {productReference && (
              <p className="text-xs" style={{ color: "#9CA3AF" }}>
                Ref: <span className="font-mono font-semibold" style={{ color: "#6B7280" }}>{productReference}</span>
              </p>
            )}
          </div>
        </section>

        {/* ── Tabs ── */}
        <section className="rounded-3xl border bg-white shadow-sm" style={{ borderColor: "#F0F0F0" }}>
          <div className="flex gap-1 border-b p-2 overflow-x-auto" style={{ borderColor: "#F0F0F0" }}>
            {([
              { key: "description", label: "Descrição" },
              { key: "specs", label: "Especificações", count: specs.length + Object.keys(product.specifications ?? {}).length },
              { key: "delivery", label: "Entrega", hidden: !product.deliveryInfo && !product.warrantyInfo && !product.returnPolicy },
              { key: "guide", label: "Guia de uso", hidden: !product.usageGuide && !(product.packageItems?.length) },
              { key: "reviews", label: "Avaliações", count: totalReviews || undefined },
            ] as { key: typeof activeTab; label: string; count?: number; hidden?: boolean }[]).filter((t) => !t.hidden).map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className="flex shrink-0 items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-bold transition" style={{ background: active ? RED : "transparent", color: active ? "white" : "#6B7280" }}>
                  {tab.label}
                  {tab.count != null && tab.count > 0 && (
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none" style={{ background: active ? "rgba(255,255,255,0.25)" : "#F3F4F6", color: active ? "white" : "#6B7280" }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="p-6">
            {activeTab === "description" && (
              <div className="space-y-4">
                {product.shortDescription && (
                  <p className="text-base font-semibold leading-7" style={{ color: "#111827" }}>{product.shortDescription}</p>
                )}
                <div className="prose prose-sm max-w-none text-sm leading-7" style={{ color: "#4B5563" }}>
                  {product.description
                    ? product.description.split("\n").filter(Boolean).map((line, i) => <p key={i}>{line}</p>)
                    : <p className="italic" style={{ color: "#9CA3AF" }}>Sem descrição detalhada para este produto.</p>}
                </div>
                {product.madeToOrder && product.externalLink ? (
                  <a
                    href={product.externalLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-2xl border px-4 py-2.5 text-sm font-black transition hover:bg-orange-50"
                    style={{ borderColor: RED, color: RED }}
                  >
                    Ver produto no fornecedor
                  </a>
                ) : null}
                {product.packageItems && product.packageItems.length > 0 && (
                  <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: "#F0F0F0", background: "#FAFAFA" }}>
                    <p className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: "#374151" }}>Conteudo da caixa</p>
                    <ul className="space-y-1">
                      {product.packageItems.map((item, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm" style={{ color: "#4B5563" }}>
                          <span style={{ color: GREEN }}>✓</span> {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {activeTab === "specs" && (() => {
              const allSpecs = [...specs];
              if (product.specifications) {
                for (const [k, v] of Object.entries(product.specifications)) {
                  if (!allSpecs.find(([label]) => label === k)) {
                    allSpecs.push([k, v]);
                  }
                }
              }
              return allSpecs.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "#F0F0F0" }}>
                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      {allSpecs.map(([label, value], i) => (
                        <tr key={label} style={{ background: i % 2 === 0 ? "#FAFAFA" : "white" }}>
                          <td className="border-b px-5 py-3.5 font-semibold" style={{ borderColor: "#F0F0F0", color: "#374151", width: "35%" }}>{label}</td>
                          <td className="border-b px-5 py-3.5" style={{ borderColor: "#F0F0F0", color: "#6B7280" }}>{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="italic text-sm" style={{ color: "#9CA3AF" }}>Sem especificações disponíveis.</p>;
            })()}

            {activeTab === "delivery" && (
              <div className="space-y-6">
                {product.deliveryInfo && (
                  <RichSection title="Entrega" icon="🚚" content={product.deliveryInfo} />
                )}
                {product.warrantyInfo && (
                  <RichSection title="Garantia" icon="🛡️" content={product.warrantyInfo} />
                )}
                {product.returnPolicy && (
                  <RichSection title="Política de devolução" icon="↩️" content={product.returnPolicy} />
                )}
              </div>
            )}

            {activeTab === "guide" && (
              <div className="space-y-6">
                {product.usageGuide && (
                  <RichSection title="Guia de uso e cuidados" icon="📖" content={product.usageGuide} />
                )}
                {product.packageItems && product.packageItems.length > 0 && (
                  <div>
                    <p className="mb-3 text-sm font-bold" style={{ color: "#111827" }}>📦 Conteudo da caixa</p>
                    <ul className="space-y-1.5">
                      {product.packageItems.map((item, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm" style={{ color: "#4B5563" }}>
                          <span style={{ color: GREEN }}>✓</span> {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {activeTab === "reviews" && (
              <div className="space-y-6">
                {/* Rating summary */}
                {totalReviews > 0 && (
                  <div className="flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center" style={{ borderColor: "#F0F0F0", background: "#FAFAFA" }}>
                    <div className="flex flex-col items-center gap-1 sm:min-w-[100px]">
                      <span className="text-5xl font-black" style={{ color: "#111827" }}>{avgRating.toFixed(1)}</span>
                      <StarRow rating={avgRating} />
                      <p className="text-xs" style={{ color: "#9CA3AF" }}>{totalReviews} {totalReviews === 1 ? "avaliação" : "avaliações"}</p>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const count = reviews.filter((r) => Math.round(r.rating) === star).length;
                        const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
                        return (
                          <div key={star} className="flex items-center gap-2 text-xs">
                            <span className="w-3 text-right font-semibold" style={{ color: "#6B7280" }}>{star}</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="#F59E0B" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                              <div className="h-full rounded-full bg-yellow-400 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-6 text-right" style={{ color: "#9CA3AF" }}>{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {reviews.length === 0 ? (
                  <div className="rounded-2xl border border-dashed py-12 text-center" style={{ borderColor: "#E5E7EB" }}>
                    <p className="text-sm font-semibold" style={{ color: "#6B7280" }}>Ainda não há avaliações para este produto.</p>
                    <p className="mt-1 text-xs" style={{ color: "#9CA3AF" }}>Sê o primeiro a partilhar a tua experiência!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reviews.map((review, i) => (
                      <article key={`${review.id ?? review.reviewerName ?? "r"}-${i}`} className="rounded-2xl border p-5 transition hover:shadow-sm" style={{ borderColor: "#F0F0F0" }}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-sm font-black text-white" style={{ background: RED }}>
                              {(review.reviewerName || "C").slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-bold" style={{ color: "#111827" }}>{review.reviewerName || "Cliente"}</p>
                              <p className="text-xs" style={{ color: "#9CA3AF" }}>
                                {review.updatedAt || review.createdAt
                                  ? new Date(review.updatedAt || review.createdAt || "").toLocaleDateString("pt-PT", { year: "numeric", month: "short", day: "numeric" })
                                  : "Data não informada"}
                              </p>
                            </div>
                          </div>
                          <StarRow rating={review.rating} />
                        </div>
                        {review.comment && <p className="mt-3 text-sm leading-6" style={{ color: "#4B5563" }}>{review.comment}</p>}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Related products ── */}
        {related.length > 0 && (
          <section>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: RED }}>Também pode gostar</p>
                <h2 className="mt-1 text-xl font-black sm:text-2xl" style={{ color: "#111827", fontFamily: "'Sora', sans-serif" }}>Produtos relacionados</h2>
              </div>
              <Link href={source === "catalog" ? "/catalogo" : "/store"} className="rounded-full border px-4 py-2 text-sm font-bold transition hover:bg-gray-50" style={{ borderColor: "#E5E7EB", color: "#374151" }}>Ver todos</Link>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 sm:grid sm:overflow-visible sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 [&::-webkit-scrollbar]:hidden">
              {related.map((item) => {
                const img = resolveImages(item)[0] || "";
                const itemPrice = Number(item.finalPrice || 0);
                const itemOriginal = Number(item.originalPrice || 0);
                const itemDiscount = itemOriginal > itemPrice && itemPrice > 0 ? Math.round((1 - itemPrice / itemOriginal) * 100) : 0;
                const itemHref = source === "catalog" ? `/catalogo/${item.slug}` : `/store/${item.id}`;
                return (
                  <article key={item.id} className="flex w-44 flex-none flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md sm:w-auto" style={{ borderColor: "#F0F0F0" }}>
                    <Link href={itemHref} className="relative block bg-[#FAFAFA]">
                      {itemDiscount > 0 && <span className="absolute left-2 top-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-black text-white" style={{ background: RED }}>-{itemDiscount}%</span>}
                      <div className="relative flex h-36 items-center justify-center p-3">
                        {img
                          ? <Image
                              loader={passthroughImageLoader}
                              unoptimized
                              src={img}
                              alt={item.name}
                              fill
                              sizes="(max-width: 640px) 176px, 200px"
                              className="object-contain p-3"
                            />
                          : <PackageIcon />}
                      </div>
                    </Link>
                    <div className="flex flex-1 flex-col gap-2 p-3">
                      <Link href={itemHref} className="text-xs font-semibold leading-snug line-clamp-2 hover:underline" style={{ color: "#111827" }}>{item.name}</Link>
                      <div className="mt-auto">
                        <p className="text-sm font-black" style={{ color: RED }}>{formatMoney(itemPrice)}</p>
                        {itemOriginal > itemPrice && <p className="text-xs line-through" style={{ color: "#9CA3AF" }}>{formatMoney(itemOriginal)}</p>}
                      </div>
                      <button type="button" onClick={() => source === "catalog" ? router.push(itemHref) : void addToCart(item.id, "add", undefined, 1)} disabled={source !== "catalog" && (!isReady || busyAction !== null)} className="w-full rounded-xl py-2 text-xs font-black text-white transition hover:opacity-90 disabled:opacity-60" style={{ background: source === "catalog" || isReady ? RED : "#9CA3AF" }}>
                        {source === "catalog" ? "Ver produto" : !isReady ? "A preparar..." : "Adicionar"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* ── Sticky mobile CTA ── */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white px-4 py-3 shadow-xl lg:hidden" style={{ borderColor: "#F0F0F0" }}>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="line-clamp-1 text-xs font-semibold" style={{ color: "#6B7280" }}>{product.name}</p>
            <p className="text-base font-black" style={{ color: RED }}>{quoteRequired ? "Preço sob consulta" : formatMoney(price)}</p>
          </div>
          {!isExternalProduct && <button type="button" onClick={() => void addToCart(product.id, "add")} disabled={busyAction !== null || !canUseCta} className="flex-none rounded-xl border px-4 py-2.5 text-sm font-black transition" style={{ borderColor: canUseCta ? RED : "#E5E7EB", color: canUseCta ? RED : "#9CA3AF" }}>{busyAction === "add" || !isReady ? "..." : "Carrinho"}</button>}
          <button type="button" onClick={() => void addToCart(product.id, "buy")} disabled={busyAction !== null || !canUseCta} className="flex-none rounded-xl px-5 py-2.5 text-sm font-black text-white shadow transition hover:opacity-90" style={{ background: canUseCta ? RED : "#9CA3AF" }}>
            {isExternalProduct ? busyAction === "buy" ? (quoteRequired ? "A solicitar..." : "A preparar encomenda...") : (quoteRequired ? "Solicitar cotação" : "Encomendar agora") : busyAction === "buy" || !isReady ? "..." : "Comprar"}
          </button>
        </div>
      </div>
    </>
  );
}
