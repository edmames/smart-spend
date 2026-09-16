import { z } from "zod";
import { DATE_ONLY_SCHEMA, MONTH_SCHEMA } from "@/domain/models";
import { parseCalendarDate } from "@/domain/calendar";
import { MAX_MONEY, parseIDRInput } from "@/domain/money";
import { PAYMENT_METHODS, WALLET_TYPES } from "@/domain/models";

/**
 * SmartSpend — form schemas (React Hook Form + Zod).
 *
 * Design rule that matters more than convenience: a form field's Zod **input**
 * and **output** types are always identical (validated with `.check()`, never a
 * transform). That keeps React Hook Form's three generics (`values`, `context`,
 * `transformedValues`) trivially compatible with `zodResolver`, and it means the
 * value that reaches the application layer is exactly the value the user saw —
 * nothing silently rewrites an amount after the fact.
 *
 * Amounts are entered as free text but must arrive as a positive integer amount
 * of Rupiah, so every amount field runs through `moneyInput()`.
 */

/** Accepts what the amount control stores (number, raw text, or empty) and requires a valid integer amount. */
export const moneyInput = () =>
  z.unknown().superRefine((value, ctx) => {
    const parsed = normaliseAmountInput(value);
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message: "Nominal harus berupa angka bulat dalam Rupiah." });
      return;
    }
    if (parsed < 1) {
      ctx.addIssue({ code: "custom", message: "Nominal harus lebih besar dari Rp0." });
      return;
    }
    if (parsed > MAX_MONEY) {
      ctx.addIssue({ code: "custom", message: "Nominal maksimal adalah Rp9.999.999.999." });
    }
  });

/** Same as `moneyInput()` but an empty value is allowed (e.g. a wallet may start at Rp0). */
export const moneyInputOptional = () =>
  z.unknown().superRefine((value, ctx) => {
    if (value === null || value === undefined || value === "") return;
    const parsed = normaliseAmountInput(value);
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message: "Nominal harus berupa angka bulat dalam Rupiah." });
      return;
    }
    if (parsed < 0) {
      ctx.addIssue({ code: "custom", message: "Nominal tidak boleh negatif." });
      return;
    }
    if (parsed > MAX_MONEY) {
      ctx.addIssue({ code: "custom", message: "Nominal maksimal adalah Rp9.999.999.999." });
    }
  });

/** Turn whatever the amount control holds into an integer amount (or `null`). */
export function normaliseAmountInput(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  if (typeof value === "string") return parseIDRInput(value);
  return null;
}

/** Integer amount for a specific field, safe to hand to the domain. */
export function amountOf(value: unknown): number {
  const parsed = normaliseAmountInput(value);
  return parsed === null ? Number.NaN : parsed;
}

const textField = (max: number, label: string, min = 0) =>
  z
    .string()
    .trim()
    .min(min, { message: `${label} minimal ${min} karakter.` })
    .max(max, { message: `${label} maksimal ${max} karakter.` });



const optionalText = (max: number, label: string) =>
  z
    .union([z.string().trim().max(max, { message: `${label} maksimal ${max} karakter.` }), z.null(), z.undefined()]);

const paymentMethodField = z.union([z.enum(PAYMENT_METHODS, { message: "Metode pembayaran tidak valid." }), z.null(), z.undefined()]);

/* -------------------------------------------------------------------------- */
/* Wallet                                                                       */
/* -------------------------------------------------------------------------- */

export const walletFormSchema = z.object({
  name: textField(40, "Nama dompet", 2),
  type: z.enum(WALLET_TYPES, { message: "Pilih tipe dompet." }),
  provider: optionalText(40, "Penyedia"),
  /**
   * Written to the ledger as an `opening_balance` transaction (or rewriting that
   * record on edit) — never stored on the wallet itself.
   */
  openingBalance: moneyInputOptional(),
});
export type WalletFormValues = z.input<typeof walletFormSchema>;

/* -------------------------------------------------------------------------- */
/* Transactions                                                                 */
/* -------------------------------------------------------------------------- */

export const TRANSACTION_FORM_KINDS = [
  "income",
  "expense",
  "transfer",
  "savings_deposit",
  "savings_withdrawal",
  "opening_balance",
] as const;
export type TransactionFormKind = (typeof TRANSACTION_FORM_KINDS)[number];

export const USER_TRANSACTION_FORM_KINDS = [
  "income",
  "expense",
  "transfer",
  "savings_deposit",
  "savings_withdrawal",
] as const;

/**
 * One schema drives every transaction form; `superRefine`-style checks enforce the
 * per-type shape so errors land on the right field. The domain validates the same
 * rules again (plus archiving and available balance) before anything persists —
 * a form can never authorise something the ledger would reject.
 */
