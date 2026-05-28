import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/server/backend-url";

const BACKEND_URL = getBackendUrl();

export async function GET() {
  const response = await fetch(`${BACKEND_URL}/api/payment-settings/public`, {
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json(
      { message: "Pagamentos temporariamente indisponiveis. Contacte suporte." },
      { status: response.status }
    );
  }

  return NextResponse.json(payload ?? []);
}
