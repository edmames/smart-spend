/**
 * SmartSpend — cross-boundary types.
 *
 * Kept in a dependency-free file so `domain`, `repository` and `app` can share
 * vocabulary (errors, result shapes) without importing each other.
 */

import type { TransactionType } from "@/domain/models";

export type MutationErrorCode =
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "ARCHIVED"
  | "STORAGE_WRITE_FAILED"
  | "STORAGE_UNAVAILABLE"
  | "IMPORT_INVALID"
  | "SCHEMA_UNSUPPORTED";

export interface MutationError {
  code: MutationErrorCode;
  message: string;
  /** Field-level messages keyed by form field name, when applicable. */
  fields?: Record<string, string>;
}

export type MutationResult<T = void> = { ok: true; value: T } | { ok: false; error: MutationError };

export function mutationOk(): MutationResult<void>;
export function mutationOk<T>(value: T): MutationResult<T>;
export function mutationOk<T>(value?: T): MutationResult<T | void> {
  return { ok: true, value: value as T };
}

export function mutationError(
  code: MutationErrorCode,
  message: string,
  fields?: Record<string, string>,
): MutationResult<never> {
  return { ok: false, error: fields ? { code, message, fields } : { code, message } };
}

export type HydrationStatus = "idle" | "loading" | "ready" | "error";

export interface ExportMeta {
  schemaVersion: number;
  exportedAt: string;
  appName: "SmartSpend";
}

export interface ImportPreview {
  schemaVersion: number;
  exportedAt: string | null;
  counts: {
    wallets: number;
    transactions: number;
    savingsTargets: number;
    budgets: number;
    categories: number;
  };
  monthsWithBudgets: string[];
  firstTransactionDate: string | null;
  lastTransactionDate: string | null;
}

export type PeriodPreset = "thisMonth" | "lastMonth" | "custom" | "all";

export interface TransactionFilterState {
  query: string;
  types: TransactionType[];
  categoryIds: string[];
  walletIds: string[];
  paymentMethods: string[];
  period: PeriodPreset;
  customFrom: string;
  customTo: string;
}

export const EMPTY_FILTER: TransactionFilterState = {
  query: "",
  types: [],
  categoryIds: [],
  walletIds: [],
  paymentMethods: [],
  period: "all",
  customFrom: "",
  customTo: "",
};
