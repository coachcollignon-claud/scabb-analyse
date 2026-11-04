// Service worker minimal : rend l'application installable, toujours en ligne (les données live viennent du serveur).
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => self.clients.claim());
self.addEventListener("fetch", () => {});
