"use client";

import { useCallback, useRef, useState } from "react";
import { normalizeClientError } from "@/lib/client-errors";

function friendlyActionError(error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error("[async-action]", error);
  }
  return normalizeClientError(error, "Algo nao correu bem. Tenta novamente.").message;
}

export function useAsyncAction() {
  const runningRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");

  const clearError = useCallback(() => setError(""), []);

  const run = useCallback(async <T,>(action: () => Promise<T>) => {
    if (runningRef.current) {
      return null;
    }

    runningRef.current = true;
    setIsRunning(true);
    setError("");

    try {
      return await action();
    } catch (actionError) {
      setError(friendlyActionError(actionError));
      return null;
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  }, []);

  return { run, isRunning, error, clearError };
}
