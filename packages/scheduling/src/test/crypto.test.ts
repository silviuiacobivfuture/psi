import { describe, expect, it } from "vitest";
import {
	buildKeyRing,
	CryptoError,
	decryptBytes,
	decryptField,
	encryptBytes,
	encryptField,
	fingerprint,
	fromBase64,
	generateDataKeyBytes,
	generateMasterKeyText,
	type KeyRing,
	parseMasterKey,
	rewrapDataKey,
	sha256Hex,
	toBase64,
	unwrapDataKey,
	wrapDataKey,
} from "../crypto";

const TENANT = "psizone";
const CONTEXT = "psizone|clients.diagnosis";

async function ringWith(versions: number[], masterText = generateMasterKeyText()) {
	const master = await parseMasterKey(masterText);
	const wrapped = await Promise.all(
		versions.map((v) => wrapDataKey(master, generateDataKeyBytes(), TENANT, v)),
	);
	return { master, wrapped, ring: await buildKeyRing(master, TENANT, wrapped) };
}

async function refusal(run: Promise<unknown>): Promise<string> {
	try {
		await run;
	} catch (error) {
		if (error instanceof CryptoError) return error.code;
		throw error;
	}
	return "no refusal";
}

describe("field encryption", () => {
	it("round-trips text, unicode and the empty string", async () => {
		const { ring } = await ringWith([1]);
		for (const text of ["Test Client A, ADHD", "ăâîșț ȘȚ — 日本語 🧠", "", "x".repeat(50_000)]) {
			const enc = await encryptField(ring, text, CONTEXT);
			expect(await decryptField(ring, enc, CONTEXT)).toBe(text);
			expect(enc.keyVersion).toBe(1);
		}
	});

	it("never repeats a ciphertext or an IV for the same text", async () => {
		const { ring } = await ringWith([1]);
		const a = await encryptField(ring, "same", CONTEXT);
		const b = await encryptField(ring, "same", CONTEXT);
		expect(a.iv).not.toBe(b.iv);
		expect(a.data).not.toBe(b.data);
	});

	it("keeps the plaintext out of the stored value", async () => {
		const { ring } = await ringWith([1]);
		const enc = await encryptField(ring, "Test Client A", CONTEXT);
		expect(JSON.stringify(enc)).not.toContain("Test Client A");
		expect(atob(enc.data)).not.toContain("Test Client A");
	});

	it("refuses a wrong key", async () => {
		const one = await ringWith([1]);
		const other = await ringWith([1]);
		const enc = await encryptField(one.ring, "secret", CONTEXT);
		expect(await refusal(decryptField(other.ring, enc, CONTEXT))).toBe("decrypt_failed");
	});

	it("refuses a wrong context (a ciphertext moved to another app or field)", async () => {
		const { ring } = await ringWith([1]);
		const enc = await encryptField(ring, "secret", CONTEXT);
		expect(await refusal(decryptField(ring, enc, "hemisync|clients.diagnosis"))).toBe(
			"decrypt_failed",
		);
		expect(await refusal(decryptField(ring, enc, "psizone|clients.healthNotes"))).toBe(
			"decrypt_failed",
		);
	});

	it("refuses a tampered ciphertext, tag or IV, and a truncated one", async () => {
		const { ring } = await ringWith([1]);
		const enc = await encryptField(ring, "secret text", CONTEXT);
		const data = fromBase64(enc.data);
		const flipped = new Uint8Array(data);
		flipped[0] = (flipped[0] ?? 0) ^ 1;
		expect(await refusal(decryptField(ring, { ...enc, data: toBase64(flipped) }, CONTEXT))).toBe(
			"decrypt_failed",
		);
		const tag = new Uint8Array(data);
		const last = tag.length - 1;
		tag[last] = (tag[last] ?? 0) ^ 1;
		expect(await refusal(decryptField(ring, { ...enc, data: toBase64(tag) }, CONTEXT))).toBe(
			"decrypt_failed",
		);
		const iv = new Uint8Array(fromBase64(enc.iv));
		iv[0] = (iv[0] ?? 0) ^ 1;
		expect(await refusal(decryptField(ring, { ...enc, iv: toBase64(iv) }, CONTEXT))).toBe(
			"decrypt_failed",
		);
		expect(
			await refusal(decryptField(ring, { ...enc, data: toBase64(data.subarray(0, 4)) }, CONTEXT)),
		).toBe("decrypt_failed");
		expect(await refusal(decryptField(ring, { ...enc, iv: "AAAA" }, CONTEXT))).toBe("bad_envelope");
		expect(await refusal(decryptField(ring, { ...enc, data: "!!not base64" }, CONTEXT))).toBe(
			"bad_envelope",
		);
	});

	it("refuses a key version the ring does not hold, and a ring without keys", async () => {
		const { ring, master } = await ringWith([1]);
		const enc = await encryptField(ring, "secret", CONTEXT);
		expect(await refusal(decryptField(ring, { ...enc, keyVersion: 9 }, CONTEXT))).toBe(
			"unknown_key_version",
		);
		expect(await refusal(buildKeyRing(master, TENANT, []))).toBe("no_keys");
	});
});

