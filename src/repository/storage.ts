/**
 * SmartSpend — storage adapter.
 *
 * The *only* place allowed to touch `localStorage`. Components never do, the
 * domain never does, and even the repository talks to an interface so the
 * browser API can be swapped (Supabase in Phase 3, an in-memory adapter in
 * tests) without any financial logic changing.
 */

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Keys with the given prefix, for backup housekeeping. */
  keys(prefix: string): string[];
}

function isBrowserStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

export class LocalStorageAdapter implements KeyValueStore {
  constructor(private readonly storage: Storage | null = isBrowserStorageAvailable() ? window.localStorage : null) {}

  get available(): boolean {
    return this.storage !== null;
  }

  getItem(key: string): string | null {
    if (!this.storage) return null;
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    if (!this.storage) {
      throw new StorageWriteError("Penyimpanan browser tidak tersedia.");
    }
    try {
      this.storage.setItem(key, value);
    } catch (error) {
      // Safari private mode / quota exceeded surface here.
      throw new StorageWriteError(
        error instanceof Error && error.name === "QuotaExceededError"
          ? "Penyimpanan browser penuh, data terbaru gagal disimpan."
          : "Gagal menulis ke penyimpanan browser.",
      );
    }
  }

  removeItem(key: string): void {
    if (!this.storage) return;
    try {
      this.storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  keys(prefix: string): string[] {
    if (!this.storage) return [];
    const found: string[] = [];
    try {
      for (let index = 0; index < this.storage.length; index += 1) {
        const key = this.storage.key(index);
        if (key && key.startsWith(prefix)) found.push(key);
      }
    } catch {
      /* ignore */
    }
    return found;
  }
}

export class StorageWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageWriteError";
  }
}

/** Deterministic in-memory store for tests and for SSR/prerender passes. */
export class MemoryStorageAdapter implements KeyValueStore {
  private readonly map = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.map.set(key, value);
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  keys(prefix: string): string[] {
    return [...this.map.keys()].filter((key) => key.startsWith(prefix));
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.map.entries());
  }

  clear(): void {
    this.map.clear();
  }
}
