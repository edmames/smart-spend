"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/layout";
import { cn } from "@/lib/cn";

/**
 * Confirmation used wherever a mutation is destructive (delete transaction,
 * reset all data, replace dataset on import). Implemented with the native
 * `<dialog>` element so Escape, focus trapping and inertness come for free.
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
  const [phrase, setPhrase] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      phraseRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const ready = !requirePhrase || phrase.trim() === requirePhrase;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className={cn(
        "m-auto w-[min(92vw,26rem)] rounded-2xl border border-line bg-surface p-0 shadow-xl backdrop:bg-ink/45",
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
          <h2 className="text-[16px] font-bold text-ink">{title}</h2>
          {description ? <div className="text-[13px] leading-relaxed text-muted">{description}</div> : null}
        </div>

        {children ? <div className="flex flex-col gap-2 text-[13px] text-ink">{children}</div> : null}

        {requirePhrase ? (
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink">
            Ketik <span className="font-mono font-bold">{requirePhrase}</span> untuk mengonfirmasi
            <input
              ref={phraseRef}
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
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