export const transactionFormSchema = z
  .object({
    kind: z.enum(TRANSACTION_FORM_KINDS, { message: "Pilih jenis transaksi." }),
    amount: moneyInput(),
    categoryId: optionalText(64, "Kategori"),
    sourceWalletId: optionalText(64, "Dompet sumber"),
    destinationWalletId: optionalText(64, "Dompet tujuan"),
    savingsTargetId: optionalText(64, "Target tabungan"),
    date: DATE_ONLY_SCHEMA,
    paymentMethod: paymentMethodField,
    note: optionalText(280, "Catatan"),
  })
  .superRefine((value, ctx) => {
    const record = value as Record<string, unknown>;
    const chosen = (key: string): boolean => {
      const current = record[key];
      return typeof current === "string" && current.trim().length > 0;
    };
    const require = (key: string, message: string) => {
      if (!chosen(key)) ctx.addIssue({ code: "custom", message });
    };
    const forbid = (key: string, message: string) => {
      if (chosen(key)) ctx.addIssue({ code: "custom", message });
    };

    switch (value.kind) {
      case "income":
        require("categoryId", "Pilih kategori.");
        require("destinationWalletId", "Pilih dompet tujuan.");
        forbid("sourceWalletId", "Pemasukan tidak memakai dompet sumber.");
        forbid("savingsTargetId", "Pemasukan tidak memakai target tabungan.");
        break;
      case "expense":
        require("categoryId", "Pilih kategori.");
        require("sourceWalletId", "Pilih dompet sumber.");
        forbid("destinationWalletId", "Pengeluaran tidak memakai dompet tujuan.");
        forbid("savingsTargetId", "Pengeluaran tidak memakai target tabungan.");
        break;
      case "transfer":
        require("sourceWalletId", "Pilih dompet sumber.");
        require("destinationWalletId", "Pilih dompet tujuan.");
        forbid("categoryId", "Transfer bukan pemasukan/pengeluaran, jadi tanpa kategori.");
        forbid("savingsTargetId", "Transfer tidak memakai target tabungan.");
        if (chosen("sourceWalletId") && record.sourceWalletId === record.destinationWalletId) {
          ctx.addIssue({
            code: "custom",
            path: ["destinationWalletId"],
            message: "Dompet sumber dan tujuan tidak boleh sama.",
          });
        }
        break;
      case "savings_deposit":
        require("sourceWalletId", "Pilih dompet sumber.");
        require("savingsTargetId", "Pilih target tabungan.");
        forbid("destinationWalletId", "Setoran tabungan tidak memakai dompet tujuan.");
        forbid("categoryId", "Setoran tabungan bukan pengeluaran.");
        break;
      case "savings_withdrawal":
        require("destinationWalletId", "Pilih dompet penerima.");
        require("savingsTargetId", "Pilih target tabungan.");
        forbid("sourceWalletId", "Penarikan tabungan tidak memakai dompet sumber.");
        forbid("categoryId", "Penarikan tabungan bukan pemasukan.");
        break;
      case "opening_balance":
        require("destinationWalletId", "Pilih dompet.");
        forbid("sourceWalletId", "Saldo awal tidak memakai dompet sumber.");
        forbid("categoryId", "Saldo awal tidak memakai kategori.");
        forbid("savingsTargetId", "Saldo awal tidak memakai target tabungan.");
        break;
    }
  });

export type TransactionFormValues = z.input<typeof transactionFormSchema>;

/* -------------------------------------------------------------------------- */
/* Savings target                                                               */
/* -------------------------------------------------------------------------- */

export const savingsTargetFormSchema = z.object({
  name: textField(40, "Nama target", 2),
  targetAmount: moneyInput(),
  deadline: z
    .union([z.string().trim(), z.null(), z.undefined()])
    .superRefine((value, ctx) => {
      if (typeof value === "string" && value.length > 0 && !parseCalendarDate(value)) {
        ctx.addIssue({ code: "custom", message: "Format tenggat tidak valid." });
      }
    }),
  note: optionalText(200, "Catatan"),
});
export type SavingsTargetFormValues = z.input<typeof savingsTargetFormSchema>;

/* -------------------------------------------------------------------------- */
/* Budget                                                                        */
/* -------------------------------------------------------------------------- */

export const budgetFormSchema = z.object({
  categoryId: z
    .union([z.string().trim().max(64), z.null(), z.undefined()])
    .superRefine((value, ctx) => {
      if (typeof value !== "string" || value.length === 0) {
        ctx.addIssue({ code: "custom", message: "Pilih kategori." });
      }
    }),
  month: MONTH_SCHEMA,
  limitAmount: moneyInput(),
});
export type BudgetFormValues = z.input<typeof budgetFormSchema>;

