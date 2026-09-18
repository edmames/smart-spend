"use client";

import * as React from "react";
import { useId, useState } from "react";
import { useController, type Control, type FieldValues, type Path } from "react-hook-form";
import { cn } from "@/lib/cn";
import { amountFromMoneyInput, digitsFromMoneyInput, formatNumberGrouping } from "@/domain/money";
import { ICON_SIZE, ICON_STROKE } from "@/components/ui/layout";

/**
 * SmartSpend form primitives.
 *
 * Rules that matter for correctness (not cosmetics):
 *  - Amount fields are text inputs with `inputMode="numeric"` whose *stored*
 *    value is always an integer number of Rupiah (see `AmountInput`).
 *  - Every control is a real `<label>`-associated element, keyboard reachable,
 *    and errors are announced next to the field.
 *
 * Visual layer: one shared `CONTROL` recipe built from the Visual Constitution
 * tokens in `globals.css`. Controls keep a >=44px touch target, which is why the
 * vertical padding stays explicit (10px) instead of snapping to the spacing
 * scale. Selection controls signal the chosen option with a tinted brand
 * surface, a brand border and a weight change — green is reserved, not spread.
 */

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, hint, error, htmlFor, optional, children, className }: FieldProps) {
  const describedById = useId();
  const errorDescId = error ? `${describedById}-error` : undefined;
  const hintDescId = hint && !error ? `${describedById}-hint` : undefined;
  const generatedIds = [errorDescId, hintDescId].filter(Boolean);

  // Merge generated error/hint IDs with any existing aria-describedby on the child,
  // so a child's own describedby refs are preserved and never duplicated.
  const renderedChildren =
    React.isValidElement<{ "aria-describedby"?: string }>(children) &&
    typeof children.props === "object" &&
    children.props !== null
      ? (() => {
          const existing = children.props["aria-describedby"];
          const existingIds = existing ? existing.split(" ").filter(Boolean) : [];
          const merged = [...new Set([...existingIds, ...generatedIds])].join(" ") || undefined;
          if (merged === existing) return children;
          return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, { "aria-describedby": merged });
        })()
      : children;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="field-label flex items-baseline justify-between gap-2 text-ink">
        <span>{label}</span>
        {optional ? <span className="metadata font-normal">opsional</span> : null}
      </label>
      {renderedChildren}
      {hint && !error ? <p id={hintDescId} className="metadata">{hint}</p> : null}
      {error ? (
        <p id={errorDescId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "w-full min-w-0 rounded-control border border-line bg-surface px-sm py-2.5 text-[15px] text-ink outline-none transition-colors placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60";

export function TextInput({
  className,
  inputRef,
  ...props
}: React.ComponentProps<"input"> & { inputRef?: React.Ref<HTMLInputElement> }) {
  return <input ref={inputRef} className={cn(CONTROL, className)} {...props} />;
}

export function TextArea({
  className,
  inputRef,
  ...props
}: React.ComponentProps<"textarea"> & { inputRef?: React.Ref<HTMLTextAreaElement> }) {
  return <textarea ref={inputRef} className={cn(CONTROL, "min-h-[72px] resize-y", className)} {...props} />;
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function Select({
  options,
  placeholder,
  className,
  inputRef,
  ...props
}: React.ComponentProps<"select"> & {
  options: SelectOption[];
  placeholder?: string;
  inputRef?: React.Ref<HTMLSelectElement>;
}) {
  return (
    <div className="relative">
      <select ref={inputRef} className={cn(CONTROL, "appearance-none pr-9", className)} {...props}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className={cn("pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted", ICON_SIZE.sm)}
      >
        <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE.ui} strokeLinecap="round" />
      </svg>
    </div>
  );
}

/**
 * Integer-Rupiah amount input.
 *
 * Two values are kept strictly apart, and that separation *is* the fix for the
 * "amount disappears on iPhone" bug:
 *
 *  - the **canonical** value the form holds is always an integer number of Rupiah,
 *    or `null` for an empty field. Nothing else is ever written to the form, so no
 *    amount of reformatting can change the money.
 *  - the **draft** is the text on screen *while the user is typing*. It is rebuilt
 *    from the digits the user entered (`100000` -> `100.000`) and discarded on blur.
 *
 * Because the draft never leaks into the form, and because blur only drops it, the
 * mobile keyboard dismissing (or any re-render) cannot lose an amount. `inputMode`
 * stays `numeric` so phones show the number pad.
 */
export function AmountInput<T extends FieldValues>({
  control,
  name,
  id,
  "aria-describedby": describedBy,
  autoComplete = "off",
}: {
  control: Control<T>;
  name: Path<T>;
  id?: string;
  "aria-describedby"?: string;
  autoComplete?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const { field, fieldState } = useController({ control, name });
  const [draft, setDraft] = useState<string | null>(null);
  const amount = typeof field.value === "number" && Number.isFinite(field.value) ? field.value : null;
  // While editing, the user's own digits are shown re-grouped; once the field is left
  // (or rendered again) the canonical number is the single source of the display.
  const display = draft ?? (amount === null ? "" : formatNumberGrouping(amount));

  return (
    <div className="relative">
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] font-semibold",
          fieldState.error ? "text-danger" : "text-muted",
        )}
      >
        Rp
      </span>
      <input
        id={inputId}
        inputMode="numeric"
        autoComplete={autoComplete}
        aria-describedby={describedBy}
        aria-invalid={fieldState.invalid}
        className={cn(
          CONTROL,
          "pl-8 text-right font-semibold tabular-nums",
          fieldState.error && "border-danger focus:border-danger focus:ring-danger/20",
        )}
        value={display}
        onChange={(event) => {
          const raw = event.target.value;
          const next = amountFromMoneyInput(raw);
          if (next === null) {
            const digits = digitsFromMoneyInput(raw);
            setDraft(digits.length === 0 ? "" : raw);
            // An emptied field is the one and only way to clear an amount. Digits we
            // cannot represent exactly stay on screen only — never a guessed number.
            if (digits.length === 0) field.onChange(null);
            return;
          }
          setDraft(formatNumberGrouping(next));
          field.onChange(next);
        }}
        onBlur={() => {
          // Every keystroke already wrote the canonical amount, so blur only hands the
          // display back to it. It must never re-parse the formatted text: reading
          // "1.0000" as a decimal is what used to wipe the field.
          setDraft(null);
          field.onBlur();
        }}
      />
    </div>
  );
}

/** A controlled calendar date: selected text is passed through unchanged. */
export function CalendarDateInput<T extends FieldValues>({
  control,
  name,
  id,
  "aria-describedby": describedBy,
}: { control: Control<T>; name: Path<T>; id?: string; "aria-describedby"?: string }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const { field } = useController({ control, name });
  const { value, onChange, onBlur, name: fieldName, ref } = field;
  return (
    <TextInput
      id={inputId}
      type="date"
      aria-describedby={describedBy}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      name={fieldName}
      ref={ref}
    />
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  description?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  columns = 3,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  columns?: 2 | 3 | 5;
}) {
  const gridCols = columns === 2 ? "grid-cols-2" : columns === 5 ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-3";
  const labelId = React.useId();
  return (
    <div className="flex flex-col gap-1.5">
      {label ? <span id={labelId} className="text-sm font-medium text-ink">{label}</span> : null}
      <div role="group" aria-labelledby={label ? labelId : undefined} className={cn("grid gap-1.5", gridCols)}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-control border px-2.5 py-2 text-[13px] transition-[background-color,border-color,color] duration-standard ease-standard",
                active
                  ? "border-primary bg-primary-soft font-semibold text-primary-strong"
                  : "border-line bg-surface font-medium text-ink hover:border-line-strong hover:bg-elevated/60",
              )}
            >
              {option.icon ? <span aria-hidden>{option.icon}</span> : null}
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ChipToggle<T extends string>({
  options,
  selected,
  onToggle,
  label,
  id,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
  label: string;
  id?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-sm font-medium text-ink">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(option.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-[background-color,border-color,color] duration-standard ease-standard",
                active
                  ? "border-primary bg-primary-soft font-semibold text-primary-strong"
                  : "border-line bg-surface font-medium text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
