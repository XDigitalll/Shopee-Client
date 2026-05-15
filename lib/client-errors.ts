export type NormalizedClientError = {
  kind: "session" | "validation" | "network" | "generic";
  message: string;
};

function rawMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function isUnsafeMessage(message: string) {
  return (
    message.length > 180 ||
    /exception|stacktrace|traceback|authorization|bearer|token|csrf token/i.test(message) ||
    message.includes("{") ||
    message.includes("<!DOCTYPE")
  );
}

export function normalizeClientError(
  error: unknown,
  fallback = "Não conseguimos concluir agora. Tenta novamente."
): NormalizedClientError {
  const message = rawMessage(error).trim();
  const lower = message.toLowerCase();

  if (
    /não tem permissão|nao tem permissao|sem permiss|forbidden|unauthorized|401|403|sess[aã]o expirada|login novamente/.test(lower)
  ) {
    return { kind: "session", message: "A tua sessão expirou. Inicia sessão novamente para continuar." };
  }

  if (/csrf|xsrf/.test(lower)) {
    return { kind: "session", message: "A tua sessão expirou. Inicia sessão novamente para continuar." };
  }

  if (/cup[aã]o/.test(lower) && /inv[aá]lido|expir|inativo|mínimo|minimo/.test(lower)) {
    return { kind: "validation", message: "Cupão inválido ou expirado." };
  }

  if (/network|failed to fetch|backend inacess/i.test(message)) {
    return { kind: "network", message: "Não conseguimos contactar o servidor agora. Tenta novamente." };
  }

  if (!message || isUnsafeMessage(message)) {
    return { kind: "generic", message: fallback };
  }

  return { kind: "generic", message };
}
