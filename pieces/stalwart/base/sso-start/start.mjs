// The sign-in start for Stalwart's own pages (<MAIL_ADMIN_HOST>/admin and /account): the person
// is already signed in at the Authentik gate, so the panel opens without its "Enter your account
// name to continue" box (sso-start.yaml says why and how the requests reach this page).
//
// WHAT IT DOES is exactly the panel's own sign-in start (Stalwart WebUI, shipped in
// STALWART_WEBUI_VERIFIED), with the account name the gate already knows instead of a typed one,
// and WITHOUT `prompt=login`, the one parameter that would make Authentik ask for the password
// again:
//   1. the account: the gate's identity (X-authentik-email, which this page's server echoes)
//   2. the panel's settings: its client id and scopes, read from the panel's own page
//   3. discovery: GET /api/discover/<account>, the server's answer for where that account signs in
//   4. PKCE: a fresh verifier and its S256 challenge, a fresh state
//   5. the verifier, state, token endpoint, return path, client id, resource and end-session
//      endpoint into this tab's sessionStorage, under the keys the panel's callback reads
//   6. the browser to the identity provider's authorize endpoint
// The identity provider answers at once (the person has its session), back to the panel's OWN
// callback (<base>/oauth/callback), which exchanges the code for tokens itself. Nothing here
// holds a token, writes a session, or changes a byte of Stalwart.
//
// STALWART_WEBUI_VERIFIED: the server version whose panel this was read from (the sessionStorage
// keys and their meaning are the panel's, not a public interface). The gate
// .github/scripts/tests/stalwart-sso-start_test.sh fails when the server image moves off it, so a
// version bump re-reads the panel before anyone relies on this.

export const STALWART_WEBUI_VERIFIED = "v1.0.3";

// The panel's sessionStorage prefix and the keys its callback reads.
export const KEY_PREFIX = "stalwart-oauth-";
export const KEYS = [
	"code_verifier",
	"token_endpoint",
	"state",
	"return_url",
	"client_id",
	"resource",
	"end_session_endpoint",
];

// The panel's page the starter reads settings from: the only document path of the panel that the
// Ingress gives to the server rather than to this page.
export const PANEL_PAGE = "/oauth/callback";

const VERIFIER_ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

export class StartError extends Error {
	constructor(reason, detail) {
		super(`${reason}${detail ? `: ${detail}` : ""}`);
		this.name = "StartError";
		this.reason = reason;
	}
}

/** "/admin" or "/account": the panel this request is for. */
export function basePath(pathname) {
	const seg = pathname.split("/")[1];
	if (seg !== "admin" && seg !== "account")
		throw new StartError("not-a-panel", pathname);
	return `/${seg}`;
}

/** Where the panel's callback lands afterwards: the panel's own rule (its sign-in and callback
 *  pages return to the panel's start, everything else to itself). */
export function returnUrl(base, pathname, search) {
	const full = pathname + search;
	const rel = full.startsWith(base) ? full.slice(base.length) : full;
	const toStart =
		rel === "/login" ||
		rel.startsWith("/login?") ||
		rel === PANEL_PAGE ||
		rel.startsWith(`${PANEL_PAGE}?`);
	return toStart ? "" : full;
}

