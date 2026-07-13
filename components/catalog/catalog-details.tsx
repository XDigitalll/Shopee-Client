import { CatalogBadge } from "@/components/catalog/catalog-badge";
import { CatalogOrderButton } from "@/components/catalog/catalog-order-button";
import { CatalogPrice } from "@/components/catalog/catalog-price";
import type { CatalogProduct } from "@/lib/catalog";

export function CatalogDetails({ product }: { product: CatalogProduct }) {
  const specs = Object.entries(product.specifications || {});
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">{product.badges?.map((badge) => <CatalogBadge key={badge} label={badge} />)}</div>
      <div>
        <p className="text-sm font-bold text-slate-500">{[product.brand?.name, product.category?.name].filter(Boolean).join(" · ") || "Escolhas da ShopeeMz"}</p>
        <h1 className="mt-2 font-[family-name:var(--font-sora)] text-3xl font-black leading-tight text-[#1A1410]">{product.name}</h1>
      </div>
      <CatalogPrice value={product.finalPrice} />
      <p className="rounded-2xl bg-[#FFF0EC] px-4 py-3 text-sm font-bold text-[#9A3412]">
        O preco ja inclui produto, importacao, taxas e entrega.
      </p>
      <p className="text-sm font-semibold text-slate-600">{product.estimatedDeadline || "Prazo estimado sob confirmacao"}</p>
      {product.description ? <p className="leading-7 text-slate-700">{product.description}</p> : null}
      <CatalogOrderButton product={product} />
      {specs.length > 0 ? (
        <div className="rounded-2xl border border-[#F2D4CC] bg-white p-4">
          <h2 className="font-[family-name:var(--font-sora)] text-lg font-black text-[#1A1410]">Especificacoes</h2>
          <dl className="mt-3 divide-y divide-slate-100">
            {specs.map(([key, value]) => (
              <div key={key} className="grid grid-cols-[120px_1fr] gap-3 py-2 text-sm">
                <dt className="font-bold text-slate-500">{key}</dt>
                <dd className="text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
