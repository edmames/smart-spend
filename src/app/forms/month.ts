"use client";

import { isMonthKey } from "@/domain/calendar";
import { currentMonthKey, formatMonthLabel, monthKeyOf, shiftMonthKey } from "@/domain/selectors";

/** Re-exported so screens never import aggregation helpers ad hoc. */
export { currentMonthKey, formatMonthLabel, monthKeyOf, shiftMonthKey };

/** Value for `<input type="month">`. */
export function monthInputValueFor(date: Date = new Date()): string {
  return currentMonthKey(date);
}

export function monthLabel(key: string): string {
  return formatMonthLabel(key);
}

/** Guard against a user typing a month outside the allowed window in the picker. */
export function clampMonth(key: string, max: string = monthInputValueFor()): string {
  if (!isMonthKey(key)) return max;
  return key > max ? max : key;
}
