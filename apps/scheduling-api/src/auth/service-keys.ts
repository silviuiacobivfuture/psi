import { createHash, timingSafeEqual } from "node:crypto";
import type { CallerConfig } from "../config";

export type KeyResult = { ok: true; callerId: string; app: string } | { ok: false };

/**
 * Service keys are `<caller id>.<secret>`; only the secret's SHA-256 is configured. The comparison is constant-time
 * and an unknown caller costs the same hash as a known one.
 */
export function verifyServiceKey(
	presented: string,
	callers: readonly CallerConfig[],
	hashes: ReadonlyMap<string, string>,
): KeyResult {
	const dot = presented.indexOf(".");
	const id = dot > 0 ? presented.slice(0, dot) : "";
	const secret = dot > 0 ? presented.slice(dot + 1) : presented;
	const digest = createHash("sha256").update(secret, "utf8").digest();
	const caller = callers.find((c) => c.id === id);
	const expected = caller === undefined ? undefined : hashes.get(caller.id);
	const reference = Buffer.from(expected ?? "0".repeat(64), "hex");
	const same = reference.length === digest.length && timingSafeEqual(reference, digest);
	return same && caller !== undefined && expected !== undefined
		? { ok: true, callerId: caller.id, app: caller.app }
		: { ok: false };
}

/** A key's hash, to put in the environment (`openssl rand -hex 32` makes the secret). */
export function hashSecret(secret: string): string {
	return createHash("sha256").update(secret, "utf8").digest("hex");
}
