import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";

export const metadata: Metadata = {
  title: {
    default: "ShopeeX Digital — Importação para Moçambique",
    template: "%s | ShopeeX Digital",
  },
  description: "Compra nas melhores lojas internacionais — Amazon, Shein, Temu, AliExpress — e recebe em Moçambique. Cotações em 24h, pagamento via M-Pesa e e-Mola.",
  keywords: ["importação Moçambique", "compras online Moçambique", "Amazon Moçambique", "Shein Moçambique", "M-Pesa compras"],
  openGraph: {
    type: "website",
    locale: "pt_MZ",
    siteName: "ShopeeX Digital",
    title: "ShopeeX Digital — Importação para Moçambique",
    description: "Compra nas melhores lojas internacionais e recebe em Moçambique. Cotações em 24h.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ShopeeX Digital — Importação para Moçambique",
    description: "Compra nas melhores lojas internacionais e recebe em Moçambique. Cotações em 24h.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
