// The SSO guard: Plane's own sign-in UI is never drawn (apps/plane-sso, "The web half").
//
// plane-web's nginx puts this into every page's <head>, so it runs before the
// app's module scripts. The edge already sends every page load without a Plane
// session through Authentik (plane-session-check); this covers what happens
// INSIDE an already loaded page, where no edge can reach:
//
//   * an api answer of 401 (the Plane session ended: expired, signed out in
//     another tab, cookie cleared) → straight to /auth/authentik/, back to this
//     page, instead of the app drawing its e-mail form;
//   * the app routing itself to one of its credential screens (sign-in, sign-up,
//     password set / reset / forgot) → the same.
//
// 401s that do not mean "this browser's session is gone" are left alone: the
// X-API-Key api (/api/v1/), published pages (/api/public/) and the instance
// probe (/api/instances/). The page is hidden while it leaves, so the form does
// not flash.
(() => {
	// verify-live B6 asks whether the guard ran; the app drops the tag from <head>.
	window.__planeSsoGuard = true;
	const SSO = "/auth/authentik/";
	// Every credential route of the v1.4.1 web app (apps/plane-sso/test-web.sh
	// fails an upgrade that adds one these do not cover). The edge
	// redirects the same set (gitops/services/plane/base/ingress.yaml).
	const CREDENTIAL = /^\/(?:sign-in|sign-up|signin|login|register|accounts\/[^/]+)\/?$/;
	const NOT_SESSION = /^\/api\/(?:v1|public|instances)\//;
	let leaving = false;

	function nextPath() {
		const here = new URL(window.location.href);
		const onCredentialScreen = here.pathname === "/" || CREDENTIAL.test(here.pathname);
		if (!onCredentialScreen) return here.pathname + here.search;
		const inner = here.searchParams.get("next_path") ?? "";
		return CREDENTIAL.test(inner.split("?")[0]) ? "" : inner;
	}

	function toSSO() {
		if (leaving) return;
		leaving = true;
		document.documentElement.style.visibility = "hidden";
		const next = nextPath();
		window.location.replace(
			SSO + (next && next !== "/" ? `?next_path=${encodeURIComponent(next)}` : ""),
		);
	}

	function sessionGone(url, status) {
		if (status !== 401 || !url) return false;
		try {
			const u = new URL(url, window.location.href);
			return (
				u.origin === window.location.origin &&
				u.pathname.startsWith("/api/") &&
				!NOT_SESSION.test(u.pathname)
			);
		} catch {
			return false;
		}
	}

	// XMLHttpRequest (the app's axios). "loadend" listeners added at send() run
	// after the ones axios set, so this navigation is the one that wins.
	const urls = new WeakMap();
	const open = XMLHttpRequest.prototype.open;
	XMLHttpRequest.prototype.open = function (method, url, ...rest) {
		urls.set(this, String(url));
		return open.call(this, method, url, ...rest);
	};
	const send = XMLHttpRequest.prototype.send;
	XMLHttpRequest.prototype.send = function (...args) {
		this.addEventListener("loadend", () => {
			if (sessionGone(this.responseURL || urls.get(this), this.status)) toSSO();
		});
		return send.apply(this, args);
	};

	const fetch = window.fetch;
	window.fetch = function (...args) {
		return fetch.apply(this, args).then((r) => {
			if (sessionGone(r.url, r.status)) toSSO();
			return r;
		});
	};

	const onRoute = () => {
		if (CREDENTIAL.test(window.location.pathname)) toSSO();
	};
	for (const method of ["pushState", "replaceState"]) {
		const original = window.history[method];
		window.history[method] = function (...args) {
			const result = original.apply(this, args);
			onRoute();
			return result;
		};
	}
	window.addEventListener("popstate", onRoute);
	onRoute();
})();
