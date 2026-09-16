"use client";

import { useParams } from "next/navigation";

/**
 * Route param helpers for client components.
 *
 * Phase 1 screens are interactive (store-driven) so they are client components;
 * reading the dynamic segment through `useParams` keeps them free of async prop
 * plumbing while still type checking against `PageProps<'/wallets/[id]'>`.
 *
 * Query strings are deliberately read from `window.location.search` (see
 * `readQueryParam`) rather than `useSearchParams`: the latter forces every page
 * that uses it into a Suspense boundary at build time, and these params are only
 * ever an enhancement on top of an already-hydrated local-first screen.
 */

export function useRouteId(segment = "id"): string {
  const params = useParams<Record<string, string | string[] | undefined>>();
  const value = params?.[segment];
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

export function readQueryParam(key: string, search: string | null | undefined = undefined): string {
  if (typeof window === "undefined" && search == null) return "";
  const params = new URLSearchParams(search ?? window.location.search);
  return params.get(key) ?? "";
}
