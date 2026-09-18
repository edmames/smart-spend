/**
 * SmartSpend — Service Worker (Phase 2K PWA foundation + offline reopening)
 *
 * Architecture / Rationale
 * ────────────────────────
 *   WHY: After one successful online visit, the user must be able to reopen the
 *   REAL SmartSpend application offline — not just offline.html.
 *
 *   WHAT IS CACHED:
 *     1. PRECACHED during install (smarts-shell-* cache):
 *        - offline.html (last-resort fallback)
 *        - manifest.webmanifest, all icon PNGs
 *     2. RUNTIME-CACHED on first successful response:
 *        - Application HTML documents (smarts-pages-* cache)
 *        - /_next/static/* JS/CSS/font chunks (smarts-shell-* cache)
 *        These enter Cache Storage only after a successful network fetch.
 *
 *   WHEN: Documents are cached when navigation succeeds. Static assets are
 *   cached when fetched and the response is OK.
 *
 *   HOW IT UPDATES: Two versioned cache namespaces — smarts-shell-v1 and
 *   smarts-pages-v1. Bumping a version string causes the activate handler to
 *   delete only that namespace's old caches. Online navigation is always
 *   network-first, so a newly deployed build is served immediately and its
 *   new document is cached, replacing the stale one.
 *
 *   WHY IT CANNOT TRAP USERS: Navigation is network-first + offline fallback
 *   to cached document. A new build's fresh document is always preferred when
 *   online. The SW never forces a reload — users keep working on the current
 *   document until they manually refresh.
 *
 *   FINANCIAL SAFETY: The SW never reads or writes the browser's local storage
 *   (the only financial data store). The repository boundary
 *   (src/repository/) in the page context is the sole authority. No financial
 *   JSON, localStorage contents, or storage keys are ever placed in Cache Storage.
 */

const CACHE_VERSION = "v1";
const SHELL_CACHE = "smarts-shell-" + CACHE_VERSION;
const PAGES_CACHE = "smarts-pages-" + CACHE_VERSION;
const OFFLINE_PAGE = "/offline.html";

/**
 * Static assets precached during install (manifest, icons, offline shell).
 */
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/pwa-192x192.png",
  "/pwa-512x512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/favicon-32x32.png",
];

/**
 * Install: precache the offline shell and static assets immediately.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_PAGE, ...STATIC_ASSETS]))
      .then(() => self.skipWaiting()),
  );
});

/**
 * Activate: remove caches from previous versions. Filters to smarts-shell-*
 * and smarts-pages-* prefixes only — never touches unrelated cache namespaces.
 * Does NOT touch any stored user data.
 */
self.addEventListener("activate", (event) => {
  const currentCaches = [SHELL_CACHE, PAGES_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith("smarts-shell-") || key.startsWith("smarts-pages-")) &&
                !currentCaches.includes(key),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Determine if a request is a navigation request (HTML document).
 */
function isNavigationRequest(request) {
  return (
    request.mode === "navigate" ||
    (request.destination === "document" && request.headers.get("accept")?.includes("text/html"))
  );
}

/**
 * Determine if a request targets a static asset we can runtime-cache.
 */
function isStaticAsset(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.match(/\.(js|css|woff2?|ttf|eot|png|jpg|jpeg|webp|svg|ico|map)$/i) !== null
  );
}

/**
 * Check if a response is a valid HTML document (SmartSpend app shell).
 */
function isHtmlDocument(response) {
  if (!response || !response.ok) return false;
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("text/html");
}

/**
 * Safely cache a response. If cache.put() fails, the original response is
 * still returned — a cache failure must never break a successful request.
 */
function safeCachePut(cache, request, response) {
  try {
    cache.put(request, response.clone());
  } catch {
    // Cache write failure is non-fatal — we still return the network response.
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET requests (mutations, POST, etc. — never cache).
  if (request.method !== "GET") {
    return;
  }

  // Never cache cross-origin requests or external third-party content.
  if (url.origin !== location.origin) {
    return;
  }

  // Navigation requests: network-first with cached-document offline fallback.
  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful HTML responses so the app can reopen offline.
          if (isHtmlDocument(response)) {
            caches.open(PAGES_CACHE).then((cache) => safeCachePut(cache, request, response));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cachedResponse) => {
            // Prefer the exact cached document; fall back to cached homepage
            // for a generic offline navigation to any SmartSpend route.
            return cachedResponse || caches.match("/");
          }).then((docResponse) => docResponse || caches.match(OFFLINE_PAGE)),
        ),
    );
    return;
  }

  // Static versioned assets: cache-first with stale-while-revalidate.
  // /_next/static/* and icon/manifest files enter Cache Storage only after
  // a successful network request (runtime caching, not precaching).
  if (isStaticAsset(request) || STATIC_ASSETS.some((path) => url.pathname === path)) {
    event.respondWith(
      caches
        .match(request)
        .then((cachedResponse) => {
          const networkFetch = fetch(request).then((networkResponse) => {
            if (networkResponse.ok) {
              caches.open(SHELL_CACHE).then((cache) => safeCachePut(cache, request, networkResponse));
            }
            return networkResponse;
          }).catch(() => cachedResponse);
          return cachedResponse || networkFetch;
        })
        .catch(() => caches.match(OFFLINE_PAGE)),
    );
    return;
  }

  // Everything else: pass through to network (no caching for mutations/API/third-party).
});