describe("the master key", () => {
	it("accepts base64 of exactly 32 bytes", async () => {
		await expect(parseMasterKey(generateMasterKeyText())).resolves.toBeDefined();
		await expect(parseMasterKey(`${generateMasterKeyText()}\n`)).resolves.toBeDefined();
	});

	it.each([
		["unset", undefined],
		["blank", "  "],
		["not base64", "not base64 at all!"],
		["too short", toBase64(new Uint8Array(16))],
		["too long", toBase64(new Uint8Array(33))],
	])("refuses %s", async (_label, text) => {
		expect(await refusal(parseMasterKey(text))).toBe("bad_master_key");
	});

	it("never puts the key in its error message", async () => {
		const text = toBase64(new Uint8Array(16));
		try {
			await parseMasterKey(text);
		} catch (error) {
			expect(String(error)).not.toContain(text);
		}
	});
});

describe("data keys: wrapping, versions, rotation", () => {
	it("a wrapped key does not open with another master key or for another app", async () => {
		const { master, wrapped } = await ringWith([1]);
		const first = wrapped[0];
		if (first === undefined) throw new Error("no wrapped key");
		const other = await parseMasterKey(generateMasterKeyText());
		expect(await refusal(unwrapDataKey(other, first, TENANT))).toBe("decrypt_failed");
		expect(await refusal(unwrapDataKey(master, first, "hemisync"))).toBe("decrypt_failed");
		expect(await refusal(unwrapDataKey(master, { ...first, keyVersion: 2 }, TENANT))).toBe(
			"decrypt_failed",
		);
	});

	it("rotating the master key re-wraps the data key and leaves the data readable", async () => {
		const { master, wrapped, ring } = await ringWith([1]);
		const enc = await encryptField(ring, "kept across rotation", CONTEXT);
		const newMasterText = generateMasterKeyText();
		const newMaster = await parseMasterKey(newMasterText);
		const first = wrapped[0];
		if (first === undefined) throw new Error("no wrapped key");
		const rewrapped = await rewrapDataKey(master, newMaster, first, TENANT);
		expect(rewrapped.keyVersion).toBe(1);
		expect(rewrapped.data).not.toBe(first.data);
		const newRing = await buildKeyRing(newMaster, TENANT, [rewrapped]);
		expect(await decryptField(newRing, enc, CONTEXT)).toBe("kept across rotation");
		expect(await refusal(buildKeyRing(master, TENANT, [rewrapped]))).toBe("decrypt_failed");
		expect(await refusal(rewrapDataKey(newMaster, master, first, TENANT))).toBe("decrypt_failed");
	});

	it("a newer data key encrypts, an older one still decrypts", async () => {
		const master = await parseMasterKey(generateMasterKeyText());
		const v1 = await wrapDataKey(master, generateDataKeyBytes(), TENANT, 1);
		const old = await buildKeyRing(master, TENANT, [v1]);
		const stored = await encryptField(old, "written under v1", CONTEXT);
		const v2 = await wrapDataKey(master, generateDataKeyBytes(), TENANT, 2);
		const ring: KeyRing = await buildKeyRing(master, TENANT, [v2, v1]);
		expect(ring.current.version).toBe(2);
		expect((await encryptField(ring, "new", CONTEXT)).keyVersion).toBe(2);
		expect(await decryptField(ring, stored, CONTEXT)).toBe("written under v1");
	});
});

describe("files and fingerprints", () => {
	it("round-trips bytes and refuses a changed byte or another context", async () => {
		const { ring } = await ringWith([1]);
		const bytes = new Uint8Array([0, 1, 2, 255, 254]);
		const sealed = await encryptBytes(ring, bytes, "psizone|client-files/1");
		expect([...(await decryptBytes(ring, sealed, "psizone|client-files/1"))]).toEqual([...bytes]);
		expect(await refusal(decryptBytes(ring, sealed, "psizone|client-files/2"))).toBe(
			"decrypt_failed",
		);
		const changed = new Uint8Array(sealed.bytes);
		changed[0] = (changed[0] ?? 0) ^ 1;
		expect(
			await refusal(decryptBytes(ring, { ...sealed, bytes: changed }, "psizone|client-files/1")),
		).toBe("decrypt_failed");
	});

	it("sha256 matches the standard test vector", async () => {
		expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});

	it("a fingerprint is stable, input-sensitive, per key, and survives a newer data key", async () => {
		const master = await parseMasterKey(generateMasterKeyText());
		const v1 = await wrapDataKey(master, generateDataKeyBytes(), TENANT, 1);
		const ring1 = await buildKeyRing(master, TENANT, [v1]);
		const v2 = await wrapDataKey(master, generateDataKeyBytes(), TENANT, 2);
		const ring2 = await buildKeyRing(master, TENANT, [v1, v2]);
		const a = await fingerprint(ring1, "row-1");
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(await fingerprint(ring1, "row-1")).toBe(a);
		expect(await fingerprint(ring1, "row-2")).not.toBe(a);
		expect(await fingerprint(ring2, "row-1")).toBe(a);
		const other = await ringWith([1]);
		expect(await fingerprint(other.ring, "row-1")).not.toBe(a);
	});
});
