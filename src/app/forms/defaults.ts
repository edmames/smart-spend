"use client";

import { getTodayCalendarDate } from "@/domain/calendar";

/** Form defaults live in one place so every create screen starts from the same instant. */
export function defaultDateTimeValue(): string {
  return getTodayCalendarDate();
}
