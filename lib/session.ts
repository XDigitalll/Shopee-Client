export const SESSION_COOKIE = "shopee_client_session";
export const REFRESH_COOKIE_NAME = "shopee_client_refresh";
export const PROFILE_COOKIE = "shopee_client_profile";

export const SESSION_MAX_AGE = 86_400;    // 1 day
export const REFRESH_MAX_AGE = 2_592_000; // 30 days

const isSecure = process.env.NODE_ENV === "production";

export function cookieOpts(httpOnly: boolean, maxAge: number) {
  return {
    httpOnly,
    secure: isSecure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function buildProfileJson(token: string): string {
  const p = decodeJwtPayload(token);
  return JSON.stringify({
    name: typeof p?.name === "string" ? p.name : "",
    email: typeof p?.email === "string" ? p.email : typeof p?.sub === "string" ? p.sub : "",
    avatarUrl: typeof p?.avatarUrl === "string" ? p.avatarUrl : "",
    provider: typeof p?.provider === "string" ? p.provider : "LOCAL",
    roles: Array.isArray(p?.roles) ? p.roles : [],
    mustChangePassword: p?.mustChangePassword === true,
    expiresAt: typeof p?.exp === "number" ? p.exp * 1000 : Date.now() + SESSION_MAX_AGE * 1000,
  });
}
