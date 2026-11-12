import { createHmac, randomBytes } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";

/**
 * The visitor's keys for the guide's exchange limit, each counted on its own. They exist only to
 * stop abuse (one browser or one machine running up questions); they carry no identity and are
 * never shown, logged or sent anywhere but the limiter. For the privacy page:
 *
 * - `psi_guide_session`: a random id, httpOnly, SameSite=Lax, gone when the browser closes;
 * - `psi_guide_browser`: a random id, httpOnly, SameSite=Lax, kept for one year;
 * - no cookie: a fingerprint, an HMAC of the client address (`x-forwarded-for`), the user agent
 *   and `accept-language` under a salt that changes every day (UTC). The inputs are never stored;
 *   the hash cannot be reversed and cannot be linked across days.
 */
export const SESSION_COOKIE = "psi_guide_session";
export const BROWSER_COOKIE = "psi_guide_browser";
const YEAR_SECONDS = 365 * 24 * 3600;
const ID = /^[A-Za-z0-9_-]{16,64}$/;

/** Per-process daily salts, or salts derived from `PSI_GUIDE_FINGERPRINT_SECRET` (several instances). */
const salts = new Map<string, Buffer>();
const PROCESS_SECRET = randomBytes(32);

function dailySalt(day: string): Buffer {
	let salt = salts.get(day);
	if (salt === undefined) {
		const secret = process.env.PSI_GUIDE_FINGERPRINT_SECRET?.trim();
		salt = createHmac("sha256", secret === undefined || secret === "" ? PROCESS_SECRET : secret)
			.update(day)
			.digest();
		salts.clear();
		salts.set(day, salt);
	}
	return salt;
}

function cookieId(c: Context, name: string, maxAge: number | undefined): string {
	const held = getCookie(c, name);
	if (held !== undefined && ID.test(held)) return held;
	const id = randomBytes(18).toString("base64url");
	const secure =
		new URL(c.req.url).protocol === "https:" || c.req.header("x-forwarded-proto") === "https";
	setCookie(c, name, id, {
		httpOnly: true,
		sameSite: "Lax",
		path: "/",
		secure,
		...(maxAge === undefined ? {} : { maxAge }),
	});
	return id;
}

/** The daily fingerprint: an HMAC of address, user agent and language; never the inputs. */
export function fingerprint(c: Context, now: Date = new Date()): string {
	const address =
		c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
		c.req.header("x-real-ip")?.trim() ||
		"";
	const parts = [address, c.req.header("user-agent") ?? "", c.req.header("accept-language") ?? ""];
	return createHmac("sha256", dailySalt(now.toISOString().slice(0, 10)))
		.update(parts.join("\n"))
		.digest("base64url");
}

/**
 * The three keys for this request (`AskControl.visitorKeys`), setting the two cookies when the
 * browser does not hold them yet. Call it before the response starts streaming.
 */
export function visitorKeysFor(c: Context): ReadonlyArray<string> {
	const keys = [
		`session:${cookieId(c, SESSION_COOKIE, undefined)}`,
		`browser:${cookieId(c, BROWSER_COOKIE, YEAR_SECONDS)}`,
	];
	// Without a client address the fingerprint would put everyone with one browser in one bucket.
	const address =
		c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip")?.trim();
	return address ? [...keys, `fingerprint:${fingerprint(c)}`] : keys;
}
