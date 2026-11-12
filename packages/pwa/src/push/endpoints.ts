/**
 * The server POSTs to whatever endpoint a browser hands it, so only the browsers' own push
 * services are accepted (no SSRF into the cluster). HTTPS, default port, and a host that is one
 * of these or under one of the wildcard suffixes.
 */
const EXACT: ReadonlySet<string> = new Set([
	// Chrome, Edge (Chromium), Opera, Samsung Internet, Brave
	"fcm.googleapis.com",
	"android.googleapis.com",
	// Safari (macOS 13+, iOS/iPadOS 16.4+ installed web apps)
	"web.push.apple.com",
	"api.push.apple.com",
	"api.sandbox.push.apple.com",
]);

const SUFFIXES: ReadonlyArray<string> = [
	// Firefox (autopush)
	".push.services.mozilla.com",
	// Edge (legacy WNS)
	".notify.windows.com",
];

export function allowedPushEndpoint(endpoint: string): boolean {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}
	if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") {
		return false;
	}
	const host = url.hostname.toLowerCase();
	return EXACT.has(host) || SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length);
}
