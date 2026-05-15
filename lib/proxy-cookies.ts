import { NextResponse } from "next/server";

function splitCombinedSetCookie(headerValue: string) {
  return headerValue
    .split(/,(?=\s*[^;,=\s]+=[^;,]+)/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getSetCookieValues(headers: Headers) {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };

  if (typeof withGetSetCookie.getSetCookie === "function") {
    return withGetSetCookie.getSetCookie();
  }

  const combined = headers.get("set-cookie");
  return combined ? splitCombinedSetCookie(combined) : [];
}

export function forwardNamedSetCookies(
  nextResponse: NextResponse,
  backendHeaders: Headers,
  cookieNames: string[]
) {
  const prefixes = cookieNames.map((name) => `${name}=`);

  for (const value of getSetCookieValues(backendHeaders)) {
    const trimmed = value.trim();
    if (prefixes.some((prefix) => trimmed.startsWith(prefix))) {
      nextResponse.headers.append("Set-Cookie", trimmed);
    }
  }
}
