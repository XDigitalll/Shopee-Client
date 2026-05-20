"use client";

import { useCallback, useRef, useState } from "react";

function friendlyActionError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Nao foi possivel concluir a operacao.";
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
