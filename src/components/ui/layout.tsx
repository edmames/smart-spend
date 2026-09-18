"use client";

import Link from "next/link";
import { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * SmartSpend — layout & surface primitives.
 *
 * Shared presentation primitives, built on the Visual Constitution v1 tokens in
 * `globals.css`. The root layout owns content width and fixed-nav clearance;
 * these components keep feature pages visually consistent.
 *
 * House rules encoded here:
 *  - every control is a >=44px touch target (min-h-11) and keeps the global
 *    focus-visible ring, so no primitive needs `outline-none`;
 *  - states are static CSS (`hover` / `active` / `disabled` / `aria-pressed`),
 *    never animated — motion is owned by a later phase;
 *  - off-scale spacing that is tuned for touch targets or density (control
 *    padding, card padding) stays explicit rather than being snapped.
 */

/** Lucide sizing convention for chrome icons. Decorative icons stay `aria-hidden`. */
export const ICON_SIZE = { inline: "h-3.5 w-3.5", sm: "h-4 w-4", md: "h-5 w-5" } as const;

/** Stroke convention: 1.9 for chrome, 2.3 only to emphasise an active state. */
export const ICON_STROKE = { ui: 1.9, emphasis: 2.3 } as const;

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const VARIANTS: Record<Variant, string> = {
  primary: cn("bg-primary text-primary-foreground hover:bg-primary-strong active:bg-primary-strong", FOCUS),
  secondary: cn("border border-line bg-surface text-ink hover:border-primary/45 hover:text-primary active:bg-elevated", FOCUS),
  soft: cn("bg-primary-soft text-primary-strong hover:bg-primary-soft/70 active:bg-primary-soft", FOCUS),
  ghost: cn("text-muted hover:bg-elevated hover:text-ink active:bg-elevated/70", FOCUS),
  danger: cn("bg-danger text-danger-foreground hover:bg-danger/90 active:bg-danger/80", FOCUS),
};

const SIZES: Record<Size, string> = {
  sm: "min-h-11 rounded-lg gap-1.5 px-sm text-[13px]",
  md: "min-h-11 rounded-control gap-2 px-3.5 text-sm",
  lg: "min-h-12 rounded-control gap-2 px-md text-[15px]",
};

const BASE =
  "inline-flex select-none items-center justify-center font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

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

/**
 * Square, icon-only control. `label` is required because the icon alone carries
 * the name — render the icon `aria-hidden` and size it with `ICON_SIZE.md`.
 */
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
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-muted transition-colors hover:border-primary/45 hover:text-primary active:bg-elevated disabled:cursor-not-allowed disabled:opacity-50",
        FOCUS,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * A surface for content that is genuinely framed as one unit.
 *
 * A section is *not* automatically a card: use `variant="plain"` for grouped
 * content that should read as part of the page, and keep cards un-nested.
 */
export function Card({
  children,
  className,
  as: Tag = "div",
  padded = true,
  variant = "surface",
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "li" | "article";
  padded?: boolean;
  /** `surface` = framed, `raised` = framed and lifted, `plain` = no frame. */
  variant?: "surface" | "raised" | "plain";
  /** Adds hover/pressed feedback for whole-surface targets. */
  interactive?: boolean;
}) {
  return (
    <Tag
      className={cn(
        "rounded-surface",
        variant === "surface" && "border border-line bg-surface",
        variant === "raised" && "border border-line bg-surface shadow-raised",
        variant === "plain" && "bg-transparent",
        interactive && "transition-colors hover:border-line-strong hover:bg-elevated/50 active:bg-elevated",
        padded && "p-3.5",
        className,
      )}
    >
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
        "sticky bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom)+0.75rem)] z-10 mt-2 flex gap-2 rounded-surface border border-line bg-surface p-1.5 shadow-raised",
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
    <header
      className="sticky top-0 z-20 mb-3 border-b border-line bg-canvas py-2.5"
      style={{
        marginLeft: "calc(-0.875rem - env(safe-area-inset-left))",
        marginRight: "calc(-0.875rem - env(safe-area-inset-right))",
        paddingLeft: "calc(0.875rem + env(safe-area-inset-left))",
        paddingRight: "calc(0.875rem + env(safe-area-inset-right))",
        paddingTop: "calc(0.5rem + env(safe-area-inset-top))",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {backHref ? (
            <Link
              href={backHref}
              aria-label="Kembali"
              className={cn(
                "-ml-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-elevated hover:text-ink active:bg-elevated/70",
                FOCUS,
              )}
            >
              <svg
                viewBox="0 0 20 20"
                className={ICON_SIZE.md}
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth={ICON_STROKE.ui}
              >
                <path d="M12 4l-5 6 5 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ) : null}
          <h1 className="page-title min-w-0 flex-1 truncate text-ink">{title}</h1>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>
      {subtitle ? <p className="small-copy mt-1.5 max-w-[60ch] text-muted">{subtitle}</p> : null}
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
    <div className="flex flex-col items-center gap-2 rounded-surface border border-dashed border-line bg-surface px-4 py-7 text-center">
      {icon ? <div className="text-subtle" aria-hidden>{icon}</div> : null}
      <p className="card-title text-ink">{title}</p>
      {description ? <p className="small-copy max-w-[34ch] text-muted">{description}</p> : null}
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
      className={cn("h-2 w-full overflow-hidden rounded-full bg-elevated", className)}
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
    brand: "bg-primary-soft text-primary-strong",
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
  return <div className={cn("animate-pulse rounded-surface bg-elevated", className)} />;
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
