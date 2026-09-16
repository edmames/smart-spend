"use client";

import { create } from "zustand";

/**
 * Minimal toast channel. Deliberately not part of the data model: notifications
 * are ephemeral UI state and must never be persisted.
 */

export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, tone = "info") => {
    const id = nextId;
    nextId += 1;
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }].slice(-3) }));
    if (typeof setTimeout !== "undefined") {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
      }, tone === "error" ? 5200 : 2600);
    }
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export function pushToast(message: string, tone: ToastTone = "info"): void {
  useToastStore.getState().push(message, tone);
}
