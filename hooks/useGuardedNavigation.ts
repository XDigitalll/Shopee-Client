"use client";

import { useEffect } from "react";

/**
 * Warns the user before they close the tab or navigate away while there
 * are unsaved changes. Uses the browser's native beforeunload dialog.
 *
 * Usage:
 *   useGuardedNavigation(isDirty);
 *
 * Pass `isDirty = true` once the user has made changes that haven't been saved.
 * The guard is automatically removed when the component unmounts.
 */
export function useGuardedNavigation(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Modern browsers show their own generic message; the string is ignored.
      event.returnValue = "Tens alterações não guardadas. Tens a certeza que queres sair?";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);
}
