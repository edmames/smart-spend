/** Financial calendar values are text, never instants or machine-local Dates. */
export interface CalendarParts { year: number; month: number; day: number }

/** Product calendar, independent of the browser/server/process timezone. */
export const REFERENCE_TIME_ZONE = "Asia/Jakarta";

/** Use only at an explicit instant -> reference-calendar boundary (clock or v1 migration). */
export function calendarDateFromInstant(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REFERENCE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function getTodayCalendarDate(now: Date = new Date()): string {
  return calendarDateFromInstant(now);
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseCalendarDate(value: string): CalendarParts | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) > 0;
}

export function getMonthKey(value: string): string {
  if (!parseCalendarDate(value)) throw new RangeError("Invalid calendar date");
  return value.slice(0, 7);
}

export function compareCalendarDates(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

export function isDateInMonth(date: string, month: string): boolean {
  return parseCalendarDate(date) !== null && isMonthKey(month) && date.slice(0, 7) === month;
}

/** UTC is only a formatting carrier; it does not change the supplied calendar day. */
export function formatCalendarDate(value: string, month: "short" | "long" = "long", locale = "id-ID"): string {
  if (!parseCalendarDate(value)) return "—";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month, year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}
