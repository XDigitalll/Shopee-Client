import { SharedProductCard } from "@/components/products/shared-product-card";
import { catalogImage, type CatalogProduct } from "@/lib/catalog";

export function CatalogCard({ product }: { product: CatalogProduct }) {
  const merchandisingBadge = product.newProduct ? "Novo" : product.bestSeller ? "Mais vendido" : product.recommended ? "Recomendado" : null;
  return (
    <SharedProductCard
      href={`/catalogo/${product.slug}`}
      name={product.name}
      imageUrl={catalogImage(product)}
      price={Number(product.finalPrice)}
      badges={["Por encomenda", ...(merchandisingBadge ? [merchandisingBadge] : [])]}
      availability={`Prazo estimado: ${product.estimatedDeadline || "sob confirmação"}`}
      actionLabel="Ver produto"
    />
  );
}
