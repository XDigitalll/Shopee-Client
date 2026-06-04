import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/server/backend-url";

const BACKEND_URL = getBackendUrl();

function getErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message;
  }

  if (record.messages && typeof record.messages === "object") {
    const firstValidationMessage = Object.values(
      record.messages as Record<string, unknown>
    ).find((value) => typeof value === "string" && value.trim());

    if (typeof firstValidationMessage === "string") {
      return firstValidationMessage;
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
    };

    const response = await fetch(`${BACKEND_URL}/auth/forgot-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: body.email?.trim(),
      }),
      cache: "no-store",
    });

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        {
          message: getErrorMessage(payload) || "Falha ao enviar o pedido de recuperacao.",
        },
        { status: response.status }
      );
    }

    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[auth/forgot-password] service unavailable", error);
    }
    return NextResponse.json(
      {
        message:
          "Estamos com dificuldade em ligar ao serviço. Tenta novamente dentro de instantes.",
      },
      { status: 502 }
    );
  }
}
