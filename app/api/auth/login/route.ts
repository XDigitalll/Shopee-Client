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
import { XSRF_COOKIE } from "@/lib/csrf";
import { forwardNamedSetCookies } from "@/lib/proxy-cookies";

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

function getErrorCode(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  return typeof record.code === "string" && record.code.trim() ? record.code.trim() : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      loginIdentifier?: string;
      email?: string;
      password?: string;
    };

    const identifier = body.loginIdentifier?.trim() || body.email?.trim();

    const response = await fetch(`${BACKEND_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        loginIdentifier: identifier,
        email: identifier,
        password: body.password,
      }),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        {
          message: getErrorMessage(payload) || "Falha ao autenticar no backend.",
          code: getErrorCode(payload) || undefined,
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

    const nextResponse = NextResponse.json(
      {
        authenticated: payload.authenticated ?? true,
        mustChangePassword: payload.mustChangePassword ?? false,
        temporaryPassword: payload.temporaryPassword ?? false,
        firstLogin: payload.firstLogin ?? false,
        accountSetupStep: payload.accountSetupStep ?? null,
      },
      { status: 200 }
    );

    // Forward XSRF-TOKEN cookie from Spring Boot so JS can read it immediately
    // after login and include it in subsequent mutation requests.
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
