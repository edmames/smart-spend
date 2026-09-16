/**
 * SmartSpend — identifiers.
 *
 * Ids are generated with `crypto.randomUUID()` (available in every supported
 * browser, including non-HTTPS localhost) with a deterministic fallback so
 * tests and legacy engines never crash on record creation. Ids are opaque
 * strings — never parse meaning out of them, they are only the final sort
 * tiebreaker (see `compareTransactions`).
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let fallbackCounter = 0;

function fallbackUuid(): string {
  const random = (length: number): string => {
    let out = "";
    while (out.length < length) {
      out += Math.floor(Math.random() * 0x10000)
        .toString(16)
        .padStart(4, "0");
    }
    return out.slice(0, length);
  };
  return `${random(8)}-${random(4)}-4${random(3)}-a${random(3)}-${random(12)}`;
}

export function createId(): string {
  const webcrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (webcrypto && typeof webcrypto.randomUUID === "function") {
    const id = webcrypto.randomUUID();
    if (UUID_PATTERN.test(id)) return id;
  }
  fallbackCounter += 1;
  return `sm-${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${fallbackUuid()}`;
}
