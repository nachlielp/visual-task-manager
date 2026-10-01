/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Precache the app shell (injected at build time by vite-plugin-pwa).
precacheAndRoute(self.__WB_MANIFEST);

// Runtime-cache Google Fonts (drop these two routes if the app self-hosts fonts).
registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com",
  new CacheFirst({
    cacheName: "google-fonts-cache",
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);
registerRoute(
  ({ url }) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: "gstatic-fonts-cache",
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);

// Activate each new build immediately; the client reloads on controllerchange
// (see the registration block in main.tsx).
void self.skipWaiting();
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Show server-pushed notifications. This fires even when the PWA is
// backgrounded or closed. The payload carries optional title/body/tag/url;
// missing fields fall back to app defaults.
self.addEventListener("push", (event: PushEvent) => {
  let data: { title?: string; body?: string; tag?: string; url?: string } = {};
  try {
    if (event.data) data = event.data.json();
  } catch {
    // ignore malformed payloads
  }

  const title = data.title ?? "Task Board";
  const body = data.body ?? "You have a new notification.";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      // Same tag replaces the previous notification instead of stacking.
      tag: data.tag ?? "default",
      data: { url: data.url },
    })
  );
});

// Focus an open tab on click — navigating it to the notification's target
// page when one is named — or open a new window there.
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            void client.focus();
            if (url && "navigate" in client) {
              void client.navigate(url);
            }
            return;
          }
        }
        return self.clients.openWindow(url ?? "/").then(() => undefined);
      })
  );
});
