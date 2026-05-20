import Link from "next/link";

type EmptyStateProps = {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
  onCta?: () => void;
  icon?: React.ReactNode;
};

function DefaultIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect width="48" height="48" rx="24" fill="#FFF0EC" />
      <path d="M24 14v10m0 4v2" stroke="#E8431A" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function EmptyStateShell({ title, description, ctaLabel, ctaHref, onCta, icon }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center rounded-[28px] border bg-white px-6 py-12 text-center shadow-sm"
      style={{ borderColor: "#F2D4CC" }}
    >
      <div className="mb-4">{icon ?? <DefaultIcon />}</div>
      <h2
        className="text-lg font-black"
        style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}
      >
        {title}
      </h2>
      <p className="mt-2 max-w-xs text-sm leading-6" style={{ color: "#6B7280" }}>
        {description}
      </p>
      {ctaLabel && ctaHref ? (
        <Link
          href={ctaHref}
          className="mt-6 inline-flex rounded-2xl px-5 py-3 text-sm font-black text-white"
          style={{ background: "#E8431A", fontFamily: "'Sora', sans-serif" }}
        >
          {ctaLabel}
        </Link>
      ) : ctaLabel && onCta ? (
        <button
          type="button"
          onClick={onCta}
          className="mt-6 inline-flex rounded-2xl px-5 py-3 text-sm font-black text-white"
          style={{ background: "#E8431A", fontFamily: "'Sora', sans-serif" }}
        >
          {ctaLabel}
        </button>
      ) : null}
    </div>
  );
}

// ─── Domain-specific empty states ────────────────────────────────────────────

export function EmptyOrders() {
  return (
    <EmptyStateShell
      icon={
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
          <rect width="56" height="56" rx="28" fill="#FFF0EC" />
          <path d="M18 22h20M18 28h14M18 34h8" stroke="#E8431A" strokeWidth="2" strokeLinecap="round" />
          <rect x="32" y="30" width="10" height="10" rx="2" stroke="#E8431A" strokeWidth="2" />
        </svg>
      }
      title="Ainda não tens pedidos"
      description="Quando fizeres a tua primeira compra, ela vai aparecer aqui para acompanhares."
      ctaLabel="Explorar produtos"
      ctaHref="/store"
    />
  );
}

export function EmptyCart() {
  return (
    <EmptyStateShell
      icon={
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
          <rect width="56" height="56" rx="28" fill="#FFF0EC" />
          <path d="M16 18h3l3 12h14l3-9H22" stroke="#E8431A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="28" cy="34" r="2" fill="#E8431A" />
          <circle cx="35" cy="34" r="2" fill="#E8431A" />
        </svg>
      }
      title="O teu carrinho está vazio"
      description="Adiciona produtos ao carrinho para avançar para o checkout."
      ctaLabel="Ver produtos"
      ctaHref="/store"
    />
  );
}

export function EmptyNotifications() {
  return (
    <EmptyStateShell
      icon={
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
          <rect width="56" height="56" rx="28" fill="#FFF0EC" />
          <path d="M28 18a7 7 0 0 1 7 7v4l2 3H19l2-3v-4a7 7 0 0 1 7-7Z" stroke="#E8431A" strokeWidth="2" strokeLinejoin="round" />
          <path d="M25 32v1a3 3 0 0 0 6 0v-1" stroke="#E8431A" strokeWidth="2" strokeLinecap="round" />
        </svg>
      }
      title="Sem novidades por agora"
      description="Quando houver atualizações sobre os teus pedidos, vais ser notificado aqui."
    />
  );
}

export function EmptyAddresses() {
  return (
    <EmptyStateShell
      icon={
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
          <rect width="56" height="56" rx="28" fill="#FFF0EC" />
          <path d="M28 18c-4.4 0-8 3.6-8 8 0 5.5 8 14 8 14s8-8.5 8-14c0-4.4-3.6-8-8-8Z" stroke="#E8431A" strokeWidth="2" />
          <circle cx="28" cy="26" r="2.5" stroke="#E8431A" strokeWidth="2" />
        </svg>
      }
      title="Nenhuma morada guardada"
      description="Guarda a tua morada para o checkout ficar pré-preenchido nas próximas compras."
    />
  );
}

export function EmptySearch({ query }: { query?: string }) {
  return (
    <EmptyStateShell
      icon={
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
          <rect width="56" height="56" rx="28" fill="#FFF0EC" />
          <circle cx="26" cy="26" r="7" stroke="#E8431A" strokeWidth="2" />
          <path d="M31 31l5 5" stroke="#E8431A" strokeWidth="2" strokeLinecap="round" />
          <path d="M23 26h6M26 23v6" stroke="#E8431A" strokeWidth="2" strokeLinecap="round" />
        </svg>
      }
      title={query ? `Sem resultados para "${query}"` : "Nenhum resultado encontrado"}
      description="Tenta outros termos ou navega pelas categorias disponíveis."
      ctaLabel="Ver todos os produtos"
      ctaHref="/store"
    />
  );
}

export function EmptyOrderHistory() {
  return (
    <EmptyStateShell
      icon={
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
          <rect width="56" height="56" rx="28" fill="#FFF0EC" />
          <circle cx="28" cy="28" r="9" stroke="#E8431A" strokeWidth="2" />
          <path d="M28 23v5l3 3" stroke="#E8431A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      }
      title="Sem histórico ainda"
      description="Os teus pedidos anteriores vão aparecer aqui quando tiveres actividade."
      ctaLabel="Fazer uma compra"
      ctaHref="/store"
    />
  );
}

export function EmptyGeneric({ title = "Nada por aqui", description = "Não há informação disponível de momento." }: Partial<EmptyStateProps>) {
  return <EmptyStateShell title={title} description={description} />;
}
