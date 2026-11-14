import { z } from "zod";
import { fromBase64, toBase64, toHex } from "./base64";
import { CryptoError } from "./errors";

/**
 * Field encryption for the clinic's records (docs/plans/clinic.md section 6).
 *
 * Envelope: every app has data keys (AES-256-GCM, versioned). A data key is stored only WRAPPED
 * by the master key (`CLINIC_MASTER_KEY`, base64 of 32 bytes, held in the estate's secret store
 * and in the process that encrypts, never in Convex). A field is encrypted with the current data
 * key under a fresh random 96-bit IV, with its context (app and field) as authenticated data, so
 * a ciphertext moved to another app or field no longer opens. Convex stores the ciphertext, the
 * IV and the key version, nothing else. Web Crypto only: it runs in Node and in the Convex runtime.
 */

export const MASTER_KEY_ENV = "CLINIC_MASTER_KEY";
export const KEY_BYTES = 32;
export const IV_BYTES = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

/** A stored ciphertext: key version, IV and ciphertext+tag, both base64. */
export const encryptedSchema = z.object({
	keyVersion: z.number().int().positive(),
	iv: z.string().min(1),
	data: z.string(),
});
export type Encrypted = z.infer<typeof encryptedSchema>;

/** A data key as stored: wrapped by the master key. */
export const wrappedKeySchema = encryptedSchema;
export type WrappedKey = Encrypted;

/** The master key, opaque. */
export interface MasterKey {
	readonly key: CryptoKey;
}

/** A data key in memory: encrypts and decrypts, and keys the fingerprints. */
export interface DataKey {
	readonly version: number;
	readonly aes: CryptoKey;
	readonly mac: CryptoKey;
}

/** Every data key of one app; `current` encrypts, any version decrypts. */
export interface KeyRing {
	readonly current: DataKey;
	readonly fingerprint: DataKey;
	readonly byVersion: ReadonlyMap<number, DataKey>;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return bytes;
}

async function importAes(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/**
 * The master key from its text: 64 hex characters (how the estate's secret store holds it) or base64; refuses anything
 * but exactly 32 bytes. The two forms cannot be mistaken for each other: 64 hex characters read as base64 are 48 bytes.
 */
export async function parseMasterKey(text: string | undefined): Promise<MasterKey> {
	if (text === undefined || text.trim() === "") {
		throw new CryptoError("bad_master_key", `${MASTER_KEY_ENV} is not set`);
	}
	let raw: Uint8Array<ArrayBuffer>;
	try {
		raw = /^[0-9a-fA-F]{64}$/.test(text.trim())
			? Uint8Array.from(text.trim().match(/../g) ?? [], (pair) => Number.parseInt(pair, 16))
			: fromBase64(text.trim());
	} catch {
		throw new CryptoError("bad_master_key", `${MASTER_KEY_ENV} is not base64`);
	}
	if (raw.length !== KEY_BYTES) {
		throw new CryptoError("bad_master_key", `${MASTER_KEY_ENV} must be ${KEY_BYTES} bytes`);
	}
	return { key: await importAes(raw) };
}

/** A fresh random master key as base64 (for provisioning; the caller stores it in the secret store). */
export function generateMasterKeyText(): string {
	return toBase64(randomBytes(KEY_BYTES));
}

/** A fresh random data key. */
export function generateDataKeyBytes(): Uint8Array<ArrayBuffer> {
	return randomBytes(KEY_BYTES);
}

async function seal(
	key: CryptoKey,
	version: number,
	plain: Uint8Array<ArrayBuffer>,
	aad: string,
): Promise<Encrypted> {
	const iv = randomBytes(IV_BYTES);
	const sealed = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv, additionalData: encoder.encode(aad) },
		key,
		plain,
	);
	return { keyVersion: version, iv: toBase64(iv), data: toBase64(new Uint8Array(sealed)) };
}

async function open(key: CryptoKey, enc: Encrypted, aad: string): Promise<Uint8Array<ArrayBuffer>> {
	const iv = fromBase64(enc.iv);
	if (iv.length !== IV_BYTES) throw new CryptoError("bad_envelope", "wrong IV length");
	try {
		const plain = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv, additionalData: encoder.encode(aad) },
			key,
			fromBase64(enc.data),
		);
		return new Uint8Array(plain);
	} catch (error) {
		if (error instanceof CryptoError) throw error;
		throw new CryptoError("decrypt_failed", "wrong key, wrong context or tampered data");
	}
}

const wrapAad = (tenant: string, version: number): string => `psi-clinic|wrap|${tenant}|${version}`;
const fieldAad = (context: string): string => `psi-clinic|field|${context}`;
const bytesAad = (context: string): string => `psi-clinic|bytes|${context}`;

/** Wraps a data key for storage. */
export async function wrapDataKey(
	master: MasterKey,
	raw: Uint8Array<ArrayBuffer>,
	tenant: string,
	version: number,
): Promise<WrappedKey> {
	if (raw.length !== KEY_BYTES) throw new CryptoError("bad_envelope", "data key length");
	return seal(master.key, version, raw, wrapAad(tenant, version));
}

