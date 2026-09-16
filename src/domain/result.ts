/**
 * SmartSpend — domain primitives.
 *
 * Everything under `src/domain/**` is framework independent:
 * no React, no Next.js, no DOM APIs (except where explicitly injected, e.g. the
 * storage adapter). Financial rules live here, never inside components.
 */

/** Result type used by domain validation so callers can react to *why* something failed. */
export type DomainErrorCode =
  | "INVALID_AMOUNT"
  | "INVALID_DATE"
  | "FUTURE_DATE"
  | "UNKNOWN_WALLET"
  | "UNKNOWN_SAVINGS_TARGET"
  | "UNKNOWN_CATEGORY"
  | "CATEGORY_TYPE_MISMATCH"
  | "MISSING_SOURCE_WALLET"
  | "MISSING_DESTINATION_WALLET"
  | "MISSING_SAVINGS_TARGET"
  | "UNEXPECTED_FIELD"
  | "SOURCE_EQUALS_DESTINATION"
  | "DESTINATION_ARCHIVED"
  | "SOURCE_ARCHIVED"
  | "INSUFFICIENT_WALLET_BALANCE"
  | "INSUFFICIENT_SAVINGS_BALANCE"
  | "NEGATIVE_HISTORICAL_BALANCE"
  | "DUPLICATE_ID"
  | "DUPLICATE_BUDGET"
  | "SCHEMA_INVALID"
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_WRITE_FAILED";

export interface DomainError {
  code: DomainErrorCode;
  /** Human readable, Indonesian (the product language). */
  message: string;
  field?: "amount" | "date" | "wallet" | "category" | "savings" | "note";
  walletId?: string;
  savingsTargetId?: string;
  transactionId?: string;
  /** When a single check produced several problems, the full list is attached. */
  allErrors?: DomainError[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: DomainError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(error: DomainError): Result<T> {
  return { ok: false, error };
}
