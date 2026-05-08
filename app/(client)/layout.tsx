import { ReactNode } from "react";
import { ClientShell } from "@/components/client-shell";

export default function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <ClientShell>{children}</ClientShell>;
}
