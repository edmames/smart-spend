import { z } from "zod";
import { MAX_MONEY, MIN_MONEY } from "@/domain/money";
import { isMonthKey, parseCalendarDate } from "@/domain/calendar";

/**
 * SmartSpend — entity models (schema version 1).
 *
 * These Zod schemas are used for *both* persistence validation and (through
 * `zodResolver`) form validation, so a value that passed a form is guaranteed to
 * be storable, and a value loaded from storage satisfies the invariants the
 * domain code relies on.
 *
 * Deliberately absent from the model:
 *  - `wallet.currentBalance`  -> derived from the ledger (see domain/ledger.ts)
 *  - `savings.currentAmount`  -> derived from the ledger
 *  - signed amounts           -> direction is encoded by `type` only
 */

export const ID_SCHEMA = z.string().min(1).max(64);

/**
 * Record timestamps are actual instants, separate from financial calendar dates.
 */
export const DATE_TIME_SCHEMA = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/, {
    message: "Tanggal & waktu tidak valid (format ISO UTC diperlukan).",
  })
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Tanggal & waktu tidak valid." });

export const MONTH_SCHEMA = z.string().refine(isMonthKey, { message: "Format bulan harus YYYY-MM yang valid." });

export const DATE_ONLY_SCHEMA = z
  .string()
  .refine((value) => parseCalendarDate(value) !== null, { message: "Format tanggal harus YYYY-MM-DD yang valid." });

export const MONEY_INT_SCHEMA = z
  .number({ message: "Nominal harus diisi." })
  .int({ message: "Nominal harus dalam satuan Rupiah penuh (tanpa sen)." })
  .min(MIN_MONEY, { message: "Nominal harus lebih besar dari Rp0." })
  .max(MAX_MONEY, { message: "Nominal maksimal adalah Rp9.999.999.999." });

const optionalTextSchema = (max: number) =>
  z
    .string()
    .max(max, { message: `Teks maksimal ${max} karakter.` })
    .nullable()
    .optional();

const nonEmptyTextSchema = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, { message: `${label} minimal ${min} karakter.` })
    .max(max, { message: `${label} maksimal ${max} karakter.` });

/* -------------------------------------------------------------------------- */
/* Wallet                                                                      */
/* -------------------------------------------------------------------------- */

export const WALLET_TYPES = ["cash", "bank", "ewallet"] as const;
export type WalletType = (typeof WALLET_TYPES)[number];

export const WALLET_TYPE_LABELS: Record<WalletType, string> = {
  cash: "Tunai",
  bank: "Bank",
  ewallet: "E-Wallet",
};

export const walletSchema = z
  .object({
    id: ID_SCHEMA,
    name: nonEmptyTextSchema(2, 40, "Nama dompet"),
    type: z.enum(WALLET_TYPES, { message: "Tipe dompet tidak valid." }),
    provider: optionalTextSchema(40),
    createdAt: DATE_TIME_SCHEMA,
    updatedAt: DATE_TIME_SCHEMA,
    archivedAt: z.string().nullable().optional(),
  })
  .strict();
export type Wallet = z.infer<typeof walletSchema>;

export function isActiveWallet(wallet: Wallet): boolean {
  return wallet.archivedAt == null;
}

/* -------------------------------------------------------------------------- */
/* Savings target                                                              */
/* -------------------------------------------------------------------------- */

export const savingsTargetSchema = z
  .object({
    id: ID_SCHEMA,
    name: nonEmptyTextSchema(2, 40, "Nama target"),
    targetAmount: MONEY_INT_SCHEMA,
    deadline: DATE_ONLY_SCHEMA.nullable().optional(),
    note: optionalTextSchema(200),
    createdAt: DATE_TIME_SCHEMA,
    updatedAt: DATE_TIME_SCHEMA,
    archivedAt: z.string().nullable().optional(),
  })
  .strict();
export type SavingsTarget = z.infer<typeof savingsTargetSchema>;

export function isActiveSavingsTarget(target: SavingsTarget): boolean {
  return target.archivedAt == null;
}

/* -------------------------------------------------------------------------- */
/* Budget                                                                      */
/* -------------------------------------------------------------------------- */

export const budgetSchema = z
  .object({
    id: ID_SCHEMA,
    // Expenses must carry a category; the base shape already allows null for the
  // other types, so this only tightens the expense branch.
  categoryId: z.string().min(1, { message: "Pilih kategori pengeluaran." }).max(64),
    month: MONTH_SCHEMA,
    limitAmount: MONEY_INT_SCHEMA,
    createdAt: DATE_TIME_SCHEMA,
    updatedAt: DATE_TIME_SCHEMA,
  })
  .strict();
export type Budget = z.infer<typeof budgetSchema>;

