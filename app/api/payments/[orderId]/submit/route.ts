import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

type RouteContext = {
  params: Promise<{
    orderId: string;
  }>;
};

function apiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  if (typeof record.error === "string" && record.error.trim()) return record.error;
  return null;
}

function paymentSubmitErrorMessage(payload: unknown) {
  const message = apiErrorMessage(payload);
  if (message && /conta.*dados|telefone.*email|email.*telefone/i.test(message)) {
    return "Nao foi possivel submeter o pagamento nesta sessao. Confirma que continuas autenticado e tenta novamente.";
  }
  return message ?? "Nao foi possivel submeter o pagamento.";
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { orderId } = await context.params;
  const backendUrl = `${BACKEND_URL}/api/payments/${encodeURIComponent(orderId)}/submit`;
  const headers = new Headers();
  const authorization = request.headers.get("authorization");
  const cookie = request.headers.get("cookie");

  if (authorization) {
    headers.set("Authorization", authorization);
  }
  if (cookie) {
    headers.set("Cookie", cookie);
  }

  let backendResponse: Response;
  try {
    const formData = await request.formData();
    backendResponse = await fetch(backendUrl, {
      method: "POST",
      headers,
      body: formData,
      cache: "no-store",
    });
  } catch (error) {
    console.error("[payments-submit] Backend unreachable:", backendUrl, error);
    return NextResponse.json(
      { message: "Backend inacessivel. Confirma se o servidor esta a correr." },
      { status: 502 }
    );
  }

  const payload = await backendResponse.json().catch(() => null);

  if (!backendResponse.ok) {
    return NextResponse.json(
      { message: paymentSubmitErrorMessage(payload) },
      { status: backendResponse.status }
    );
  }

  return NextResponse.json(payload);
}
