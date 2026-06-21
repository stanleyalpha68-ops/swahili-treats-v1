/* ──────────────────────────────────────────────────────────────────────────
   Swahili Treats — ADMIN-ONLY service worker  (v2 — with Push Notifications)

   Scope: "/admin.html" and "/login.html" only. Never touches the storefront.
   ────────────────────────────────────────────────────────────────────── */

const CACHE_VERSION = "admin-pwa-v2";
const CACHE_NAME = `swahili-treats-admin-${CACHE_VERSION}`;

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
  return url.origin === self.location.origin && ADMIN_APP_SHELL.includes(url.pathname);
}

// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ADMIN_APP_SHELL.map((path) =>
          fetch(path, { cache: "no-cache" })
            .then((res) => (res.ok ? cache.put(path, res) : null))
            .catch(() => null)
        )
      )
    )
  );
  self.skipWaiting();
});

// ── Activate ───────────────────────────────────────────────────────────────
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

// ── Fetch: network-first for admin shell only ──────────────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET" || !isAdminAsset(url)) return;

  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        const copy = networkRes.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return networkRes;
      })
      .catch(() => caches.match(req))
  );
});

// ── Push: show notification when a push event arrives ─────────────────────
self.addEventListener("push", (event) => {
  let data = {
    title: "🛍️ New Order!",
    body: "A new order has been placed.",
    icon: "/icons/icon-192.png",
    badge: "/icons/favicon-32.png",
    tag: "new-order",
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch (e) {
    // use defaults above
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      renotify: true,
      vibrate: [200, 100, 200, 100, 400],
      data: { url: "/admin.html" },
      actions: [{ action: "view", title: "View Orders" }],
    })
  );
});

// ── Notification click: open / focus admin tab ─────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : "/admin.html";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes("admin.html") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ── Message from page: show in-SW notification (used when tab IS open) ────
// The page sends { type: "NEW_ORDER", title, body } via postMessage.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "NEW_ORDER") {
    self.registration.showNotification(event.data.title || "🛍️ New Order!", {
      body: event.data.body || "A new order has just been placed.",
      icon: "/icons/icon-192.png",
      badge: "/icons/favicon-32.png",
      tag: "new-order-" + Date.now(),
      renotify: true,
      vibrate: [200, 100, 200, 100, 400],
      data: { url: "/admin.html" },
      actions: [{ action: "view", title: "View Orders" }],
    });
  }
});
