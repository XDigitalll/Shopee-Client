import { apiFetch } from "@/lib/api-client";

export type CatalogTaxonomy = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: number | null;
  parentName?: string | null;
  parentSlug?: string | null;
  active: boolean;
  specificationTemplate?: string | null;
};

export type CatalogImage = {
  id: number;
  originalUrl: string;
  thumbnailUrl: string;
  displayOrder: number;
  primaryImage: boolean;
  altText?: string | null;
};

export type CatalogProduct = {
  id: number;
  name: string;
  slug: string;
  shortDescription?: string | null;
  description?: string | null;
  category?: CatalogTaxonomy | null;
  brand?: CatalogTaxonomy | null;
  supplierLink?: string | null;
  supplierLinkVisibleToCustomer?: boolean;
  finalPrice?: number | null;
  pricingMode?: "FIXED_PRICE" | "QUOTE_REQUIRED" | null;
  quoteMessage?: string | null;
  quoteResponseDeadline?: string | null;
  estimatedDeadline?: string | null;
  estimatedDeliveryTime?: string | null;
  featured: boolean;
  promotionActive: boolean;
  newProduct: boolean;
  bestSeller: boolean;
  recommended: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  specifications?: Record<string, string>;
  variants?: CatalogProductVariantDefinition[];
  images: CatalogImage[];
  badges: string[];
};

export type CatalogProductVariantDefinition = {
  key: string;
  label: string;
  required: boolean;
  values: string[];
  options?: Array<{ value: string; price?: number | null; imageUrl?: string | null; available?: boolean | null; stock?: number | null }>;
};

export type CatalogPage<T> = {
  content: T[];
  number?: number;
  totalPages: number;
  totalElements: number;
};

export type CatalogPerfumePromotion = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  promotionType: "BUNDLE_PICK" | string;
  choiceQuantity: number;
  bundlePrice: number;
  fixedVolume: string;
  allowRepeats: boolean;
  maxPerCustomer?: number | null;
  participants: Array<{ productId: number; volume: string }>;
  startsAt?: string | null;
  endsAt?: string | null;
  imageUrl?: string | null;
  active: boolean;
};

export function catalogImage(product: CatalogProduct) {
  const primary = product.images?.find((image) => image.primaryImage) || product.images?.[0];
  return primary?.thumbnailUrl || primary?.originalUrl || "";
}

export function catalogEstimatedDeliveryTime(product: CatalogProduct) {
  return product.estimatedDeliveryTime || product.estimatedDeadline || "Sob confirmação";
}

export function catalogOrderHref(product: CatalogProduct, selectedVariants: Record<string, string> = {}, quantity = 1) {
  const params = new URLSearchParams({
    input: product.name,
    store: "OTHER",
    catalogSlug: product.slug,
    quantity: String(Math.max(1, Math.min(20, Math.floor(Number(quantity) || 1)))),
  });
  const details = [
    product.brand?.name ? `Marca: ${product.brand.name}` : null,
    product.category?.name ? `Categoria: ${product.category.name}` : null,
    `Prazo estimado: ${catalogEstimatedDeliveryTime(product)}`,
  ].filter(Boolean).join(" | ");
  if (details) params.set("variant", details);
  const selectedVariantEntries = Object.entries(selectedVariants).filter(([, value]) => value.trim());
  if (selectedVariantEntries.length) {
    params.set("selectedVariants", JSON.stringify(Object.fromEntries(selectedVariantEntries)));
  }
  return `/orders/external/new?${params.toString()}`;
}

export function fetchCatalogProducts(params: URLSearchParams) {
  return apiFetch<CatalogPage<CatalogProduct>>(`catalog/products?${params.toString()}`);
}

export function fetchFeaturedCatalogProducts(size = 8) {
  return apiFetch<CatalogPage<CatalogProduct>>(`catalog/products/featured?page=0&size=${size}`);
}

export function fetchCatalogProduct(slug: string) {
  return apiFetch<CatalogProduct>(`catalog/products/${slug}`);
}

export function fetchRelatedCatalogProducts(slug: string, size = 8) {
  return apiFetch<CatalogPage<CatalogProduct>>(`catalog/products/${slug}/related?size=${size}`);
}

export function fetchCatalogCategories() {
  return apiFetch<CatalogTaxonomy[]>("catalog/categories");
}

export function fetchCatalogBrands() {
  return apiFetch<CatalogTaxonomy[]>("catalog/brands");
}

export function fetchPerfumePromotions() {
  return apiFetch<CatalogPerfumePromotion[]>("catalog/perfume-promotions");
}

export function fetchPerfumePromotion(slug: string) {
  return apiFetch<CatalogPerfumePromotion>(`catalog/perfume-promotions/${slug}`);
}
