/* ──────────────────────────────────────────────────────────────────────────
   Swahili Treats — ADMIN-ONLY service worker.

   IMPORTANT: This file is registered with an explicit narrow `scope`
   ("/admin.html" and "/login.html" individually — see the registration
   code in those two files). That means the browser will NEVER let this
   service worker control or intercept requests for index.html,
   products.html, or any other page on the site. The customer-facing
   storefront is completely unaffected by this file's existence.

   As a second layer of safety, the fetch handler below also explicitly
   ignores anything that isn't a known admin-app asset — so even if it
   were ever loaded in a broader scope by mistake, it would not cache or
   rewrite customer pages, and it never touches Supabase API calls
   (auth, REST, storage) — those always go straight to the network so
   login/session/data stay fully live and unmodified.
   ────────────────────────────────────────────────────────────────────── */

const CACHE_VERSION = "admin-pwa-v1";
const CACHE_NAME = `swahili-treats-admin-${CACHE_VERSION}`;

// The only files this service worker is allowed to cache.
const ADMIN_APP_SHELL = [
  "/admin.html",
  "/login.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
];

function isAdminAsset(url) {
  // Only same-origin admin-app-shell paths are ever handled.
  return url.origin === self.location.origin && ADMIN_APP_SHELL.includes(url.pathname);
}

// ── Install: pre-cache the admin app shell ─────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ADMIN_APP_SHELL.map((path) =>
          fetch(path, { cache: "no-cache" })
            .then((res) => (res.ok ? cache.put(path, res) : null))
            .catch(() => null) // don't fail install if one optional asset 404s
        )
      )
    )
  );
  self.skipWaiting();
});

// ── Activate: drop any old admin cache versions ────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("swahili-treats-admin-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for the admin shell, untouched for everything else ─
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never intercept anything except GETs for our own admin app shell.
  // Supabase auth/API calls, fonts, CDN scripts, the customer site, and
  // anything else simply fall through to the browser's normal network
  // fetch as if this service worker did not exist.
  if (req.method !== "GET" || !isAdminAsset(url)) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        // Keep the cached shell fresh whenever we're online.
        const copy = networkRes.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return networkRes;
      })
      .catch(() =>
        // Offline (or network error): fall back to the last cached version
        // so the dashboard shell still opens instead of showing an error.
        caches.match(req)
      )
  );
});
