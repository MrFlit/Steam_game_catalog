const CACHE_NAME = "game-catalog-v4";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(SHELL)
    )
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  // API calls must always go to the network.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Keep same-origin document/navigation fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();

          caches
            .open(CACHE_NAME)
            .then((cache) =>
              cache.put("/", copy)
            );

          return response;
        })
        .catch(() => caches.match("/"))
    );

    return;
  }

  // Cache the local PWA shell and static assets.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request)
            .then((response) => {
              if (response.ok) {
                const copy =
                  response.clone();

                caches
                  .open(CACHE_NAME)
                  .then((cache) =>
                    cache.put(
                      request,
                      copy
                    )
                  );
              }

              return response;
            })
      )
    );

    return;
  }

  // Cache images from our Supabase storage when possible.
  if (
    request.destination === "image" &&
    url.hostname.endsWith(
      ".supabase.co"
    )
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request)
            .then((response) => {
              const copy =
                response.clone();

              caches
                .open(CACHE_NAME)
                .then((cache) =>
                  cache.put(
                    request,
                    copy
                  )
                );

              return response;
            })
            .catch(() =>
              cached ||
              Response.error()
            )
      )
    );
  }
});
