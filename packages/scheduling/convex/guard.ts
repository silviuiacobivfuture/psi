import { ConvexError } from "convex/values";

/**
 * Every public function is the server's, never a browser's: it demands the shared key held only
 * by psi's servers (`PSI_SCHEDULING_KEY`, set in the deployment with `convex env set`). It fails
 * closed: a deployment without the key refuses every call. Who may see or change which calendar
 * is decided before the call, by the app, through OpenFGA (docs/plans/scheduling.md); Convex
 * records the staff subject it was given.
 */
export const SERVER_KEY_ENV = "PSI_SCHEDULING_KEY";

/** Compares two strings in time that depends only on their lengths. */
export function sameSecret(a: string, b: string): boolean {
	let diff = a.length ^ b.length;
	const length = Math.max(a.length, b.length);
	for (let i = 0; i < length; i += 1) {
		diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
	}
	return diff === 0;
}

/** Throws `unauthorized` unless `key` is the deployment's server key (and one is set). */
export function requireServer(key: string): void {
	const expected = process.env[SERVER_KEY_ENV];
	if (expected === undefined || expected.length < 32 || !sameSecret(key, expected)) {
		throw new ConvexError("unauthorized");
	}
}
