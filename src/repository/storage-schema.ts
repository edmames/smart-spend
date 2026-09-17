import { z } from "zod";
import { calendarDateFromInstant } from "@/domain/calendar";
import {
  appSettingsSchema,
  categorySchema,
  budgetSchema,
  savingsTargetSchema,
  transactionSchema,
  walletSchema,
  DATE_TIME_SCHEMA,
} from "@/domain/models";
import { DEFAULT_CATEGORIES } from "@/domain/categories";

/**
 * SmartSpend — versioned persistence schema (v1).
 *
 * Nothing is ever trusted from storage. Every read goes through
 * `parsePersistedData`, which:
 *   1. JSON-parses defensively,
 *   2. runs a structural Zod schema (strict objects, money ranges, ISO dates),
 *   3. applies cross-entity invariants (unique ids, resolvable references,
 *      chronological balances),
 *   4. and *only then* hands data to the store.
 *
 * A rejected read never returns half-broken data — the caller shows a recovery
 * state instead, so the user can export the damaged payload rather than have it
 * silently rewritten.
 */

export const STORAGE_VERSION = 3 as const;
// Keep the installed storage key so v1 users are migrated instead of appearing empty.
export const STORAGE_KEY = "smarts-end.v1";
export const CORRUPT_BACKUP_PREFIX = `${STORAGE_KEY}.corrupt.`;
export const MAX_CORRUPT_BACKUPS = 3;

export const persistedDataSchema = z
  .object({
    version: z.literal(STORAGE_VERSION),
    wallets: z.array(walletSchema),
    categories: z.array(categorySchema),
    transactions: z.array(transactionSchema),
    savingsTargets: z.array(savingsTargetSchema),
    budgets: z.array(budgetSchema),
    settings: appSettingsSchema.nullable().optional(),
  })
  .strict();

export type PersistedData = z.infer<typeof persistedDataSchema>;

export const EMPTY_DATA: PersistedData = {
  version: STORAGE_VERSION,
  wallets: [],
  categories: seedDefaultCategories(),
  transactions: [],
  savingsTargets: [],
  budgets: [],
  settings: null,
};

export function seedDefaultCategories(now = "2026-01-01T00:00:00.000Z") {
  return DEFAULT_CATEGORIES.map((category) => ({
    ...category,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  }));
}

/** A brand new user starts with zero of everything. No demo data, ever. */
export function createEmptyData(): PersistedData {
  return structuredClone(EMPTY_DATA);
}

/* -------------------------------------------------------------------------- */
/* Migrations (migration-ready structure)                                      */
/* -------------------------------------------------------------------------- */

export interface Migration {
  from: number;
  to: number;
  description: string;
  migrate: (payload: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Registered migrations, applied in ascending `to` order. Phase 3 (Supabase)
 * reuses the exact same chain, so a user importing an older JSON export is
 * normalised before validation rather than rejected.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    from: 0,
    to: 1,
    description: "Version 0 (unlabelled early exports) -> versioned envelope with settings.",
    migrate: (payload) => ({
      version: 1,
      wallets: payload.wallets ?? [],
      categories: payload.categories ?? seedDefaultCategories(),
      transactions: payload.transactions ?? [],
      savingsTargets: payload.savingsTargets ?? [],
      budgets: payload.budgets ?? [],
      settings: payload.settings ?? null,
    }),
  },
  {
    from: 1,
    to: 2,
    description: "Convert v1 transaction instants to Asia/Jakarta calendar dates.",
    migrate: (payload) => ({
      ...payload,
      version: 2,
      transactions: Array.isArray(payload.transactions) ? payload.transactions.map((record: unknown) => {
        if (typeof record !== "object" || record === null || !("date" in record)) return record;
        // V1's stored instant is interpreted in the product reference calendar.
        // Original inputs lost to the old offset bug cannot be inferred safely.
        if (!DATE_TIME_SCHEMA.safeParse(record.date).success) return record;
        return { ...record, date: calendarDateFromInstant(new Date(record.date as string)) };
      }) : payload.transactions,
    }),
  },
  {
    from: 2,
    to: 3,
    description: "Seed manageable category records while preserving existing category ids.",
    migrate: (payload) => ({
      ...payload,
      version: 3,
      categories: Array.isArray(payload.categories) ? payload.categories : seedDefaultCategories(),
    }),
  },
] as const;

export type MigrationReport = { from: number; to: number; description: string };

/**
 * Normalise an arbitrary payload up to the current version.
 * Returns `null` when the payload is older than the earliest known version or
 * newer than this build supports (forward compatibility is deliberately refused:
 * writing a v2 dataset with v1 code would corrupt it).
 */
/** Envelope keys that describe a *downloaded export*, not the stored dataset. */
const EXPORT_ENVELOPE_KEYS = ["appName", "schemaVersion", "exportedAt"] as const;

