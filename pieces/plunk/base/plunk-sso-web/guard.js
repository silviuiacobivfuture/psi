// plunk-sso guard — injected before </head> of every Plunk dashboard page by the
// nginx template beside it. Plunk's OWN sign-in, sign-up and password screens are
// never drawn for a person: the edge redirects a browser that ASKS for one
// (Ingress plunk-credential-routes), and this catches the dashboard routing to
// one by itself — a session that expired mid-use (router.push('/auth/login')) or
// a sign-out (Plunk 0.17.0 signs out with a client-side push, which never reaches
// the edge). Either way the browser goes to /auth/authentik/, which signs the
// person in again, or — after a sign-out — ends the Authentik session too.
// The page is hidden while it leaves, so the form never flashes.
// apps/plunk-sso/build.sh fails an upgrade whose dashboard ships an /auth/* page
// that is missing from CREDENTIAL below.
(() => {
	const CREDENTIAL = /^\/auth\/(login|signup|reset-password|verify-email)(\/|$)/;
	const leave = () => {
		document.documentElement.style.visibility = "hidden";
		const here = CREDENTIAL.test(location.pathname) ? "/" : location.pathname + location.search;
		location.replace(`/auth/authentik/?next=${encodeURIComponent(here)}`);
	};
	if (CREDENTIAL.test(location.pathname)) return leave();
	for (const m of ["pushState", "replaceState"]) {
		const orig = history[m];
		history[m] = function (state, title, url) {
			if (
				url !== undefined &&
				url !== null &&
				CREDENTIAL.test(new URL(String(url), location.href).pathname)
			)
				return leave();
			return orig.call(this, state, title, url);
		};
	}
	addEventListener("popstate", () => {
		if (CREDENTIAL.test(location.pathname)) leave();
	});
})();
