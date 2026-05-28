import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getBackendUrl } from "@/lib/server/backend-url";

type Props = {
  params: Promise<{ id: string }>;
};

async function fetchProduct(id: string) {
  const backendUrl = getBackendUrl();
  try {
    const response = await fetch(`${backendUrl}/api/products/${id}`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    return response.json() as Promise<{
      name?: string;
      description?: string;
      primaryThumbnailUrl?: string;
      primaryImageUrl?: string;
      gallery?: Array<{ thumbnailUrl?: string; originalUrl?: string }>;
    }>;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await fetchProduct(id);

  if (!product) {
    return {
      title: "Produto",
      description: "Detalhes do produto no ShopeeMz.",
    };
  }

  const title = product.name ?? "Produto";
  const description = product.description
    ? product.description.slice(0, 155)
    : `Compra ${title} no ShopeeMz e recebe em Moçambique. Cotação em 24h.`;
  const image =
    product.primaryThumbnailUrl ||
    product.primaryImageUrl ||
    product.gallery?.[0]?.thumbnailUrl ||
    product.gallery?.[0]?.originalUrl;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | ShopeeMz`,
      description,
      type: "website",
      ...(image ? { images: [{ url: image, alt: title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ShopeeMz`,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default function ProductLayout({ children }: { children: ReactNode }) {
  return children;
}
