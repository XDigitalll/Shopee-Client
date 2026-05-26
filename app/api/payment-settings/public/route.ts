import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

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
