"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartPie, Cog, LayoutDashboard, Receipt, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";
import { ICON_SIZE, ICON_STROKE } from "@/components/ui/layout";

/** Primary destinations. Transaction creation lives in the Transaksi page header. */

export interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  match: (pathname: string) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Beranda", href: "/", icon: LayoutDashboard, match: (p) => p === "/" },
  { label: "Transaksi", href: "/transactions", icon: Receipt, match: (p) => p.startsWith("/transactions") || p.startsWith("/categories") },
  {
    label: "Dompet",
    href: "/wallets",
    icon: Wallet,
    match: (p) => p.startsWith("/wallets") || p.startsWith("/savings"),
  },
  { label: "Budget", href: "/budgets", icon: ChartPie, match: (p) => p.startsWith("/budgets") },
  {
    label: "Pengaturan",
    href: "/settings",
    icon: Cog,
    match: (p) => p.startsWith("/settings") || p.startsWith("/more"),
  },
];

export function BottomNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid h-[var(--nav-height)] max-w-[43rem] grid-cols-5 items-stretch">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={item.match(pathname)} />
        ))}
      </div>
    </nav>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-control px-0.5 text-[10px] font-semibold leading-tight transition-colors",
        active ? "text-primary" : "text-muted hover:text-ink active:bg-elevated/60",
      )}
    >
      <Icon className={cn("shrink-0", ICON_SIZE.md)} strokeWidth={active ? ICON_STROKE.emphasis : ICON_STROKE.ui} aria-hidden />
      <span>{item.label}</span>
    </Link>
  );
}
