"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/layout";
import { cn } from "@/lib/cn";

/**
 * Confirmation used wherever a mutation is destructive (delete transaction,
 * reset all data, replace dataset on import). Implemented with the native
 * `<dialog>` element so Escape, focus trapping and inertness come for free.
 *
 * Visual layer: the highest elevation in the app (`shadow-overlay`), the `full`
 * radius level (`radius-overlay`) and the shared `overlay` scrim. The confirm
 * action uses the danger tokens, so the destructive choice never relies on a
 * hardcoded colour.
 *
 * Motion: the `confirm-dialog` class carries the Motion Constitution v1 entrance
 * (opacity + a subtle scale at `emphasis`/`ease-enter`, backdrop fade) from
 * `globals.css`. Behaviour and focus management are untouched, and browsers
 * without `@starting-style` simply render the dialog unanimated.
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  /** Details listed under the description (counts, balances, warnings). */
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  /** When set, the user must type this exact word to enable confirmation. */
  requirePhrase?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = "Ya, lanjutkan",
  cancelLabel = "Batal",
  tone = "danger",
  requirePhrase,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const phraseRef = useRef<HTMLInputElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [phrase, setPhrase] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      // Focus the phrase input when present, otherwise let the browser focus the
      // dialog itself — the first Tab will reach the cancel button.
      if (requirePhrase) {
        phraseRef.current?.focus();
      } else {
        const firstFocusable = dialog
          .querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")
          ?.closest("button");
        firstFocusable?.focus();
      }
    } else if (!open && dialog.open) {
      dialog.close();
      // Restore focus to the element that triggered the dialog.
      previouslyFocusedRef.current?.focus?.();
    }
  }, [open, requirePhrase]);

  const ready = !requirePhrase || phrase.trim() === requirePhrase;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="confirm-dialog-title"
      aria-describedby={description ? "confirm-dialog-desc" : undefined}
      className={cn(
        "confirm-dialog m-auto w-[min(92vw,26rem)] rounded-overlay border border-line bg-surface p-0 shadow-overlay backdrop:bg-overlay",
        "[&[open]]:block",
      )}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          onConfirm();
          onClose();
        }}
        className="flex flex-col gap-3 p-4"
      >
        <div className="flex flex-col gap-1.5">
          <h2 id="confirm-dialog-title" className="card-title text-ink">{title}</h2>
          {description ? <div id="confirm-dialog-desc" className="small-copy text-muted">{description}</div> : null}
        </div>

        {children ? <div className="small-copy flex flex-col gap-2 text-ink">{children}</div> : null}

        {requirePhrase ? (
          <label className="small-copy flex flex-col gap-1.5 font-medium text-ink">
            Ketik <span className="font-mono font-bold">{requirePhrase}</span> untuk mengonfirmasi
            <input
              ref={phraseRef}
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              className="w-full rounded-control border border-line bg-surface px-sm py-2 text-sm font-normal text-ink outline-none transition-colors placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder={requirePhrase}
              autoComplete="off"
            />
          </label>
        ) : null}

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" block onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button type="submit" variant={tone === "danger" ? "danger" : "primary"} block disabled={!ready}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
