"use client";

import Image from "next/image";
import { useState } from "react";

import type { CatalogProduct } from "@/lib/catalog";

export function CatalogGallery({ product }: { product: CatalogProduct }) {
  const images = product.images?.length ? product.images : [];
  const [active, setActive] = useState(images.find((image) => image.primaryImage)?.id || images[0]?.id || 0);
  const selected = images.find((image) => image.id === active) || images[0];

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-[18px] border border-[#F2D4CC] bg-white">
        {selected ? (
          <Image src={selected.originalUrl || selected.thumbnailUrl} alt={selected.altText || product.name} fill className="object-contain p-4" unoptimized priority />
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">Sem imagem</div>
        )}
      </div>
      {images.length > 1 ? (
        <div className="grid grid-cols-5 gap-2">
          {images.map((image) => (
            <button key={image.id} type="button" onClick={() => setActive(image.id)} className={`relative aspect-square overflow-hidden rounded-xl border bg-white ${active === image.id ? "border-[#E8431A]" : "border-[#F2D4CC]"}`}>
              <Image src={image.thumbnailUrl || image.originalUrl} alt={image.altText || product.name} fill className="object-contain p-1.5" unoptimized />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
