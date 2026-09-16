import {
  Album,
  ArrowLeftRight,
  Banknote,
  Briefcase,
  Building2,
  Bus,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  Landmark,
  Lightbulb,
  MoreHorizontal,
  PartyPopper,
  PiggyBank,
  Play,
  Receipt,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Trophy,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * SmartSpend — centralised category metadata.
 *
 * Categories are *metadata*, not entities: a fixed catalogue with a stable id, a
 * label, the transaction side they belong to, an icon identifier and a chart
 * colour identifier. Wallet/transaction records only ever store the category
 * **id**, so renaming a label never rewrites the ledger.
 *
 * (Phase 1 keeps the catalogue fixed by design; user defined categories are a
 * Phase 2 concern.)
 */

import type { TransactionType } from "@/domain/models";

export type { TransactionType };
export type CategoryType = "income" | "expense";

/** Chart colour identifiers — resolved to concrete classes in the UI layer only. */
export type ChartColorId =
  | "rose"
  | "orange"
  | "amber"
  | "emerald"
  | "teal"
  | "sky"
  | "indigo"
  | "violet"
  | "fuchsia"
  | "slate"
  | "lime"
  | "cyan"
  | "blue"
  | "yellow";

export interface CategoryMeta {
  id: string;
  label: string;
  type: CategoryType;
  /** Icon identifier; resolved to a component through `getCategoryIcon`. */
  icon: string;
  color: ChartColorId;
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  utensils: UtensilsCrossed,
  bus: Bus,
  shopping: ShoppingBag,
  play: Play,
  receipt: Receipt,
  heart: HeartPulse,
  education: GraduationCap,
  house: House,
  album: Album,
  dots: MoreHorizontal,
  salary: Banknote,
  business: Briefcase,
  bonus: Trophy,
  gift: Gift,
  investment: Landmark,
};

export const EXPENSE_CATEGORIES: readonly CategoryMeta[] = [
  { id: "makanan", label: "Makanan", type: "expense", icon: "utensils", color: "orange" },
  { id: "transportasi", label: "Transportasi", type: "expense", icon: "bus", color: "sky" },
  { id: "belanja", label: "Belanja", type: "expense", icon: "shopping", color: "fuchsia" },
  { id: "hiburan", label: "Hiburan", type: "expense", icon: "play", color: "violet" },
  { id: "tagihan", label: "Tagihan", type: "expense", icon: "receipt", color: "rose" },
  { id: "kesehatan", label: "Kesehatan", type: "expense", icon: "heart", color: "emerald" },
  { id: "pendidikan", label: "Pendidikan", type: "expense", icon: "education", color: "amber" },
  { id: "rumah", label: "Rumah", type: "expense", icon: "house", color: "teal" },
  { id: "langganan", label: "Langganan", type: "expense", icon: "album", color: "indigo" },
  { id: "lainnya", label: "Lainnya", type: "expense", icon: "dots", color: "slate" },
] as const;

export const INCOME_CATEGORIES: readonly CategoryMeta[] = [
  { id: "gaji", label: "Gaji", type: "income", icon: "salary", color: "emerald" },
  { id: "usaha", label: "Usaha", type: "income", icon: "business", color: "teal" },
  { id: "bonus", label: "Bonus", type: "income", icon: "bonus", color: "amber" },
  { id: "hadiah", label: "Hadiah", type: "income", icon: "gift", color: "fuchsia" },
  { id: "investasi", label: "Investasi", type: "income", icon: "investment", color: "sky" },
  { id: "income-lainnya", label: "Lainnya", type: "income", icon: "dots", color: "slate" },
] as const;

export const ALL_CATEGORIES: readonly CategoryMeta[] = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
];

const CATEGORY_BY_ID = new Map<string, CategoryMeta>(ALL_CATEGORIES.map((c) => [c.id, c]));

export function getCategoryMeta(categoryId: string | null | undefined): CategoryMeta | undefined {
  if (!categoryId) return undefined;
  return CATEGORY_BY_ID.get(categoryId);
}

export function categoriesForType(type: CategoryType): readonly CategoryMeta[] {
  return type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
}

export function categoryLabel(categoryId: string | null | undefined, fallback = "Tanpa kategori"): string {
  return getCategoryMeta(categoryId)?.label ?? fallback;
}

export function getCategoryIcon(categoryId: string | null | undefined): LucideIcon {
  const meta = getCategoryMeta(categoryId);
  if (!meta) return Sparkles;
  return CATEGORY_ICONS[meta.icon] ?? Wallet;
}

/** Icons reused by non-category surfaces (wallet types, transaction types). */
export const WALLET_TYPE_ICONS: Record<string, LucideIcon> = {
  cash: Banknote,
  bank: Building2,
  ewallet: Smartphone,
};

export const TRANSACTION_TYPE_ICONS: Record<TransactionType, LucideIcon> = {
  income: HandCoins,
  expense: Receipt,
  transfer: ArrowLeftRight,
  savings_deposit: PiggyBank,
  savings_withdrawal: PiggyBank,
  opening_balance: Lightbulb,
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: "Pemasukan",
  expense: "Pengeluaran",
  transfer: "Transfer",
  savings_deposit: "Setoran Tabungan",
  savings_withdrawal: "Penarikan Tabungan",
  opening_balance: "Saldo Awal",
};

/**
 * "Internal movements" shift money the user already owns. They must never touch
 * Income / Expense / budget usage / net cash flow.
 */
export const INTERNAL_MOVEMENT_TYPES: readonly TransactionType[] = [
  "transfer",
  "savings_deposit",
  "savings_withdrawal",
  "opening_balance",
] as const;

export function isInternalMovement(type: TransactionType): boolean {
  return INTERNAL_MOVEMENT_TYPES.includes(type);
}

/** Short sign convention for rendering ledger amounts. */
export const TRANSACTION_TYPE_SIGN: Record<TransactionType, "+" | "-" | "±"> = {
  income: "+",
  expense: "-",
  transfer: "±",
  savings_deposit: "±",
  savings_withdrawal: "±",
  opening_balance: "+",
};

export const SAVINGS_TARGET_ICON = PiggyBank;
export const SAVINGS_GOAL_REACHED_ICON = PartyPopper;
