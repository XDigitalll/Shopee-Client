import { NextRequest, NextResponse } from "next/server";
import { BACKEND_ACCESS_COOKIE, SESSION_COOKIE } from "@/lib/session";
import { XSRF_COOKIE, XSRF_HEADER } from "@/lib/csrf";
import { forwardNamedSetCookies } from "@/lib/proxy-cookies";

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
  if (message && /csrf|xsrf|token.*invalid|token.*missing|csrf.*invalido|csrf.*ausente/i.test(message)) {
    return "A validação de segurança expirou. Atualiza a página e tenta novamente.";
  }
  if (message && /acesso negado.*pedido|pedido.*nao pertence|pedido.*não pertence/i.test(message)) {
    return "Este pedido não pertence à tua conta.";
  }
  if (message && /nao esta pronto|não está pronto|estado.*pagamento|ja foi pago|já foi pago/i.test(message)) {
    return message;
  }
  if (message && /conta.*dados|telefone.*email|email.*telefone/i.test(message)) {
    return "Não foi possível submeter o pagamento nesta sessão. Confirma que continuas autenticado e tenta novamente.";
  }
  return message ?? "Não foi possível submeter o pagamento.";
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { orderId } = await context.params;
  const backendUrl = `${BACKEND_URL}/api/payments/${encodeURIComponent(orderId)}/submit`;
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  const xsrfCookieValue = request.cookies.get(XSRF_COOKIE)?.value;
  const csrfToken = request.headers.get(XSRF_HEADER.toLowerCase()) ?? request.headers.get(XSRF_HEADER) ?? xsrfCookieValue;
  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value || request.cookies.get(BACKEND_ACCESS_COOKIE)?.value;

  if (cookieToken) {
    headers.set("Authorization", `Bearer ${cookieToken}`);
  }
  if (cookie) {
    headers.set("Cookie", cookie);
  }
  if (xsrfCookieValue && !headers.get("Cookie")?.includes(`${XSRF_COOKIE}=`)) {
    const existingCookie = headers.get("Cookie") ?? "";
    const xsrfCookiePair = `${XSRF_COOKIE}=${xsrfCookieValue}`;
    headers.set("Cookie", existingCookie ? `${existingCookie}; ${xsrfCookiePair}` : xsrfCookiePair);
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
    if (process.env.NODE_ENV !== "production") {
      console.warn("[payments-submit]", {
        status: backendResponse.status,
        endpoint: `/api/payments/${orderId}/submit`,
        hasAuthCookie: Boolean(cookieToken),
        hasXsrfCookie: Boolean(xsrfCookieValue),
        hasXsrfHeader: Boolean(csrfToken),
      });
    }
    return NextResponse.json(
      { message: paymentSubmitErrorMessage(payload) },
      { status: backendResponse.status }
    );
  }

  const nextResponse = NextResponse.json(payload);
  forwardNamedSetCookies(nextResponse, backendResponse.headers, [XSRF_COOKIE]);
  return nextResponse;
}
