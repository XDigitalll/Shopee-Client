import Link from "next/link";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";

type LegalSection = {
  title: string;
  body?: string;
  bodyLines?: string[];
  items?: string[];
};

type LegalPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  updatedAt?: string;
  sections: LegalSection[];
  cta?: {
    label: string;
    href: string;
  };
};

const RED = "#E8431A";
const TEXT = "#1A1410";
const MUTED = "#6B7280";
const BORDER = "#F2D4CC";
const SOFT = "#FFF8F5";

export function LegalPage({ eyebrow, title, description, updatedAt, sections, cta }: LegalPageProps) {
  return (
    <>
      <main className="min-h-screen bg-[#FFF8F5] px-4 py-6 text-[#1A1410] sm:px-6 lg:py-10">
        <div className="mx-auto w-full max-w-5xl">
          <header className="mb-6 flex items-center justify-between gap-4">
            <Link href="/" className="inline-flex">
              <Logo size="md" />
            </Link>
            <Link
              href="/orders/external/new"
              className="rounded-2xl px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:opacity-90"
              style={{ background: RED }}
            >
              Fazer pedido
            </Link>
          </header>

          <section className="rounded-[28px] border bg-white p-6 shadow-[0_24px_80px_rgba(80,34,14,0.08)] sm:p-8 lg:p-10" style={{ borderColor: BORDER }}>
            <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: RED }}>
              {eyebrow}
            </p>
            <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_220px] lg:items-end">
              <div>
                <h1 className="text-3xl font-black leading-tight sm:text-4xl lg:text-5xl" style={{ color: TEXT }}>
                  {title}
                </h1>
                <p className="mt-4 max-w-3xl text-sm leading-7 sm:text-base" style={{ color: MUTED }}>
                  {description}
                </p>
              </div>
              {updatedAt ? (
                <div className="rounded-2xl border px-4 py-3 text-xs font-bold leading-5" style={{ borderColor: BORDER, background: SOFT, color: MUTED }}>
                  Ultima actualizacao<br />
                  <span style={{ color: TEXT }}>{updatedAt}</span>
                </div>
              ) : null}
            </div>
          </section>

          <div className="mt-5 grid gap-4">
            {sections.map((section) => (
              <section key={section.title} className="rounded-[24px] border bg-white p-5 shadow-sm sm:p-6" style={{ borderColor: BORDER }}>
                <h2 className="text-lg font-black sm:text-xl" style={{ color: TEXT }}>
                  {section.title}
                </h2>
                {section.body ? (
                  <p className="mt-3 text-sm leading-7" style={{ color: MUTED }}>
                    {section.body}
                  </p>
                ) : null}
                {section.bodyLines && section.bodyLines.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {section.bodyLines.map((line, i) => (
                      <p key={i} className="text-sm leading-7" style={{ color: MUTED }}>{line}</p>
                    ))}
                  </div>
                ) : null}
                {section.items ? (
                  <ul className="mt-4 grid gap-2 text-sm leading-6" style={{ color: MUTED }}>
                    {section.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: RED }} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>

          <section className="mt-5 rounded-[24px] border p-5 sm:p-6" style={{ borderColor: "#F8C7B8", background: "#FFF0EC" }}>
            <h2 className="text-lg font-black" style={{ color: TEXT }}>Precisas de ajuda?</h2>
            <p className="mt-2 text-sm leading-7" style={{ color: MUTED }}>
              A equipa ShopeeMz pode esclarecer dúvidas sobre pedidos, pagamentos, privacidade e dados da tua conta.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/contact" className="rounded-2xl px-4 py-2.5 text-sm font-black text-white" style={{ background: RED }}>
                Contactar suporte
              </Link>
              {cta ? (
                <Link href={cta.href} className="rounded-2xl border bg-white px-4 py-2.5 text-sm font-black" style={{ borderColor: BORDER, color: RED }}>
                  {cta.label}
                </Link>
              ) : null}
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
