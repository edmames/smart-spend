"use client";

import { useToastStore, type ToastTone } from "@/app/toast";
import { cn } from "@/lib/cn";

const TONES: Record<ToastTone, string> = {
  success: "bg-ink text-white",
  error: "bg-expense text-white",
  info: "bg-ink/90 text-white",
};

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(78px+env(safe-area-inset-bottom))] z-40 mx-auto flex w-full max-w-[43rem] flex-col gap-2 px-3"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismiss(toast.id)}
          className={cn(
            "pointer-events-auto w-full rounded-xl px-3.5 py-2.5 text-left text-[13px] font-medium shadow-lg",
            TONES[toast.tone],
          )}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
