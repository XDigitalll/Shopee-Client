import Link from "next/link";

import { catalogOrderHref, type CatalogProduct } from "@/lib/catalog";

export function CatalogOrderButton({ product, compact = false }: { product: CatalogProduct; compact?: boolean }) {
  return (
    <Link
      href={catalogOrderHref(product)}
      className={`inline-flex items-center justify-center rounded-2xl bg-[#E8431A] font-black text-white transition hover:bg-[#CC3315] ${compact ? "px-3 py-2 text-xs" : "px-5 py-3 text-sm"}`}
    >
      {compact ? "Encomendar" : "Encomendar Agora"}
    </Link>
  );
}
