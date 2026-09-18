/**
 * SmartSpend — Service Worker (Phase 2K PWA foundation)
 *
 * Architecture:
 *   - PRECACHED during install: manifest, icons, offline shell page (STATIC_ASSETS + OFFLINE_PAGE)
 *   - RUNTIME-CACHED: Next.js build-output assets under /_next/static/* enter Cache
 *     Storage on first request (cache-first with stale-while-revalidate). These are
 *     immutable, content-hashed files so stale-while-revalidate is safe.
 *   - Navigation / HTML documents: network-first with offline fallback to cached shell
 *   - API/mutation requests: never cached, always pass through
 *   - The browser's local storage (the only financial data store) is NEVER
 *     read or written by this worker. The existing repository abstraction
 *     (src/repository/) in the page is the sole authority for financial data.
 *
 * Cache names include a version string. Bumping CACHE_VERSION causes the
 * activate handler to delete the old cache — it does NOT clear any user data.
 *
 * OFFLINE CAPABILITY (Part 1):
 *   After one successful online visit, the offline shell (manifest, icons,
 *   offline.html) is available offline. However, the full application UI
 *   is NOT available offline because Next.js JS chunks under /_next/static/*
 *   are only cached after they are fetched at least once. If a subsequent
 *   offline visit navigates to a route whose JS chunks were never requested,
 *   the SW will serve offline.html instead. Full app reopening offline
 *   requires Part 2 precache manifest or explicit route precaching.
 */

const CACHE_VERSION = "v1";
const CACHE_NAME = "smarts-shell-" + CACHE_VERSION;
const OFFLINE_PAGE = "/offline.html";

/**
 * Static assets safe to cache aggressively. These are pre-cached during
 * install (cache.addAll) so they are immediately available offline after
 * first visit — even before any JS chunk is requested.
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
 * Install: pre-cache the offline shell and static assets immediately.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([OFFLINE_PAGE, ...STATIC_ASSETS]))
      .then(() => self.skipWaiting()),
  );
});

/**
 * Activate: remove old caches on version change. Crucially, this does NOT
 * touch the browser's local storage — financial data lives behind the
 * repository boundary in the page context, not here.
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("smarts-shell-") && key !== CACHE_NAME)
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
 * Determine if a request targets a static asset we can runtime-cache
 * (by extension or /_next/static path prefix).
 *
 * Note: /_next/static/* assets are NOT pre-cached during install. They
 * enter Cache Storage on first request (runtime caching) — safe because
 * they are content-hashed and immutable.
 */
function isStaticAsset(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.match(/\.(js|css|woff2?|ttf|eot|png|jpg|jpeg|webp|svg|ico|map)$/i) !== null
  );
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

  // Navigation requests: network-first with offline fallback.
  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Serve fresh response from network.
          return response;
        })
        .catch(() => caches.match(OFFLINE_PAGE)),
    );
    return;
  }

  // Static versioned assets: runtime cache-first with stale-while-revalidate.
  // These enter Cache Storage only after the first network request — they
  // are NOT pre-cached during install (no build-time precache manifest).
  if (isStaticAsset(request) || STATIC_ASSETS.some((path) => url.pathname === path)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const networkFetch = fetch(request).then((networkResponse) => {
          if (networkResponse.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse.clone()));
          }
          return networkResponse;
        }).catch(() => cachedResponse);
        return cachedResponse || networkFetch;
      }),
    );
    return;
  }

  // Everything else: pass through to network (no caching for mutations/API/third-party).
});
