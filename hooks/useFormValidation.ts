"use client";

import { useCallback, useRef, useState } from "react";

type ValidatorMap<T> = Partial<Record<keyof T, (value: string) => string | null>>;

/**
 * Real-time form validation hook.
 *
 * - Validates on blur (marks field as "touched") and on every change once touched.
 * - Provides `validateAll()` for submit: marks all fields touched, returns true if clean.
 * - Provides `scrollToFirstError()` to focus/scroll the first invalid field.
 * - Provides `fieldProps(name)` shorthand for binding to <input> elements.
 */
export function useFormValidation<T extends Record<string, string>>(
  values: T,
  rules: ValidatorMap<T>
) {
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const fieldRefs = useRef<Partial<Record<keyof T, HTMLElement | null>>>({});

  const getError = useCallback(
    (field: keyof T): string | null => {
      const rule = rules[field];
      if (!rule) return null;
      return rule(values[field] ?? "");
    },
    [rules, values]
  );

  const errors = Object.fromEntries(
    (Object.keys(rules) as Array<keyof T>).map((field) => [
      field,
      touched[field] ? getError(field) : null,
    ])
  ) as Partial<Record<keyof T, string | null>>;

  const touch = useCallback((field: keyof T) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const touchAll = useCallback(() => {
    const all = Object.fromEntries(
      (Object.keys(rules) as Array<keyof T>).map((field) => [field, true])
    ) as Record<keyof T, boolean>;
    setTouched(all);
  }, [rules]);

  /** Run all validators, mark all touched. Returns true when form is error-free. */
  const validateAll = useCallback((): boolean => {
    touchAll();
    return (Object.keys(rules) as Array<keyof T>).every(
      (field) => getError(field) === null
    );
  }, [rules, getError, touchAll]);

  /** Focus the first field that has an error (works even before all are touched). */
  const scrollToFirstError = useCallback(() => {
    const firstErrorField = (Object.keys(rules) as Array<keyof T>).find(
      (field) => getError(field) !== null
    );
    if (!firstErrorField) return;
    const el = fieldRefs.current[firstErrorField];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLInputElement).focus?.();
    }
  }, [rules, getError]);

  /** Register an element ref for a field (for scrollToFirstError). */
  const registerRef = useCallback(
    (field: keyof T) => (el: HTMLElement | null) => {
      fieldRefs.current[field] = el;
    },
    []
  );

  /**
   * Returns props to spread onto <input> or <textarea> for a given field.
   * Wires up onBlur (mark touched) and aria-invalid / aria-describedby.
   */
  const fieldProps = useCallback(
    (field: keyof T, errorId?: string) => ({
      onBlur: () => touch(field),
      "aria-invalid": Boolean(touched[field] && errors[field]) as boolean,
      "aria-describedby": errorId,
      ref: registerRef(field) as React.RefCallback<HTMLInputElement>,
    }),
    [touch, touched, errors, registerRef]
  );

  const hasAnyError = (Object.keys(rules) as Array<keyof T>).some(
    (field) => getError(field) !== null
  );

  return {
    errors,
    touched,
    touch,
    touchAll,
    validateAll,
    scrollToFirstError,
    registerRef,
    fieldProps,
    hasAnyError,
  };
}
