// /_${ESTATE_SLUG}/me — the signed-in person, for the estate's bar (apps/pdfcraft-bar).
//
// Authentik's forward-auth gate passes the person to this pod as request headers
// (X-authentik-name, X-authentik-email; gitops/platform/authentik/
// middleware-forwardauth.yaml). They are answered as JSON built by
// JSON.stringify — never spliced into a page, where a name holding a quote or an
// angle bracket would be markup. Nothing is stored and nothing else is read.
//
// njs (nginx's JavaScript module, shipped in the image as ngx_http_js_module).
function me(r) {
	const name = r.headersIn["X-authentik-name"] || "";
	const email = r.headersIn["X-authentik-email"] || "";
	r.headersOut["Content-Type"] = "application/json; charset=utf-8";
	r.headersOut["Cache-Control"] = "no-store";
	r.headersOut["X-Content-Type-Options"] = "nosniff";
	r.return(200, JSON.stringify({ name: name, email: email }));
}

export default { me };
