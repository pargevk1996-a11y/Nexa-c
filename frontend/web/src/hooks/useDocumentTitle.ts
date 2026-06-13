import { useEffect } from "react";
import { BRAND_NAME } from "@/config/brand";

/**
 * Sets a unique, descriptive <title> per route (BUG-025) and restores the
 * previous title on unmount so SPA navigation never leaves a stale tab label.
 *
 * Pass the page-specific part only; the brand suffix is appended automatically,
 * e.g. useDocumentTitle("Sign in") → "Sign in · NEXA".
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · ${BRAND_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
