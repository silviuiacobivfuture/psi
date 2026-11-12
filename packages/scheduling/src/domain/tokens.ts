/** Crockford's base32: no I, L, O or U, so a code read over the phone is not misheard. */
export const REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type RandomBytes = (length: number) => Uint8Array;

const webRandom: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

function code(length: number, random: RandomBytes): string {
	// 256 is a multiple of 32, so taking the low five bits of each byte is unbiased.
	return [...random(length)].map((byte) => REFERENCE_ALPHABET.charAt(byte % 32)).join("");
}

function grouped(raw: string): string {
	return (raw.match(/.{1,4}/g) ?? []).join("-");
}

/** A booking reference a person can read out: `K7M3-9QXA` (40 bits; not a secret). */
export function makeReference(random: RandomBytes = webRandom): string {
	return grouped(code(8, random));
}

/**
 * A secret a person holds: the cancel code shown once (`XXXX-XXXX-XXXX-XXXX`, 80 bits), or a hold
 * token kept in the confirm form. Only its hash is stored.
 */
export function makeToken(random: RandomBytes = webRandom): string {
	return grouped(code(16, random));
}

/** A reference or code as typed: upper case, no spaces or dashes, O read as 0 and I or L as 1. */
export function normalizeCode(typed: string): string {
	return typed.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

/** The canonical, grouped form of a typed reference or code, or undefined when it cannot be one. */
export function canonicalCode(typed: string, length: 8 | 16): string | undefined {
	const raw = normalizeCode(typed);
	if (raw.length !== length) return undefined;
	for (const char of raw) if (!REFERENCE_ALPHABET.includes(char)) return undefined;
	return grouped(raw);
}
