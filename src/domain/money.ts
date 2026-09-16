/**
 * SmartSpend — money model.
 *
 * Single source of truth for how money is represented.
 *
 * RULES (non negotiable):
 *  - Every stored amount is a **positive integer number of Rupiah** (Rp1 unit).
 *    Rp125.000 is stored as `125000`. Never `125.00`, never `"125.000"`.
 *  - Direction (in/out) comes from the *transaction type*, never from the sign
 *    of the amount.
 *  - Money is never parsed or formatted inside components — always go through
 *    these helpers so display/parsing rules stay in one place.
 *
 * The maximum (Rp9.999.999.999) is chosen so that any two amounts, and any
 * realistic ledger sum, stay far below Number.MAX_SAFE_INTEGER (9.007e15);
 * all arithmetic is therefore exact integer arithmetic.
 */

export const MIN_MONEY = 1;
export const MAX_MONEY = 9_999_999_999;
export const MONEY_DECIMALS = 0;
export const CURRENCY_CODE = "IDR";
export const CURRENCY_SYMBOL = "Rp";

const rupiahGrouping = new Intl.NumberFormat("id-ID", {
  style: "decimal",
  minimumFractionDigits: MONEY_DECIMALS,
  maximumFractionDigits: MONEY_DECIMALS,
  useGrouping: true,
});

/** True for a positive integer within the supported money range. */
export function isMoneyAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= MIN_MONEY && value <= MAX_MONEY;
}

export type MoneyValidation =
  | { valid: true; amount: number }
  | { valid: false; reason: MoneyFailReason };

export type MoneyFailReason = "not_a_number" | "not_integer" | "not_positive" | "too_large" | "unsafe";

/** Domain-level guard for amounts coming from forms, imports or API input. */
export function validateMoneyAmount(value: unknown): MoneyValidation {
  if (typeof value !== "number" || Number.isNaN(value)) return { valid: false, reason: "not_a_number" };
  if (!Number.isFinite(value)) return { valid: false, reason: "unsafe" };
  if (!Number.isInteger(value)) return { valid: false, reason: "not_integer" };
  if (value < MIN_MONEY) return { valid: false, reason: "not_positive" };
  if (value > MAX_MONEY) return { valid: false, reason: "too_large" };
  return { valid: true, amount: value };
}

export const MONEY_ERROR_MESSAGES: Record<MoneyFailReason, string> = {
  not_a_number: "Nominal harus diisi.",
  not_integer: "Nominal harus dalam satuan Rupiah penuh (tanpa sen).",
  not_positive: "Nominal harus lebih besar dari Rp0.",
  too_large: `Nominal maksimal adalah ${CURRENCY_SYMBOL}9.999.999.999.`,
  unsafe: "Nominal terlalu besar untuk dihitung dengan aman.",
};

/** `125000 -> "Rp125.000"`, `0 -> "Rp0"`, `-50000 -> "-Rp50.000"`. */
export function formatIDR(amount: number): string {
  if (!Number.isFinite(amount)) return `${CURRENCY_SYMBOL}0`;
  const sign = amount < 0 ? "-" : "";
  // Grouping separator for id-ID is "."; we only ever feed integers, so no decimals appear.
  return `${sign}${CURRENCY_SYMBOL}${rupiahGrouping.format(Math.trunc(Math.abs(amount)))}`;
}

/**
 * Explicitly signed rendering used by the ledger.
 * `kind = "income"` shows `+`, `kind = "expense"` shows `-`, anything else (internal
 * movement) is rendered with a neutral `±` because it does not change net worth.
 */
export function formatSignedIDR(
  amount: number,
  kind: "income" | "expense" | "neutral" = "neutral",
): string {
  const formatted = formatIDR(Math.abs(amount));
  if (kind === "income") return `+${formatted}`;
  if (kind === "expense") return `-${formatted}`;
  return formatted;
}

/** Input-friendly grouping: `125000 -> "125.000"`. */
export function formatNumberGrouping(amount: number): string {
  if (!Number.isFinite(amount)) return "0";
  return rupiahGrouping.format(Math.trunc(Math.abs(amount)));
}

/**
 * Parse whatever a human typed into an integer amount of Rupiah.
 *
 * Accepted: `125000`, `125.000`, `1.250.000`, `125,000`, `125 000`,
 * `Rp125.000`, `Rp 125.000`, surrounding whitespace, optional single decimal
 * group (`.50` is rejected because SmartSpend does not track sen).
 *
 * Returns `null` when the input is not a clean, positive integer amount.
 */
export function parseIDRInput(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let text = String(raw).trim();
  if (text.length === 0) return null;

  text = text.replace(/[ \u00A0\u202F\u2007]/g, "");
  if (/^rp/i.test(text)) text = text.slice(2);
  const negative = text.startsWith("-");
  text = text.replace(/^[+-]/, "");
  if (text.length === 0) return null;

  // "1.234.567" grouping, "1,234,567" grouping, "1234567", or mixed "1,234.567".
  const groupPattern = /^(\d{1,3})(?:(?:\.\d{3})+|(?:,\d{3})+|(?:,\d{1,3})+(?:\.\d{3})+)?$/;
  const digitsPattern = /^\d+$/;

  let digits: string;
  if (digitsPattern.test(text)) {
    digits = text;
  } else if (groupPattern.test(text)) {
    digits = text.replace(/[.,]/g, "");
  } else {
    return null;
  }

  if (digits.length === 0) return null;
  const value = Number(digits);
  if (!Number.isSafeInteger(value)) return null;
  const signed = negative ? -value : value;
  if (!Number.isInteger(signed)) return null;
  return signed;
}

/** Sum integer amounts; throws rather than silently overflowing safe-integer range. */
export function sumAmounts(amounts: readonly number[]): number {
  let total = 0;
  for (const amount of amounts) {
    if (!Number.isSafeInteger(amount)) {
      throw new TypeError(`sumAmounts expects safe integers, received ${String(amount)}`);
    }
    total += amount;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError("Ledger total exceeded Number.MAX_SAFE_INTEGER; the money model must be widened.");
    }
  }
  return total;
}
