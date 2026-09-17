"use client";

import Link from "next/link";
import { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * SmartSpend — layout & surface primitives.
 *
 * Shared presentation primitives. The root layout owns content width and fixed-nav
 * clearance; these components keep feature pages visually consistent.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-primary-foreground hover:bg-brand-strong active:bg-brand-strong",
  secondary: "bg-surface text-ink border border-line hover:border-brand/50 hover:text-brand",
  soft: "bg-brand-soft text-brand-strong hover:bg-brand-soft/70",
  ghost: "text-muted hover:text-ink hover:bg-elevated",
  danger: "bg-expense text-white hover:bg-expense/90",
};

const SIZES: Record<Size, string> = {
  sm: "min-h-11 px-3 text-[13px] rounded-lg gap-1.5",
  md: "min-h-11 px-3.5 text-sm rounded-xl gap-2",
  lg: "h-12 px-4 text-[15px] rounded-xl gap-2",
};

const BASE =
  "inline-flex select-none items-center justify-center font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], extra);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

export function Button({ variant = "primary", size = "md", block, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonClass(variant, size), block && "w-full", className)} {...props} />;
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  block,
  className,
  children,
  ...props
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  block?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className">) {
  return (
    <Link href={href} className={cn(buttonClass(variant, size), block && "w-full", className)} {...props}>
      {children}
    </Link>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-muted transition hover:border-brand/40 hover:text-brand",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
  as: Tag = "div",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "li" | "article";
  padded?: boolean;
}) {
  return (
    <Tag className={cn("rounded-xl border border-line bg-surface", padded && "p-3.5", className)}>
      {children}
    </Tag>
  );
}

/**
 * The form action tray used by every editor (create + edit, all features).
 *
 * Inset, rounded and bordered on purpose: a full-bleed strip sitting flush on the
 * fixed bottom navigation reads as a *second* navigation bar. The offset clears
 * the nav and its safe-area padding.
 */
export function StickyActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom)+0.75rem)] z-10 flex gap-2 rounded-xl border border-line bg-surface p-1.5 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  action,
  id,
}: {
  children: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-0.5">
      <h2 id={id} className="section-title text-muted">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  backHref?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-[env(safe-area-inset-top)] z-20 -mx-3.5 mb-3 border-b border-line bg-canvas px-3.5 py-2">
      <div className="flex min-h-11 items-center gap-2">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Kembali"
            className="-ml-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M12 4l-5 6 5 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="page-title truncate text-ink">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-[13px] leading-snug text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface px-4 py-7 text-center">
      {icon ? <div className="text-muted">{icon}</div> : null}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {description ? <p className="max-w-[34ch] text-[13px] leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ProgressBar({
  percent,
  tone = "brand",
  className,
  label,
}: {
  percent: number;
  tone?: "brand" | "income" | "expense" | "savings" | "warning";
  className?: string;
  label?: string;
}) {
  const width = Math.max(0, Math.min(100, percent));
  const fill =
    tone === "income"
      ? "bg-income"
      : tone === "expense"
        ? "bg-expense"
        : tone === "savings"
          ? "bg-savings"
          : tone === "warning"
            ? "bg-warning"
            : "bg-brand";
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-line/70", className)}
      role="progressbar"
      aria-valuenow={Math.round(width)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn("h-full rounded-full transition-[width]", fill)} style={{ width: `${width}%` }} />
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "income" | "expense" | "savings" | "brand" | "warning";
  className?: string;
}) {
  const tones = {
    neutral: "bg-elevated text-muted",
    income: "bg-income-soft text-income",
    expense: "bg-expense-soft text-expense",
    savings: "bg-savings-soft text-savings",
    brand: "bg-brand-soft text-brand-strong",
    warning: "bg-warning-soft text-warning",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-line/60", className)} />;
}

export function LoadingPanel({ label = "Memuat data…" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-2.5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <SkeletonBlock className="h-24 w-full" />
      <SkeletonBlock className="h-16 w-full" />
      <SkeletonBlock className="h-16 w-full" />
    </div>
  );
}
