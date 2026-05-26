import { NextResponse } from "next/server";
import {
  setClientAuthCookies,
} from "@/lib/session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    token?: unknown;
    refreshToken?: unknown;
  } | null;

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const refreshToken = typeof body?.refreshToken === "string" ? body.refreshToken.trim() : "";

  if (!token || !refreshToken) {
    return NextResponse.json(
      { message: "Sessão Google incompleta." },
      { status: 400 }
    );
  }

  const nextResponse = NextResponse.json({ authenticated: true });
  setClientAuthCookies(nextResponse, token, refreshToken);
  return nextResponse;
}
