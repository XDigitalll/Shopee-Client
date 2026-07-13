export function CatalogPrice({ value }: { value: number }) {
  return (
    <span className="font-[family-name:var(--font-sora)] text-lg font-black text-[#1A1410]">
      {new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN", maximumFractionDigits: 0 }).format(Number(value || 0))}
    </span>
  );
}