/** The content of <meta name="..."> in an HTML page (attribute order free, entities decoded). */
export function metaContent(html, name) {
	for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
		const attrs = {};
		for (const m of tag.matchAll(
			/([a-zA-Z_:][-\w:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g,
		)) {
			attrs[m[1].toLowerCase()] = (m[3] ?? m[4])
				.replace(/&quot;/g, '"')
				.replace(/&#39;/g, "'")
				.replace(/&lt;/g, "<")
				.replace(/&gt;/g, ">")
				.replace(/&amp;/g, "&");
		}
		if (attrs.name === name) return attrs.content ?? null;
	}
	return null;
}

/** The scope the panel asks for: the server's required scopes, then the page's own. */
export function scopeFor(discovery, pageScopes) {
	const req = discovery.stalwart_required_scopes;
	const base = Array.isArray(req)
		? req.filter((s) => typeof s === "string" && s.length > 0)
		: discovery.scopes_supported?.includes("openid")
			? ["openid"]
			: [];
	return [...new Set([...base, ...pageScopes])].join(" ");
}

/** The resource indicator: this origin, when it is https and the server lists it (or lists none). */
export function resourceFor(origin, discovery) {
	let o;
	try {
		const u = new URL(origin);
		if (u.protocol !== "https:") return null;
		o = u.origin;
	} catch {
		return null;
	}
	const listed = discovery.protected_resources;
	return Array.isArray(listed) && !listed.includes(o) ? null : o;
}

export function codeVerifier(crypto, length = 64) {
	const out = [];
	while (out.length < length) {
		const bytes = new Uint8Array(length * 2);
		crypto.getRandomValues(bytes);
		for (let i = 0; i < bytes.length && out.length < length; i++) {
			if (bytes[i] < 198) out.push(VERIFIER_ALPHABET[bytes[i] % 66]);
		}
	}
	return out.join("");
}

export async function s256(crypto, verifier) {
	const digest = new Uint8Array(
		await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
	);
	return btoa(Array.from(digest, (b) => String.fromCodePoint(b)).join(""))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

export function newState(crypto) {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getText(win, url, reason) {
	let res;
	try {
		res = await win.fetch(url, {
			credentials: "same-origin",
			cache: "no-store",
		});
	} catch (e) {
		throw new StartError(reason, e instanceof Error ? e.message : String(e));
	}
	if (!res.ok) throw new StartError(reason, `${res.status}`);
	return res.text();
}

/**
 * Everything up to the redirect, with nothing written unless every step succeeded.
 * Returns the authorize URL; `run` stores and navigates.
 */
export async function prepare(win) {
	const { origin, pathname, search } = win.location;
	const base = basePath(pathname);

	const account = (
		await getText(win, `${base}/_sso/account`, "no-identity")
	).trim();
	if (!account)
		throw new StartError("no-identity", "the gate passed no address");

	const page = await getText(win, `${base}${PANEL_PAGE}`, "no-panel");
	const clientId = metaContent(page, "oauth-client-id")?.trim();
	if (!clientId)
		throw new StartError("no-panel", "the panel's page names no client id");
	const pageScopes = (metaContent(page, "oauth-scopes") ?? "")
		.split(/\s+/)
		.filter((s) => s.length > 0);

	let discovery;
	try {
		discovery = JSON.parse(
			await getText(
				win,
				`/api/discover/${encodeURIComponent(account)}`,
				"discovery",
			),
		);
	} catch (e) {
		if (e instanceof StartError) throw e;
		throw new StartError("discovery", "not JSON");
	}
	const {
		authorization_endpoint: authorize,
		token_endpoint: token,
		end_session_endpoint: endSession,
	} = discovery ?? {};
	if (
		typeof authorize !== "string" ||
		!authorize ||
		typeof token !== "string" ||
		!token
	) {
		throw new StartError("discovery", "no authorize or token endpoint");
	}

	const verifier = codeVerifier(win.crypto);
	const challenge = await s256(win.crypto, verifier);
	const state = newState(win.crypto);
	const resource = resourceFor(origin, discovery);
	const redirectUri = `${origin}${base}${PANEL_PAGE}`;

	const params = new URLSearchParams({
		response_type: "code",
		client_id: clientId,
		redirect_uri: redirectUri,
		code_challenge: challenge,
		code_challenge_method: "S256",
		state,
		login_hint: account,
	});
	const scope = scopeFor(discovery, pageScopes);
	if (scope) params.set("scope", scope);
	if (resource) params.set("resource", resource);

	return {
		url: `${authorize}?${params.toString()}`,
		store: {
			code_verifier: verifier,
			token_endpoint: token,
			state,
			return_url: returnUrl(base, pathname, search),
			client_id: clientId,
			resource,
			end_session_endpoint:
				typeof endSession === "string" && endSession ? endSession : null,
		},
	};
}

export async function run(win) {
	const { url, store } = await prepare(win);
	for (const k of KEYS) {
		const v = store[k];
		if (v === null) win.sessionStorage.removeItem(`${KEY_PREFIX}${k}`);
		else win.sessionStorage.setItem(`${KEY_PREFIX}${k}`, v);
	}
	win.location.replace(url);
	return url;
}
