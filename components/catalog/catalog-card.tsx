import Image from "next/image";
import Link from "next/link";

import { CatalogBadge } from "@/components/catalog/catalog-badge";
import { CatalogOrderButton } from "@/components/catalog/catalog-order-button";
import { CatalogPrice } from "@/components/catalog/catalog-price";
import { catalogImage, type CatalogProduct } from "@/lib/catalog";

export function CatalogCard({ product }: { product: CatalogProduct }) {
  const image = catalogImage(product);
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[18px] border border-[#F2D4CC] bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[#E8431A] hover:shadow-[0_14px_30px_rgba(232,67,26,0.14)]">
      <Link href={`/catalogo/${product.slug}`} className="relative aspect-square bg-[#FFF8F5]">
        {image ? (
          <Image src={image} alt={product.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-contain p-3 transition group-hover:scale-105" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-400">Sem imagem</div>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {product.badges?.slice(0, 2).map((badge) => <CatalogBadge key={badge} label={badge} />)}
        </div>
        <Link href={`/catalogo/${product.slug}`} className="line-clamp-2 min-h-10 text-sm font-black leading-5 text-[#1A1410] hover:text-[#E8431A]">
          {product.name}
        </Link>
        <p className="mt-1 truncate text-xs font-semibold text-slate-500">
          {[product.category?.name, product.brand?.name].filter(Boolean).join(" · ") || "Escolhas da ShopeeMz"}
        </p>
        <div className="mt-auto pt-3">
          <CatalogPrice value={product.finalPrice} />
          <p className="mt-1 text-xs font-semibold text-slate-500">{product.estimatedDeadline || "Prazo sob confirmacao"}</p>
          <div className="mt-3">
            <CatalogOrderButton product={product} compact />
          </div>
        </div>
      </div>
    </article>
  );
}
