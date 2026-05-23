import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Catálogo de Produtos",
  description: "Explora o nosso catálogo de produtos disponíveis para importação. Electrónica, moda, beleza, casa e muito mais — entregues em Moçambique.",
  openGraph: {
    title: "Catálogo de Produtos | ShopeeMz",
    description: "Explora o nosso catálogo de produtos disponíveis para importação e entrega em Moçambique.",
    type: "website",
  },
};

export default function StoreLayout({ children }: { children: ReactNode }) {
  return children;
}
