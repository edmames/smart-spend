/**
 * SmartSpend — domain barrel.
 *
 * Application code imports the financial engine from `@/domain`; nothing in
 * `src/domain/**` may import React, Next.js, localStorage or UI code.
 */

export * from "@/domain/models";
export * from "@/domain/categories";
export * from "@/domain/money";
export * from "@/domain/id";
export * from "@/domain/result";
export * from "@/domain/ledger";
export * from "@/domain/selectors";
export * from "@/domain/validation";