async function dataKeyFrom(raw: Uint8Array<ArrayBuffer>, version: number): Promise<DataKey> {
	const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveBits"]);
	const macBits = await crypto.subtle.deriveBits(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: new Uint8Array(0),
			info: encoder.encode("psi-clinic|fingerprint"),
		},
		base,
		256,
	);
	const mac = await crypto.subtle.importKey(
		"raw",
		macBits,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return { version, aes: await importAes(raw), mac };
}

/** Opens a wrapped data key; refuses a wrong master key or a key stored for another app. */
export async function unwrapDataKey(
	master: MasterKey,
	wrapped: WrappedKey,
	tenant: string,
): Promise<DataKey> {
	const raw = await open(master.key, wrapped, wrapAad(tenant, wrapped.keyVersion));
	if (raw.length !== KEY_BYTES) throw new CryptoError("bad_envelope", "data key length");
	return dataKeyFrom(raw, wrapped.keyVersion);
}

/** Master key rotation: the same data key wrapped by the new master key. Data stays as it is. */
export async function rewrapDataKey(
	oldMaster: MasterKey,
	newMaster: MasterKey,
	wrapped: WrappedKey,
	tenant: string,
): Promise<WrappedKey> {
	const raw = await open(oldMaster.key, wrapped, wrapAad(tenant, wrapped.keyVersion));
	return seal(newMaster.key, wrapped.keyVersion, raw, wrapAad(tenant, wrapped.keyVersion));
}

/** The ring of an app from its stored wrapped keys (any order); the highest version encrypts. */
export async function buildKeyRing(
	master: MasterKey,
	tenant: string,
	wrapped: ReadonlyArray<WrappedKey>,
): Promise<KeyRing> {
	if (wrapped.length === 0) throw new CryptoError("no_keys", "the app has no data key");
	const keys = await Promise.all(wrapped.map((w) => unwrapDataKey(master, w, tenant)));
	keys.sort((a, b) => a.version - b.version);
	const first = keys[0];
	const last = keys[keys.length - 1];
	if (first === undefined || last === undefined) throw new CryptoError("no_keys", "empty ring");
	return {
		current: last,
		fingerprint: first,
		byVersion: new Map(keys.map((k) => [k.version, k])),
	};
}

function keyFor(ring: KeyRing, version: number): DataKey {
	const key = ring.byVersion.get(version);
	if (key === undefined) throw new CryptoError("unknown_key_version", `version ${version}`);
	return key;
}

/** Encrypts one field's text under the current data key. `context` binds it (app + field name). */
export async function encryptField(
	ring: KeyRing,
	plaintext: string,
	context: string,
): Promise<Encrypted> {
	return seal(ring.current.aes, ring.current.version, encoder.encode(plaintext), fieldAad(context));
}

/** Decrypts a field; refuses a wrong key, a wrong context, or any change to the stored value. */
export async function decryptField(
	ring: KeyRing,
	enc: Encrypted,
	context: string,
): Promise<string> {
	const plain = await open(keyFor(ring, enc.keyVersion).aes, enc, fieldAad(context));
	try {
		return decoder.decode(plain);
	} catch {
		throw new CryptoError("decrypt_failed", "not text");
	}
}

/** Encrypts a file's bytes the same way; the ciphertext is returned as bytes, the rest as metadata. */
export async function encryptBytes(
	ring: KeyRing,
	bytes: Uint8Array<ArrayBuffer>,
	context: string,
): Promise<{ keyVersion: number; iv: string; bytes: Uint8Array<ArrayBuffer> }> {
	const sealed = await seal(ring.current.aes, ring.current.version, bytes, bytesAad(context));
	return { keyVersion: sealed.keyVersion, iv: sealed.iv, bytes: fromBase64(sealed.data) };
}

export async function decryptBytes(
	ring: KeyRing,
	sealed: { keyVersion: number; iv: string; bytes: Uint8Array<ArrayBuffer> },
	context: string,
): Promise<Uint8Array<ArrayBuffer>> {
	return open(
		keyFor(ring, sealed.keyVersion).aes,
		{ keyVersion: sealed.keyVersion, iv: sealed.iv, data: toBase64(sealed.bytes) },
		bytesAad(context),
	);
}

/**
 * A keyed hash (HMAC-SHA-256, hex) of a normalised message: what the importer compares to know a
 * source row has not changed, without storing a bare hash of clinical text. It does not change
 * when a newer data key is added.
 */
export async function fingerprint(ring: KeyRing, message: string): Promise<string> {
	const mac = await crypto.subtle.sign("HMAC", ring.fingerprint.mac, encoder.encode(message));
	return toHex(new Uint8Array(mac));
}

/** SHA-256 of bytes, hex (file integrity). */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
	return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}
