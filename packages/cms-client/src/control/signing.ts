import { signWebhook, verifyWebhook } from "../signing";

/**
 * The control plane's requests between the CMS and the four sites, both ways, signed with one
 * shared secret (`PSI_CONTROL_SECRET`, ≥ 32 characters, OpenBao `secret/apps/control`). The HMAC
 * covers the method, the path with its query, the time it was sent, the acting staff member and
 * the body, so a captured request cannot be replayed after five minutes, moved to another route or
 * re-attributed. None of these routes is public: without the secret they answer 503, with a wrong
 * signature 401.
 */
export const CONTROL_PREFIX = "/__control";
export const CONTROL_SIGNATURE_HEADER = "x-psi-control-signature";
export const CONTROL_SENT_AT_HEADER = "x-psi-control-sent-at";
/** Who acts, for the site's log: the CMS user's id (never an e-mail). */
export const CONTROL_ACTOR_HEADER = "x-psi-control-actor";
export const CONTROL_MAX_AGE_MS = 5 * 60 * 1000;
export const CONTROL_MIN_SECRET = 32;

function canonical(method: string, path: string, sentAt: string, actor: string, body: string) {
	return `${method.toUpperCase()}\n${path}\n${sentAt}\n${actor}\n${body}`;
}

export interface SignedControl {
	headers: Record<string, string>;
	body: string;
}

/** The headers (and body) of one signed request. `path` includes its query string. */
export function signControl(input: {
	method: string;
	path: string;
	body?: string;
	actor: string;
	secret: string;
	now?: () => number;
}): SignedControl {
	const body = input.body ?? "";
	const sentAt = new Date((input.now ?? Date.now)()).toISOString();
	const mac = signWebhook(
		canonical(input.method, input.path, sentAt, input.actor, body),
		input.secret,
	);
	return {
		body,
		headers: {
			[CONTROL_SIGNATURE_HEADER]: `sha256=${mac}`,
			[CONTROL_SENT_AT_HEADER]: sentAt,
			[CONTROL_ACTOR_HEADER]: input.actor,
		},
	};
}

export type VerifiedControl =
	| { ok: true; actor: string; body: string; path: string }
	| { ok: false; status: 401 | 503 };

/** The receiving side: the request's body, path and actor once its signature and age check out. */
export async function verifyControl(
	request: Request,
	secret: string | null | undefined,
	now: () => number = Date.now,
): Promise<VerifiedControl> {
	if (secret === null || secret === undefined || secret.length < CONTROL_MIN_SECRET) {
		return { ok: false, status: 503 };
	}
	const url = new URL(request.url);
	const path = `${url.pathname}${url.search}`;
	const sentAt = request.headers.get(CONTROL_SENT_AT_HEADER) ?? "";
	const actor = request.headers.get(CONTROL_ACTOR_HEADER) ?? "";
	const given = (request.headers.get(CONTROL_SIGNATURE_HEADER) ?? "").replace(/^sha256=/, "");
	const at = Date.parse(sentAt);
	const body = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
	if (
		actor === "" ||
		actor.length > 200 ||
		Number.isNaN(at) ||
		Math.abs(now() - at) > CONTROL_MAX_AGE_MS ||
		!verifyWebhook(canonical(request.method, path, sentAt, actor, body), given, secret)
	) {
		return { ok: false, status: 401 };
	}
	return { ok: true, actor, body, path: url.pathname };
}