/** Budget identity: one category may have at most one limit per month. */
export const budgetKey = (budget: Pick<Budget, "categoryId" | "month">): string =>
  `${budget.categoryId}::${budget.month}`;

/* -------------------------------------------------------------------------- */
/* Payment methods                                                             */
/* -------------------------------------------------------------------------- */

export const PAYMENT_METHODS = ["cash", "qris", "debit", "transfer", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * A payment method is an *attribute of a transaction*, never an account: paying
 * with QRIS from BCA debits BCA. There is no "QRIS balance" anywhere in the
 * model — that is why it is an enum on the transaction and not a wallet.
 */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Tunai",
  qris: "QRIS",
  debit: "Debit",
  transfer: "Transfer Bank",
  other: "Lainnya",
};

export const paymentMethodSchema = z.enum(PAYMENT_METHODS, { message: "Metode pembayaran tidak valid." });

/* -------------------------------------------------------------------------- */
/* Transaction                                                                 */
/* -------------------------------------------------------------------------- */

export const TRANSACTION_TYPES = [
  "income",
  "expense",
  "transfer",
  "savings_deposit",
  "savings_withdrawal",
  "opening_balance",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** Fields shared by every transaction kind. */
const transactionBaseShape = {
  id: ID_SCHEMA,
  type: z.enum(TRANSACTION_TYPES, { message: "Tipe transaksi tidak valid." }),
  amount: MONEY_INT_SCHEMA,
  categoryId: optionalTextSchema(64),
  sourceWalletId: ID_SCHEMA.nullable().optional(),
  destinationWalletId: ID_SCHEMA.nullable().optional(),
  savingsTargetId: ID_SCHEMA.nullable().optional(),
  paymentMethod: paymentMethodSchema.nullable().optional(),
  note: optionalTextSchema(280),
  date: DATE_ONLY_SCHEMA,
  createdAt: DATE_TIME_SCHEMA,
  updatedAt: DATE_TIME_SCHEMA,
};

/**
 * Canonical transaction types, kept semantically separate:
 *
 *  income            new money in        -> wallet +, total money +, monthly income +
 *  expense           money gone forever  -> wallet -, total money -, monthly expense +
 *  transfer          wallet -> wallet    -> net worth unchanged, NOT income/expense
 *  savings_deposit   wallet -> savings   -> net worth unchanged, NOT an expense
 *  savings_withdrawal savings -> wallet   -> net worth unchanged, NOT income
 *  opening_balance   pre-existing wealth -> wallet +, total money +, NOT monthly income
 *
 * The discriminated union is what lets `validateTransaction` reason per-type
 * without runtime guessing, and lets the compiler reject an income without a
 * destination wallet before anything is stored.
 */
export const transactionSchema = z.discriminatedUnion("type", [
  z.object({ ...transactionBaseShape, type: z.literal("income"), destinationWalletId: ID_SCHEMA }).strict(),
  z
    .object({
      ...transactionBaseShape,
      type: z.literal("expense"),
      sourceWalletId: ID_SCHEMA,
      // Expenses must carry a category; the base shape already allows null for the
  // other types, so this only tightens the expense branch.
  categoryId: z.string().min(1, { message: "Pilih kategori pengeluaran." }).max(64),
    })
    .strict(),
  z
    .object({
      ...transactionBaseShape,
      type: z.literal("transfer"),
      sourceWalletId: ID_SCHEMA,
      destinationWalletId: ID_SCHEMA,
    })
    .strict(),
  z
    .object({
      ...transactionBaseShape,
      type: z.literal("savings_deposit"),
      sourceWalletId: ID_SCHEMA,
      savingsTargetId: ID_SCHEMA,
    })
    .strict(),
  z
    .object({
      ...transactionBaseShape,
      type: z.literal("savings_withdrawal"),
      savingsTargetId: ID_SCHEMA,
      destinationWalletId: ID_SCHEMA,
    })
    .strict(),
  z
    .object({
      ...transactionBaseShape,
      type: z.literal("opening_balance"),
      destinationWalletId: ID_SCHEMA,
    })
    .strict(),
]);
export type Transaction = z.infer<typeof transactionSchema>;

/**
 * Types used by the application layer when creating records: ids and timestamps
 * are assigned by the store, never by the UI.
 */
export type NewRecord<T> = Omit<T, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type NewWallet = NewRecord<Wallet>;
export type NewSavingsTarget = NewRecord<SavingsTarget>;
export type NewBudget = NewRecord<Budget>;
export type NewTransaction = NewRecord<Transaction>;

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

export const appSettingsSchema = z
  .object({
    currency: z.literal("IDR"),
    firstDayOfWeek: z.union([z.literal(1), z.literal(7)]).optional(),
  })
  .strict();
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = { currency: "IDR" };
