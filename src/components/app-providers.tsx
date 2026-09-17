"use client";

import { useEffect } from "react";
import { useSmartSpendStore } from "@/app/store";
import { useTheme } from "@/app/hooks";

/**
 * Client root behaviour:
 *  - hydrate from the repository exactly once per document,
 *  - follow changes made in another tab (same storage key),
 *  - apply the persisted theme preference.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const hydrate = useSmartSpendStore((state) => state.hydrate);
  const reload = useSmartSpendStore((state) => state.reload);
  useTheme();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key?.startsWith("smarts")) void reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [reload]);

  return <>{children}</>;
}
