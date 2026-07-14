export function CatalogBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#FFF0EC] px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#E8431A]">
      {label}
    </span>
  );
}
