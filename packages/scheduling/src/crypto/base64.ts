import { CryptoError } from "./errors";

const CHUNK = 0x8000;

/** Standard base64 (with padding) of `bytes`. */
export function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

/** The bytes of standard base64 text, or a `bad_envelope` error naming no value. */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
	let binary: string;
	try {
		binary = atob(text);
	} catch {
		throw new CryptoError("bad_envelope", "not base64");
	}
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	if (toBase64(bytes) !== text) throw new CryptoError("bad_envelope", "not canonical base64");
	return bytes;
}

/** Lowercase hexadecimal of `bytes`. */
export function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
