import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { WhatsappFloatingButton } from "@/components/support/whatsapp-floating-button";

export const metadata: Metadata = {
  title: {
    default: "ShopeeMz",
    template: "%s | ShopeeMz",
  },
  description: "Plataforma moçambicana de compras internacionais assistidas.",
  keywords: ["importação Moçambique", "compras online Moçambique", "Amazon Moçambique", "Shein Moçambique", "M-Pesa compras"],
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.png",
  },
  openGraph: {
    type: "website",
    locale: "pt_MZ",
    siteName: "ShopeeMz",
    title: "ShopeeMz",
    description: "Plataforma moçambicana de compras internacionais assistidas.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ShopeeMz",
    description: "Plataforma moçambicana de compras internacionais assistidas.",
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
        <AuthProvider>
          {children}
          <WhatsappFloatingButton />
        </AuthProvider>
      </body>
    </html>
  );
}
