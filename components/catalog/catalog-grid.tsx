import { CatalogCard } from "@/components/catalog/catalog-card";
import type { CatalogProduct } from "@/lib/catalog";

export function CatalogGrid({ products }: { products: CatalogProduct[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => <CatalogCard key={product.id} product={product} />)}
    </div>
  );
}
