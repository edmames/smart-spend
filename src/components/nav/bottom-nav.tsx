"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MoreHorizontal, PiggyBank, Receipt, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";

/** Primary destinations. Transaction creation lives in the Transaksi page header. */

export interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  match: (pathname: string) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Beranda", href: "/", icon: LayoutDashboard, match: (p) => p === "/" },
  { label: "Transaksi", href: "/transactions", icon: Receipt, match: (p) => p.startsWith("/transactions") },
  { label: "Dompet", href: "/wallets", icon: Wallet, match: (p) => p.startsWith("/wallets") },
  { label: "Tabungan", href: "/savings", icon: PiggyBank, match: (p) => p.startsWith("/savings") },
  {
    label: "Lainnya",
    href: "/more",
    icon: MoreHorizontal,
    match: (p) => p.startsWith("/more") || p.startsWith("/budgets") || p.startsWith("/reports") || p.startsWith("/settings"),
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
        "flex min-w-0 flex-col items-center justify-center gap-0.5 whitespace-nowrap px-0.5 text-[10px] font-semibold leading-tight transition-colors",
        active ? "text-brand" : "text-muted hover:text-ink",
      )}
    >
      <Icon className="h-[19px] w-[19px] shrink-0" strokeWidth={active ? 2.3 : 1.9} aria-hidden />
      <span>{item.label}</span>
    </Link>
  );
}
