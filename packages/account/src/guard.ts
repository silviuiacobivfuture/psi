import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { type AuthzClient, checkKey } from "./authz/client";
import { AuthzError } from "./authz/errors";
import { recordTuples } from "./authz/tuples";
import { hashSessionId } from "./seal";
import type { SessionStore } from "./stores/types";

const Vouched = z.object({ email: z.string().email().max(254), email_verified: z.literal(true) });

/** The `email` of an ID token whose `email_verified` is exactly true; null for anything else (absent, false, malformed). */
export function verifiedEmailOf(idToken: string | undefined): string | null {
	const payload = idToken?.split(".")[1];
	if (payload === undefined) return null;
	try {
		const parsed = Vouched.safeParse(
			JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
		);
		return parsed.success ? parsed.data.email : null;
	} catch {
		return null;
	}
}

/** The signed-in person, as a request sees them. Nothing here is a permission. */
export interface SignedIn {
	subject: string;
	/** The OpenFGA subject: `user:<sub>`. */
	user: string;
	email: string | null;
	name: string | null;
}

/** A record a site owns, described for a Check (docs/plans/accounts.md §4). */
export interface RecordRef {
	/** `blog_saved_article:<id>` */
	object: string;
	/** The owner's `sub`, from the site's own row; null when the row has none. */
	owner: string | null;
	/** What the owner holds on it, e.g. ["viewer", "editor"]. */
	ownerRelations: ReadonlyArray<string>;
}

/** A decision, three-valued: an outage is never a denial, and never an allow (cache wall: fail closed). */
export type Decision = "allowed" | "denied" | "unavailable";

/** The estate's platform object: the scope of every psi record. */
export const PLATFORM = "platform:psi";

export const IDLE_MS = 8 * 3600_000;
export const ABSOLUTE_MS = 30 * 24 * 3600_000;
const TOUCH_EVERY_MS = 5 * 60_000;

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The sites are same-site with each other, so `SameSite=Lax` alone lets one post to another. A write is accepted
 * only from this site's own origin (the CMS's rule).
 */
export function sameOrigin(headers: Headers, method: string, origin: string): boolean {
	const o = headers.get("origin");
	if (o !== null && o !== origin) return false;
	if (SAFE.has(method.toUpperCase())) return true;
	const site = headers.get("sec-fetch-site");
	return site === null || site === "same-origin" || site === "none";
}

/** Printable ASCII only: URL parsers strip tabs and newlines, so `/\t/evil.test` becomes `//evil.test`. */
const PRINTABLE_PATH = /^\/[\x21-\x7e]*$/;
const PROBE_ORIGIN = "https://same-origin.invalid";

/**
 * A same-origin path to return to after sign-in; anything else falls back (the open-redirect guard). The path must
 * be printable ASCII, start with one `/`, and still resolve to the same origin once a URL parser has read it.
 */
/** The path of a same-host Referer, checked like any return target; "/" otherwise. */
export function refererPath(referer: string | undefined, host: string): string {
	if (referer === undefined) return "/";
	try {
		const url = new URL(referer);
		if (url.host !== host) return "/";
		return safeReturn(`${url.pathname}${url.search}`, "/");
	} catch {
		return "/";
	}
}

