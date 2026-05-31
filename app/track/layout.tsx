import type { Metadata } from "next";
import type { ReactNode } from "react";

// Tracking pages contain order-specific data and must never be indexed.
// This layout overrides the root robots metadata for all /track/* routes.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default function TrackLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
