import { apiFetch } from "@/lib/api-client";

export type CatalogTaxonomy = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  active: boolean;
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
  finalPrice: number;
  estimatedDeadline?: string | null;
  featured: boolean;
  promotionActive: boolean;
  newProduct: boolean;
  bestSeller: boolean;
  recommended: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  specifications?: Record<string, string>;
  images: CatalogImage[];
  badges: string[];
};

export type CatalogPage<T> = {
  content: T[];
  number?: number;
  totalPages: number;
  totalElements: number;
};

export function catalogImage(product: CatalogProduct) {
  const primary = product.images?.find((image) => image.primaryImage) || product.images?.[0];
  return primary?.thumbnailUrl || primary?.originalUrl || "";
}

export function catalogOrderHref(product: CatalogProduct) {
  const params = new URLSearchParams({
    input: product.name,
    store: "OTHER",
    catalogSlug: product.slug,
  });
  const details = [
    product.brand?.name ? `Marca: ${product.brand.name}` : null,
    product.category?.name ? `Categoria: ${product.category.name}` : null,
    product.estimatedDeadline ? `Prazo estimado: ${product.estimatedDeadline}` : null,
  ].filter(Boolean).join(" | ");
  if (details) params.set("variant", details);
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
