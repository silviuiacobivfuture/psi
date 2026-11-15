/**
 * How long a CMS sign-in lasts: the estate's SESSION_LIFETIME (estate/identity.yaml, rendered into
 * the whitelabel ConfigMap and from there into this pod's env by gitops/services/cms/overlays/dev).
 * The same grammar SEB's identity loader and the hub accept (tools/identity/lib/session.mjs):
 *
 *   never   nobody is signed out for time passing or for being away, on any number of devices
 *   <n>h    a sign-in ends after n hours WITHOUT USE; every use extends it
 *   <n>d    the same, in days
 *
 * A session still ends when the person signs out (Payload removes it) or when the directory
 * disables them (directory-check.ts removes it within minutes).
 */
export const SESSION_NEVER = "never";

/**
 * The longest a browser keeps a cookie, counted from the last time it is set (RFC 6265bis caps
 * Max-Age and Expires at 400 days; Chrome, Firefox and Safari apply it). "never" is therefore
 * 400 days since the last use, renewed at every use: the same bound SEB's relying parties keep.
 */
export const BROWSER_COOKIE_CAP_SECONDS = 400 * 24 * 60 * 60;

/** How often, at most, a session in use is renewed: hourly, or a quarter of a shorter lifetime. */
const SLIDE_EVERY_MAX_MS = 60 * 60 * 1000;

const DURATION = /^([1-9][0-9]{0,4})([hd])$/;

/**
 * The estate's setting as the seconds a CMS sign-in (its token, cookie and Payload session) lasts
 * after its last renewal. Absent or blank is "never", as for every SEB layer. Anything else is a
 * mistake in the estate's identity and stops the process with the key's name.
 */
export function sessionSeconds(raw: string | undefined): number {
	const life = raw === undefined || raw === "" ? SESSION_NEVER : raw;
	if (life === SESSION_NEVER) return BROWSER_COOKIE_CAP_SECONDS;
	const m = DURATION.exec(life);
	if (m === null || m[1] === undefined) {
		throw new Error(
			`SESSION_LIFETIME must be "never" or <n>h / <n>d (got ${JSON.stringify(life)})`,
		);
	}
	const seconds = Number(m[1]) * (m[2] === "d" ? 86_400 : 3_600);
	return Math.min(seconds, BROWSER_COOKIE_CAP_SECONDS);
}

/**
 * Whether the session in this browser is due to be renewed: its token was issued (expiry minus
 * lifetime) at least `min(lifetime / 4, 1 hour)` ago. An unknown expiry, or one already past, is
 * never renewed here (Payload's own expiry handling signs the person out of an expired one).
 */
export function slideDue(
	expiresAtMs: number | undefined,
	nowMs: number,
	lifetimeSeconds: number,
): boolean {
	if (expiresAtMs === undefined || !Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs)
		return false;
	const lifetimeMs = lifetimeSeconds * 1000;
	const issuedAtMs = expiresAtMs - lifetimeMs;
	return nowMs - issuedAtMs >= Math.min(lifetimeMs / 4, SLIDE_EVERY_MAX_MS);
}
