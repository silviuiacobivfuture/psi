import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * A slug for a row the API names by id, not by slug (a person, a room, a device, a group): the name folded to ASCII,
 * then a random suffix, so two rows of one name never meet. Convex keeps it as the row's key; the API never shows it.
 */
export function slugFor(name: string): string {
	const folded = name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 24)
		.replace(/-+$/g, "");
	let suffix = "";
	for (const byte of randomBytes(6)) suffix += ALPHABET.charAt(byte % ALPHABET.length);
	return `${folded === "" ? "x" : folded}-${suffix}`;
}
