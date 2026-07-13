import type { CatalogTaxonomy } from "@/lib/catalog";

export type CatalogFilterState = {
  search: string;
  category: string;
  brand: string;
  promotion: boolean;
  bestSeller: boolean;
  newProduct: boolean;
};

export function CatalogFilters({
  filters,
  categories,
  brands,
  onChange,
  onSubmit,
}: {
  filters: CatalogFilterState;
  categories: CatalogTaxonomy[];
  brands: CatalogTaxonomy[];
  onChange: (filters: CatalogFilterState) => void;
  onSubmit: () => void;
}) {
  return (
    <form className="grid gap-3 rounded-2xl border border-[#F2D4CC] bg-white p-4 shadow-sm md:grid-cols-[1.5fr_1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <input className="rounded-2xl border border-[#F2D4CC] px-4 py-3 text-sm outline-none focus:border-[#E8431A]" value={filters.search} onChange={(event) => onChange({ ...filters, search: event.target.value })} placeholder="Pesquisar por nome, marca ou fornecedor" />
      <select className="rounded-2xl border border-[#F2D4CC] px-4 py-3 text-sm outline-none focus:border-[#E8431A]" value={filters.category} onChange={(event) => onChange({ ...filters, category: event.target.value })}>
        <option value="">Categorias</option>
        {categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
      </select>
      <select className="rounded-2xl border border-[#F2D4CC] px-4 py-3 text-sm outline-none focus:border-[#E8431A]" value={filters.brand} onChange={(event) => onChange({ ...filters, brand: event.target.value })}>
        <option value="">Marcas</option>
        {brands.map((brand) => <option key={brand.id} value={brand.slug}>{brand.name}</option>)}
      </select>
      <button className="rounded-2xl bg-[#E8431A] px-5 py-3 text-sm font-black text-white" type="submit">Filtrar</button>
      <div className="flex flex-wrap gap-3 md:col-span-4">
        {[
          ["promotion", "Promocao"],
          ["bestSeller", "Mais vendidos"],
          ["newProduct", "Novos"],
        ].map(([key, label]) => (
          <label key={key} className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={Boolean(filters[key as keyof CatalogFilterState])} onChange={(event) => onChange({ ...filters, [key]: event.target.checked })} />
            {label}
          </label>
        ))}
      </div>
    </form>
  );
}