export function migratePayload(
  input: unknown,
): { payload: Record<string, unknown>; applied: MigrationReport[] } | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const payload: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  // An export can be re-imported straight from `localStorage`, so the extra
  // envelope fields (appName / schemaVersion / exportedAt) are folded into the
  // stored shape instead of tripping the strict schema. The dataset itself never
  // carries them.
  const isExportEnvelope = EXPORT_ENVELOPE_KEYS.some((key) => key in payload);
  if (isExportEnvelope) {
    if (payload.version === undefined && typeof payload.schemaVersion === "number") {
      payload.version = payload.schemaVersion;
    }
    for (const key of EXPORT_ENVELOPE_KEYS) delete payload[key];
  }
  const rawVersion = payload.version;
  const version =
    typeof rawVersion === "number" && Number.isInteger(rawVersion) ? rawVersion : 0;

  if (version > STORAGE_VERSION) return null;

  const applied: MigrationReport[] = [];
  let current = version;
  let currentPayload = payload;

  if (current === 0) {
    // Only tolerate a version-less payload if it at least looks like our shape.
    const looksLikeData = ["wallets", "transactions", "savingsTargets", "budgets"].some((key) =>
      Array.isArray(currentPayload[key]),
    );
    if (!looksLikeData) return null;
  }

  const chain = MIGRATIONS.filter((migration) => migration.from >= current).sort(
    (a, b) => a.from - b.from,
  );
  for (const migration of chain) {
    if (migration.from !== current) continue;
    currentPayload = migration.migrate(currentPayload);
    applied.push({ from: migration.from, to: migration.to, description: migration.description });
    current = migration.to;
    if (current === STORAGE_VERSION) break;
  }

  if (current !== STORAGE_VERSION) return null;
  currentPayload.version = STORAGE_VERSION;
  return { payload: currentPayload, applied };
}

/* -------------------------------------------------------------------------- */
/* Validation result                                                           */
/* -------------------------------------------------------------------------- */

export type ParseFailureReason = "not_json" | "not_object" | "schema" | "invariants" | "unsupported_version";

export interface ParseFailure {
  reason: ParseFailureReason;
  message: string;
  /** Zod-ish paths, kept as strings so the UI can list them without depending on zod internals. */
  issues: string[];
  /** True when the data is structurally fine but from a version this build cannot handle. */
  needsNewerApp: boolean;
}

export type ParseResult =
  | { ok: true; data: PersistedData; migrations: MigrationReport[] }
  | { ok: false; failure: ParseFailure };

export interface CrossCheck {
  (data: PersistedData): string[];
}

export function parsePersistedData(raw: unknown, crossChecks: readonly CrossCheck[] = []): ParseResult {
  const migration = migratePayload(raw);
  if (!migration) {
    const version =
      typeof raw === "object" && raw !== null && "version" in raw
        ? (raw as { version: unknown }).version
        : undefined;
    return {
      ok: false,
      failure: {
        reason: typeof version === "number" && version > STORAGE_VERSION ? "unsupported_version" : "not_object",
        message:
          typeof version === "number" && version > STORAGE_VERSION
            ? `File ini memakai skema versi ${version}, lebih baru dari aplikasi ini (v${STORAGE_VERSION}).`
            : "Data tidak dikenali sebagai cadangan SmartSpend.",
        issues: [],
        needsNewerApp: typeof version === "number" && version > STORAGE_VERSION,
      },
    };
  }

  const parsed = persistedDataSchema.safeParse(migration.payload);
  if (!parsed.success) {
    return {
      ok: false,
      failure: {
        reason: "schema",
        message: "Data tersimpan tidak sesuai skema SmartSpend.",
        issues: parsed.error.issues
          .slice(0, 12)
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
        needsNewerApp: false,
      },
    };
  }

  const data = parsed.data as PersistedData;
  const problems = crossChecks.flatMap((check) => check(data));
  if (problems.length > 0) {
    return {
      ok: false,
      failure: {
        reason: "invariants",
        message: "Data tersimpan tidak konsisten secara finansial.",
        issues: problems.slice(0, 12),
        needsNewerApp: false,
      },
    };
  }

  return { ok: true, data, migrations: migration.applied };
}

/** `JSON.parse` + schema + invariants in one call, used by the repository and importer. */
export function parsePersistedJson(text: string, crossChecks: readonly CrossCheck[] = []): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      ok: false,
      failure: {
        reason: "not_json",
        message: "Isi file bukan JSON yang valid.",
        issues: [],
        needsNewerApp: false,
      },
    };
  }
  return parsePersistedData(json, crossChecks);
}

/** Serialise for export/download — includes schemaVersion and exportedAt. */
export function serializePersistedData(data: PersistedData, exportedAt = new Date().toISOString()): string {
  return JSON.stringify(
    {
      appName: "SmartSpend" as const,
      schemaVersion: STORAGE_VERSION,
      exportedAt,
      ...data,
    },
    null,
    2,
  );
}
