"use client";

import { AlertTriangle, DatabaseZap } from "lucide-react";
import { useSmartSpendStore } from "@/app/store";
import { Button, Card, LoadingPanel } from "@/components/ui/layout";

/**
 * Every data-driven screen is wrapped in this gate.
 *
 * Phase 1 stores data in the browser, so on the very first paint there is nothing
 * to show until the repository has finished reading. Rendering real numbers before
 * that would briefly display wrong zeros (and mismatch on hydration), so the gate
 * blocks until `hydration === "ready"` and turns storage corruption into an
 * explicit, recoverable screen instead of silently wiping the user's data.
 */
export function HydrationGate({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const hydration = useSmartSpendStore((state) => state.hydration);
  const failure = useSmartSpendStore((state) => state.storageFailure);
  const reload = useSmartSpendStore((state) => state.reload);

  if (hydration !== "ready") return fallback ?? <LoadingPanel />;

  if (failure) {
    return (
      <div className="flex flex-col gap-3">
        <Card className="flex flex-col gap-2 border-warning/40 bg-warning-soft">
          <div className="flex items-center gap-2 text-warning">
            <AlertTriangle className="h-4 w-4" />
            <h2 className="text-[14px] font-bold">Data tersimpan tidak bisa dibaca</h2>
          </div>
          <p className="text-[13px] leading-relaxed text-ink/80">{failure.message}</p>
          {failure.issues.length > 0 ? (
            <ul className="flex list-disc flex-col gap-1 pl-4 text-[12px] text-muted">
              {failure.issues.slice(0, 6).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={() => void reload()}>
              Coba baca ulang
            </Button>
            {failure.raw ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const blob = new Blob([failure.raw ?? ""], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = "smarts-corrupt-backup.json";
                  anchor.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Unduh data rusak
              </Button>
            ) : null}
          </div>
          <p className="flex items-start gap-1.5 text-[12px] text-muted">
            <DatabaseZap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Salinan aslinya disimpan terpisah di browser (tidak ditimpa), jadi data masih bisa dipulihkan manual.
          </p>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
