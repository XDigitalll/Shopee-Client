import { NextRequest, NextResponse } from "next/server";
import { BACKEND_ACCESS_COOKIE, SESSION_COOKIE } from "@/lib/session";
import { XSRF_HEADER } from "@/lib/csrf";

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
  const cookie = request.headers.get("cookie");
  const csrfToken = request.headers.get(XSRF_HEADER.toLowerCase()) ?? request.headers.get(XSRF_HEADER);
  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value || request.cookies.get(BACKEND_ACCESS_COOKIE)?.value;

  if (cookieToken) {
    headers.set("Authorization", `Bearer ${cookieToken}`);
  }
  if (cookie) {
    headers.set("Cookie", cookie);
  }
  if (csrfToken) {
    headers.set(XSRF_HEADER, csrfToken);
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
