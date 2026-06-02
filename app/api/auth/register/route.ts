import { NextResponse } from "next/server";
import {
  setClientAuthCookies,
} from "@/lib/session";
import { XSRF_COOKIE } from "@/lib/csrf";
import { forwardNamedSetCookies } from "@/lib/proxy-cookies";
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
      firstName?: string;
      lastName?: string;
      identifier?: string;
      email?: string;
      phone?: string;
      password?: string;
    };

    const response = await fetch(`${BACKEND_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        firstName: body.firstName?.trim(),
        lastName: body.lastName?.trim(),
        identifier: body.identifier?.trim(),
        email: body.email?.trim(),
        phone: body.phone?.trim(),
        password: body.password,
      }),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        {
          message: getErrorMessage(payload) || "Falha ao criar conta no backend.",
          messages: typeof payload === "object" && payload && "messages" in payload ? (payload as { messages?: unknown }).messages : undefined,
        },
        { status: response.status }
      );
    }

    const token: string = payload.token;
    const refreshToken: string = payload.refreshToken;
    const nextResponse = NextResponse.json(
      {
        authenticated: true,
        user: payload.user ?? null,
      },
      { status: 200 }
    );

    setClientAuthCookies(nextResponse, token, refreshToken);

    // Forward XSRF-TOKEN cookie from Spring Boot so JS can read it immediately
    // after registration and include it in subsequent mutation requests.
    forwardNamedSetCookies(nextResponse, response.headers, [XSRF_COOKIE]);

    return nextResponse;
  } catch {
    return NextResponse.json(
      {
        message:
          "Nao foi possivel comunicar com o backend Xdigital. Confirma se ele esta a correr na porta 8080.",
      },
      { status: 502 }
    );
  }
}
