import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  buildProfileJson,
  cookieOpts,
  PROFILE_COOKIE,
  REFRESH_COOKIE_NAME,
  REFRESH_MAX_AGE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/session";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

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
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, cookieOpts(true, SESSION_MAX_AGE));
    cookieStore.set(REFRESH_COOKIE_NAME, refreshToken, cookieOpts(true, REFRESH_MAX_AGE));
    cookieStore.set(PROFILE_COOKIE, buildProfileJson(token), cookieOpts(false, SESSION_MAX_AGE));

    return NextResponse.json(
      {
        token,
        refreshToken,
        user: payload.user ?? null,
      },
      { status: 200 }
    );
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
