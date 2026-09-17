"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { LinkButton, PageHeader } from "@/components/ui/layout";
import { WalletsContent } from "@/components/wallets/wallets-content";
import { SavingsContent } from "@/components/savings/savings-content";
import { cn } from "@/lib/cn";

export type MoneyHubTab = "dompet" | "savings";

interface MoneyHubProps {
  /** For /savings compatibility: when no ?tab param is present, force this tab. */
  initialTab?: MoneyHubTab;
}

function parseTab(value: string | null): MoneyHubTab | null {
  if (value === "savings") return "savings";
  if (value === "dompet") return "dompet";
  return null;
}

export function MoneyHub({ initialTab }: MoneyHubProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const parsed = parseTab(rawTab);

  // URL is source of truth for /wallets; for /savings compat we fall back to initialTab
  let activeTab: MoneyHubTab;
  if (parsed) {
    activeTab = parsed;
  } else if (initialTab) {
    activeTab = initialTab;
  } else {
    activeTab = "dompet";
  }

  const switchTab = useCallback(
    (next: MoneyHubTab) => {
      // Always normalize to /wallets route for Money Hub canonical URL
      // Preserve other params except tab handling
      const current = new URLSearchParams(searchParams.toString());
      if (next === "savings") {
        current.set("tab", "savings");
      } else {
        current.delete("tab");
      }
      const qs = current.toString();
      const url = qs ? `/wallets?${qs}` : "/wallets";
      router.replace(url, { scroll: false });
    },
    [router, searchParams],
  );

  const isSavings = activeTab === "savings";

  return (
    <>
      <PageHeader
        title="Dompet"
        subtitle="Kelola dompet dan tabungan dari satu tempat. Saldo tetap dihitung dari transaksi."
        actions={
          <LinkButton href={isSavings ? "/savings/new" : "/wallets/new"} size="sm">
            <Plus className="h-4 w-4" aria-hidden />
            {isSavings ? "Target" : "Tambah"}
          </LinkButton>
        }
      />

      <div className="flex flex-col gap-3">
        <div
          role="tablist"
          aria-label="Pilihan dompet atau tabungan"
          className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-elevated p-1"
        >
          <button
            role="tab"
            aria-selected={activeTab === "dompet"}
            aria-controls="money-hub-panel-dompet"
            id="money-hub-tab-dompet"
            type="button"
            onClick={() => switchTab("dompet")}
            className={cn(
              "min-h-11 rounded-lg px-3 text-[14px] font-bold transition",
              activeTab === "dompet"
                ? "border border-line bg-surface text-ink shadow-sm"
                : "text-muted hover:text-ink",
            )}
          >
            Dompet
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "savings"}
            aria-controls="money-hub-panel-savings"
            id="money-hub-tab-savings"
            type="button"
            onClick={() => switchTab("savings")}
            className={cn(
              "min-h-11 rounded-lg px-3 text-[14px] font-bold transition",
              activeTab === "savings"
                ? "border border-line bg-surface text-ink shadow-sm"
                : "text-muted hover:text-ink",
            )}
          >
            Tabungan
          </button>
        </div>

        <div
          id={activeTab === "dompet" ? "money-hub-panel-dompet" : "money-hub-panel-savings"}
          role="tabpanel"
          aria-labelledby={activeTab === "dompet" ? "money-hub-tab-dompet" : "money-hub-tab-savings"}
          className="flex flex-col gap-3"
        >
          {activeTab === "dompet" ? <WalletsContent /> : <SavingsContent />}
        </div>
      </div>
    </>
  );
}
