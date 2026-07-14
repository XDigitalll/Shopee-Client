import Link from "next/link";
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP_LABEL, SUPPORT_WHATSAPP_URL } from "@/lib/support-contacts";

const RED = "#E8431A";
const DARK = "#1A1410";

const platformLinks = [
  { href: "/", label: "Página inicial" },
  { href: "/store", label: "Loja" },
  { href: "/cart", label: "Carrinho" },
  { href: "/orders", label: "Os meus pedidos" },
  { href: "/orders/external/new", label: "Comprar do estrangeiro" },
];

const supportLinks = [
  { href: "/how-it-works", label: "Como funciona" },
  { href: "/privacy", label: "Política de Privacidade" },
  { href: "/terms", label: "Termos" },
  { href: "/refunds", label: "Reembolsos" },
  { href: "/delivery-policy", label: "Entrega" },
  { href: "/contact", label: "Contacto" },
];

export function SiteFooter() {
  return (
    <footer style={{ background: DARK, color: "rgba(255,255,255,0.65)", fontFamily: "'DM Sans', sans-serif" }}>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="mb-10 grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div>
            <Link href="/" className="mb-3 inline-block text-lg font-black text-white" style={{ fontFamily: "'Sora', sans-serif" }}>
              ShopeeMz
            </Link>
            <p className="text-xs leading-6">
              Plataforma de importação intermediária para o mercado moçambicano, ligada a todas as áreas do cliente.
            </p>
          </div>

          <div>
            <p className="mb-3 text-sm font-bold text-white">Plataforma</p>
            <ul className="space-y-2 text-xs">
              {platformLinks.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="transition-colors hover:text-white">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-3 text-sm font-bold text-white">Atalhos</p>
            <ul className="space-y-2 text-xs">
              {supportLinks.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="transition-colors hover:text-white">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-3 text-sm font-bold text-white">Contacto</p>
            <ul className="space-y-2 text-xs">
              <li>Maputo, Moçambique</li>
              <li>
                <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-white">
                  WhatsApp: {SUPPORT_WHATSAPP_LABEL}
                </a>
              </li>
              <li>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="transition-colors hover:text-white">
                  Email: {SUPPORT_EMAIL}
                </a>
              </li>
              <li>Seg-Sex, 8h-18h</li>
            </ul>
          </div>
        </div>

        <div className="mb-6 border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }} />

        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-xs">© 2026 ShopeeMz. Todos os direitos reservados.</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {["M-Pesa", "e-Mola", "Visa"].map((method) => (
              <span
                key={method}
                className="rounded-lg px-3 py-1.5 text-xs font-bold"
                style={{ background: "rgba(255,255,255,0.1)", color: "white" }}
              >
                {method}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}