export function safeReturn(raw: string | undefined, fallback: string): string {
	if (
		raw === undefined ||
		!PRINTABLE_PATH.test(raw) ||
		raw.startsWith("//") ||
		raw.includes("\\")
	) {
		return fallback;
	}
	const resolved = new URL(raw, PROBE_ORIGIN);
	if (resolved.origin !== PROBE_ORIGIN) return fallback;
	return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export interface GuardDeps {
	cookieName: string;
	sessions: () => Promise<SessionStore>;
	authz: AuthzClient | null;
	now: () => number;
	signInPath: string;
	onWarn: (message: string) => void;
}

export interface Guard {
	/** Loads the session (once per request). Never refuses: public pages stay public. */
	session(): MiddlewareHandler;
	current(c: Context): SignedIn | null;
	/** Loads the session if no middleware did yet, and answers who is asking. */
	person(c: Context): Promise<SignedIn | null>;
	/**
	 * The ID token this person's session holds, for calling a service AS them (it names the site's own client as its
	 * audience). Null when signed out. It may be past its expiry: the service refuses it and the site sends the person
	 * through sign-in again, which is silent while the provider still has their session.
	 */
	idToken(c: Context): Promise<string | null>;
	/**
	 * The e-mail the provider vouched for when this person signed in: the session's ID token says `email_verified: true`
	 * (the token came from the provider in the code exchange, checked there). Null otherwise, or when signed out.
	 */
	verifiedEmail(c: Context): Promise<string | null>;
	/** To sign-in and back: a GET to itself, a write to the same-origin page it came from (or home). */
	requireSignIn(): MiddlewareHandler;
	decide(c: Context, relation: string, record: RecordRef): Promise<Decision>;
	/** Many records at once; a record OpenFGA gave no answer for is "unavailable", never "denied". */
	decideMany(
		c: Context,
		relation: string,
		records: ReadonlyArray<RecordRef>,
	): Promise<Map<string, Decision>>;
	/** Middleware: sign-in, then a Check. Denied → 404 (existence is not told), outage → 503. */
	can(
		relation: string,
		resolve: (c: Context) => Promise<RecordRef | null>,
		answers?: {
			denied?: (c: Context) => Response | Promise<Response>;
			unavailable?: (c: Context) => Response | Promise<Response>;
		},
	): MiddlewareHandler;
}

export function createGuard(deps: GuardDeps): Guard {
	const seen = new WeakMap<Request, SignedIn | null>();
	const tokens = new WeakMap<Request, string>();

	async function load(c: Context): Promise<SignedIn | null> {
		const cached = seen.get(c.req.raw);
		if (cached !== undefined) return cached;
		let found: SignedIn | null = null;
		const id = getCookie(c, deps.cookieName, "host");
		if (id !== undefined && id !== "") {
			const store = await deps.sessions();
			const hash = hashSessionId(id);
			const rec = await store.read(hash);
			const now = deps.now();
			if (rec !== null) {
				if (now - rec.lastSeenAt > IDLE_MS || now - rec.createdAt > ABSOLUTE_MS) {
					await store.remove(hash);
				} else {
					if (now - rec.lastSeenAt > TOUCH_EVERY_MS) await store.touch(hash, now);
					tokens.set(c.req.raw, rec.idToken);
					found = {
						subject: rec.subject,
						user: `user:${rec.subject}`,
						email: rec.email,
						name: rec.name,
					};
				}
			}
		}
		seen.set(c.req.raw, found);
		return found;
	}

	function toDecision(err: unknown): Decision {
		if (err instanceof AuthzError) {
			deps.onWarn(`authz ${err.code}: ${err.message}`);
			return "unavailable";
		}
		throw err;
	}

	const guard: Guard = {
		session() {
			return async (c, next) => {
				await load(c);
				await next();
			};
		},

		current(c) {
			return seen.get(c.req.raw) ?? null;
		},

		person(c) {
			return load(c);
		},

		async idToken(c) {
			return (await load(c)) === null ? null : (tokens.get(c.req.raw) ?? null);
		},

		async verifiedEmail(c) {
			if ((await load(c)) === null) return null;
			return verifiedEmailOf(tokens.get(c.req.raw));
		},

		requireSignIn() {
			return async (c, next) => {
				if ((await load(c)) !== null) return next();
				if (c.req.method === "GET") {
					const back = new URL(c.req.url);
					const target = `${deps.signInPath}?return=${encodeURIComponent(`${back.pathname}${back.search}`)}`;
					return c.redirect(target, 302);
				}
				// A write whose session ended: through sign-in back to the page it was sent from (same
				// origin only), never a blank 401 — a signed-out person is never left at a dead end.
				const back = refererPath(c.req.header("referer"), new URL(c.req.url).host);
				return c.redirect(`${deps.signInPath}?return=${encodeURIComponent(back)}`, 303);
			};
		},

		async decide(c, relation, record) {
			const who = await load(c);
			if (who === null) return "denied";
			if (deps.authz === null) return "unavailable";
			try {
				const allowed = await deps.authz.check(
					{ user: who.user, relation, object: record.object },
					{ tuples: recordTuples({ ...record, platform: PLATFORM }) },
				);
				return allowed ? "allowed" : "denied";
			} catch (err) {
				return toDecision(err);
			}
		},

		async decideMany(c, relation, records) {
			const out = new Map<string, Decision>();
			const who = await load(c);
			if (who === null || records.length === 0) {
				for (const r of records) out.set(r.object, "denied");
				return out;
			}
			if (deps.authz === null) {
				for (const r of records) out.set(r.object, "unavailable");
				return out;
			}
			try {
				const answers = await deps.authz.batchCheck(
					records.map((r) => ({ user: who.user, relation, object: r.object })),
					{
						tuplesFor: (req) => {
							const r = records.find((x) => x.object === req.object);
							return r === undefined ? [] : recordTuples({ ...r, platform: PLATFORM });
						},
					},
				);
				for (const r of records) {
					const a = answers.get(checkKey({ user: who.user, relation, object: r.object }));
					out.set(r.object, a === undefined ? "unavailable" : a ? "allowed" : "denied");
				}
			} catch (err) {
				const d = toDecision(err);
				for (const r of records) out.set(r.object, d);
			}
			return out;
		},

		can(relation, resolve, answers) {
			const signIn = guard.requireSignIn();
			return async (c, next) => {
				if ((await load(c)) === null) return signIn(c, next);
				const record = await resolve(c);
				const decision = record === null ? "denied" : await guard.decide(c, relation, record);
				if (decision === "allowed") return next();
				if (decision === "unavailable") return answers?.unavailable?.(c) ?? c.body(null, 503);
				return answers?.denied?.(c) ?? c.body(null, 404);
			};
		},
	};
	return guard;
}
