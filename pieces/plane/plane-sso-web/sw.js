// Plane's service worker, retired (apps/plane-sso, "The web half").
//
// Served at /sw.js instead of upstream's caching worker. A browser that ever
// installed Plane's worker fetches this file on its next visit (the browser's own
// update check), and this version: takes over at once, empties Cache Storage,
// unregisters itself and reloads every Plane tab it controlled. After that the
// tabs talk to the network, where the edge's SSO gate is. Nothing registers a
// worker again (v1.4.1's web app has no registration of its own).
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			await self.clients.claim();
			for (const key of await caches.keys()) await caches.delete(key);
			const tabs = await self.clients.matchAll({ type: "window" });
			await self.registration.unregister();
			for (const tab of tabs) tab.navigate(tab.url);
		})(),
	);
});
