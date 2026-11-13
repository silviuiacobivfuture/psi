import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** An opaque id: one letter for what it names, then 12 lowercase characters (also a valid slot-id practitioner). */
export function newId(prefix: string): string {
	let out = prefix.slice(0, 1);
	for (const byte of randomBytes(12)) out += ALPHABET.charAt(byte % ALPHABET.length);
	return out;
}
