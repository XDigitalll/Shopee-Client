export const GOOGLE_CALLBACK_SESSION_ERROR =
  "Não foi possível concluir login com Google. Tenta novamente.";

export const GOOGLE_ACCOUNT_PASSWORD_MESSAGE =
  "Esta conta foi criada com Google. Usa Continuar com Google ou define uma senha no perfil.";

export function normalizeGoogleAuthMessage(message: string | null | undefined) {
  const value = typeof message === "string" ? message.trim() : "";
  if (!value) return GOOGLE_CALLBACK_SESSION_ERROR;

  if (/conta foi criada com google|continuar com google|google/i.test(value) && /senha|password/i.test(value)) {
    return GOOGLE_ACCOUNT_PASSWORD_MESSAGE;
  }

  return value;
}

export function hasGoogleCallbackTokens(params: URLSearchParams) {
  return Boolean(params.get("token") && params.get("refreshToken"));
}

export function googleCallbackLogPayload(params: URLSearchParams, browserCookie: string) {
  return {
    queryParams: Array.from(params.keys()),
    hasToken: Boolean(params.get("token")),
    hasRefreshToken: Boolean(params.get("refreshToken")),
    hasVisibleProfileCookie: browserCookie.includes("shopee_client_profile="),
    hasVisibleXsrfCookie: browserCookie.includes("XSRF-TOKEN="),
  };
}
