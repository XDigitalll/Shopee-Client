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
    /backend|porta\s*8080|:8080|localhost|127\.0\.0\.1|0\.0\.0\.0|econnrefused|fetch failed|failed to fetch/i.test(message) ||
    message.includes("{") ||
    message.includes("<!DOCTYPE")
  );
}

export function normalizeClientError(
  error: unknown,
  fallback = "Não conseguimos concluir agora. Tenta novamente.",
  status?: number
): NormalizedClientError {
  const message = rawMessage(error).trim();
  const lower = message.toLowerCase();

  if (status === 401 || /unauthorized|401|sess[aã]o expirada|login novamente/.test(lower)) {
    return { kind: "session", message: "A tua sessão expirou. Inicia sessão novamente para continuar." };
  }

  if (/csrf|xsrf|forbidden csrf|invalid csrf|missing csrf/.test(lower)) {
    return { kind: "validation", message: "Atualiza a página e tenta novamente." };
  }

  if (status === 403 || /não tem permissão|nao tem permissao|sem permiss|forbidden|403/.test(lower)) {
    return { kind: "validation", message: "Não tens permissão para esta ação." };
  }

  if (status === 404 || /404|não encontr|nao encontr|not found/.test(lower)) {
    return { kind: "generic", message: "Não encontrámos o que procuras." };
  }

  if (status === 409 || /409|conflict|já exist|ja exist|duplicad/.test(lower)) {
    if (message && !isUnsafeMessage(message)) {
      return { kind: "validation", message };
    }
    return { kind: "validation", message: "Operação em conflito. Verifica os dados e tenta novamente." };
  }

  if (status === 410) {
    return { kind: "generic", message: "Este recurso já não está disponível." };
  }

  if (status === 422 || /422|unprocessable|dados inv[aá]lidos/.test(lower)) {
    return { kind: "validation", message: "Verifica os dados preenchidos e tenta novamente." };
  }

  if (status === 429 || /429|too many|rate.?limit|muitas tentativas/.test(lower)) {
    return { kind: "generic", message: "Demasiadas tentativas. Aguarda um pouco e tenta de novo." };
  }

  if (status != null && (status === 502 || status === 503 || status === 504)) {
    return { kind: "network", message: "O servidor está temporariamente indisponível. Tenta novamente." };
  }

  if (status != null && status >= 500) {
    return { kind: "generic", message: "Ocorreu um erro interno. Tenta mais tarde." };
  }

  if (/cup[aã]o/.test(lower) && /inv[aá]lido|expir|inativo|mínimo|minimo/.test(lower)) {
    return { kind: "validation", message: "Cupão inválido ou expirado." };
  }

  if (/network|failed to fetch|fetch failed|econnrefused|backend inacess|service unavailable/i.test(message)) {
    return { kind: "network", message: "Estamos com dificuldade em ligar ao servico. Tenta novamente dentro de instantes." };
  }

  if (!message || isUnsafeMessage(message)) {
    return { kind: "generic", message: fallback };
  }

  return { kind: "generic", message };
}
