import { generateKeyPairSync } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	buildKeyRing,
	encryptField,
	generateDataKeyBytes,
	generateMasterKeyText,
	parseMasterKey,
	wrapDataKey,
} from "../../src/crypto";
import { EnvelopeError, keyFingerprint, openFile, readHeader, sealFile } from "./envelope";
import { checkSealed, countDiff, countsOf, tablesOf } from "./verify";
import { readZip, ZipError } from "./zip";

/** A ZIP as `convex export` writes one: a local header and a central entry per member, stored or deflated. */
function zipOf(members: ReadonlyArray<{ name: string; data: Buffer; deflate?: boolean }>): Buffer {
	const locals: Buffer[] = [];
	const centrals: Buffer[] = [];
	let offset = 0;
	for (const m of members) {
		const name = Buffer.from(m.name, "utf8");
		const body = m.deflate === true ? deflateRawSync(m.data) : m.data;
		const crc = crc32(m.data);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(m.deflate === true ? 8 : 0, 8);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(body.length, 18);
		local.writeUInt32LE(m.data.length, 22);
		local.writeUInt16LE(name.length, 26);
		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(m.deflate === true ? 8 : 0, 10);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(body.length, 20);
		central.writeUInt32LE(m.data.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt32LE(offset, 42);
		locals.push(local, name, body);
		centrals.push(central, name);
		offset += 30 + name.length + body.length;
	}
	const dir = Buffer.concat(centrals);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(members.length, 8);
	end.writeUInt16LE(members.length, 10);
	end.writeUInt32LE(dir.length, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, dir, end]);
}
const jsonl = (docs: ReadonlyArray<Record<string, unknown>>): Buffer =>
	Buffer.from(docs.map((d) => JSON.stringify(d)).join("\n") + (docs.length > 0 ? "\n" : ""));

describe("readZip: the export archive, read and refused by name", () => {
	it("reads stored and deflated members, unicode names included, each byte for byte", () => {
		const a = Buffer.from("plain ăîșț");
		const b = Buffer.from("x".repeat(10_000));
		const z = readZip(
			zipOf([
				{ name: "clients/documents.jsonl", data: a },
				{ name: "visits/ș.jsonl", data: b, deflate: true },
			]),
		);
		expect([...z.keys()]).toEqual(["clients/documents.jsonl", "visits/ș.jsonl"]);
		expect(z.get("clients/documents.jsonl")?.equals(a)).toBe(true);
		expect(z.get("visits/ș.jsonl")?.equals(b)).toBe(true);
	});
	it("reads a ZIP64 member (sizes and offset in the extended-information field), as convex export writes them", () => {
		const data = Buffer.from("zip64 member");
		const z = zipOf([{ name: "a", data }]);
		// Rewrite the central entry: all three 32-bit fields to all ones, their values in a 0x0001 extra field.
		const end = z.length - 22;
		const dirAt = z.readUInt32LE(end + 16);
		const extra = Buffer.alloc(4 + 24);
		extra.writeUInt16LE(0x0001, 0);
		extra.writeUInt16LE(24, 2);
		extra.writeBigUInt64LE(BigInt(data.length), 4);
		extra.writeBigUInt64LE(BigInt(data.length), 12);
		extra.writeBigUInt64LE(0n, 20);
		const central = Buffer.from(z.subarray(dirAt, dirAt + 47));
		central.writeUInt32LE(0xffffffff, 20);
		central.writeUInt32LE(0xffffffff, 24);
		central.writeUInt32LE(0xffffffff, 42);
		central.writeUInt16LE(extra.length, 30);
		const dir = Buffer.concat([central, extra]);
		const eocd = Buffer.from(z.subarray(end));
		eocd.writeUInt32LE(dir.length, 12);
		const rebuilt = Buffer.concat([z.subarray(0, dirAt), dir, eocd]);
		expect(readZip(rebuilt).get("a")?.equals(data)).toBe(true);
		// The same entry without its extra field is refused, not guessed.
		central.writeUInt16LE(0, 30);
		eocd.writeUInt32LE(central.length, 12);
		expect(() => readZip(Buffer.concat([z.subarray(0, dirAt), central, eocd]))).toThrow(
			/ZIP64 sizes without their extra field/,
		);
	});
	it("an empty archive is an empty map, and an empty member is empty", () => {
		expect(readZip(zipOf([])).size).toBe(0);
		expect(readZip(zipOf([{ name: "e", data: Buffer.alloc(0) }])).get("e")?.length).toBe(0);
	});
	it.each([
		["not a ZIP", () => Buffer.from("hello, not an archive at all"), /no end of central directory/],
		[
			"a flipped byte in a member",
			() => {
				const z = zipOf([{ name: "a", data: Buffer.from("abcdef") }]);
				z[30 + 1 + 2] = z[30 + 1 + 2] === 0x41 ? 0x42 : 0x41;
				return z;
			},
			/checksum does not match/,
		],
		[
			"a ZIP64 end record",
			() => {
				const z = zipOf([{ name: "a", data: Buffer.from("a") }]);
				z.writeUInt16LE(0xffff, z.length - 22 + 10);
				return z;
			},
			/ZIP64/,
		],
		[
			"an encrypted member",
			() => {
				const z = zipOf([{ name: "a", data: Buffer.from("a") }]);
				z.writeUInt16LE(1, 30 + 1 + 1 + 8);
				return z;
			},
			/encrypted members/,
		],
		[
			"an unknown method",
			() => {
				const z = zipOf([{ name: "a", data: Buffer.from("a") }]);
				z.writeUInt16LE(12, 30 + 1 + 1 + 10);
				return z;
			},
			/compression method 12/,
		],
	])("refuses %s", (_what, make, message) => {
		expect(() => readZip(make())).toThrow(ZipError);
		expect(() => readZip(make())).toThrow(message);
	});
});

describe("the sealed backup file: only the private key's holder opens it, and only intact", () => {
	let dir: string;
	const pair = () =>
		generateKeyPairSync("rsa", {
			modulusLength: 2048,
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});
	const mine = pair();
	const other = pair();
	beforeAll(async () => {
		dir = await mkdtemp(join(tmpdir(), "psi-backup-"));
	});
	afterAll(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it.each([
		["one byte", Buffer.from("a")],
		["empty", Buffer.alloc(0)],
		["many chunks", Buffer.alloc(3 * 1024 * 1024, 7)],
	])("round-trips %s, the hashes and size naming the plaintext", async (name, data) => {
		const plain = join(dir, `${name}.zip`);
		await writeFile(plain, data);
		const sealed = await sealFile(plain, join(dir, `${name}.enc`), mine.publicKey);
		expect(sealed.bytes).toBe(data.length);
		expect(sealed.key).toBe(keyFingerprint(mine.privateKey));
		const enc = await readFile(join(dir, `${name}.enc`));
		if (data.length > 16) expect(enc.includes(data.subarray(0, 16))).toBe(false);
		await openFile(join(dir, `${name}.enc`), join(dir, `${name}.out`), mine.privateKey);
		expect((await readFile(join(dir, `${name}.out`))).equals(data)).toBe(true);
	});

	it("the header names the key pair, the same fingerprint from either half, and no secret", async () => {
		await writeFile(join(dir, "h.zip"), "secret clinical text");
		await sealFile(join(dir, "h.zip"), join(dir, "h.enc"), mine.publicKey);
		const { header } = await readHeader(join(dir, "h.enc"));
		expect(header.key).toBe(keyFingerprint(mine.publicKey));
		expect(JSON.stringify(header)).not.toContain("secret clinical text");
		expect(keyFingerprint(mine.publicKey)).not.toBe(keyFingerprint(other.publicKey));
	});

	it("refuses another key pair's private key, and writes nothing", async () => {
		await writeFile(join(dir, "k.zip"), "abc");
		await sealFile(join(dir, "k.zip"), join(dir, "k.enc"), mine.publicKey);
		await expect(
			openFile(join(dir, "k.enc"), join(dir, "k.out"), other.privateKey),
		).rejects.toThrow(/not for this one/);
		expect(existsSync(join(dir, "k.out"))).toBe(false);
		expect(existsSync(join(dir, "k.out.partial"))).toBe(false);
	});

	it.each([
		["a ciphertext byte", (b: Buffer, start: number) => (b[start] = (b[start] ?? 0) ^ 1)],
		["the tag", (b: Buffer) => (b[b.length - 1] = (b[b.length - 1] ?? 0) ^ 1)],
	])("refuses a file whose %s changed, and leaves no output", async (_what, flip) => {
		await writeFile(join(dir, "t.zip"), Buffer.alloc(5000, 3));
		await sealFile(join(dir, "t.zip"), join(dir, "t.enc"), mine.publicKey);
		const { start } = await readHeader(join(dir, "t.enc"));
		const b = await readFile(join(dir, "t.enc"));
		flip(b, start);
		await writeFile(join(dir, "t.enc"), b);
		await expect(openFile(join(dir, "t.enc"), join(dir, "t.out"), mine.privateKey)).rejects.toThrow(
			EnvelopeError,
		);
		expect(existsSync(join(dir, "t.out"))).toBe(false);
		expect(existsSync(join(dir, "t.out.partial"))).toBe(false);
	});

	it.each([
		["not a sealed file", Buffer.from("PK\u0003\u0004 not ours")],
		["a header that is not JSON", Buffer.concat([Buffer.from([0, 0, 0, 3]), Buffer.from("{{{")])],
		[
			"a header of another format",
			(() => {
				const h = Buffer.from(JSON.stringify({ format: "other/9" }));
				const n = Buffer.alloc(4);
				n.writeUInt32BE(h.length);
				return Buffer.concat([n, h]);
			})(),
		],
	])("refuses %s", async (_what, bytes) => {
		await writeFile(join(dir, "x.enc"), bytes);
		await expect(openFile(join(dir, "x.enc"), join(dir, "x.out"), mine.privateKey)).rejects.toThrow(
			EnvelopeError,
		);
		expect(existsSync(join(dir, "x.out"))).toBe(false);
	});

	it("refuses a public key that is not RSA", async () => {
		const ec = generateKeyPairSync("ec", {
			namedCurve: "P-256",
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});
		await writeFile(join(dir, "ec.zip"), "a");
		await expect(sealFile(join(dir, "ec.zip"), join(dir, "ec.enc"), ec.publicKey)).rejects.toThrow(
			/RSA/,
		);
	});
});

describe("verify: an export's counts, and every sealed field opening with the escrowed master key", () => {
	const MASTER = generateMasterKeyText();
	let tables: Map<string, Record<string, unknown>[]>;
	beforeAll(async () => {
		const master = await parseMasterKey(MASTER);
		const wrapped = await wrapDataKey(master, generateDataKeyBytes(), "psizone", 1);
		const ring = await buildKeyRing(master, "psizone", [wrapped]);
		const seal = (text: string, field: string) => encryptField(ring, text, `psizone|${field}`);
		const zip = zipOf([
			{
				name: "appKeys/documents.jsonl",
				data: jsonl([{ tenant: "psizone", version: 1, wrapped, status: "active", createdAt: 1 }]),
			},
			{
				name: "clients/documents.jsonl",
				data: jsonl([
					{
						_id: "c1",
						tenant: "psizone",
						name: "A",
						mainReasonEnc: await seal("why", "clients.mainReasonEnc"),
					},
					{ _id: "c2", tenant: "psizone", name: "B" },
				]),
				deflate: true,
			},
			{
				name: "formResponses/documents.jsonl",
				data: jsonl([
					{ _id: "r1", tenant: "psizone", payload: await seal("{}", "formResponses.payload") },
					{
						_id: "r2",
						tenant: "psizone",
						custom: { score: await seal("7", "formResponses.custom.score") },
					},
				]),
			},
			{ name: "rooms/documents.jsonl", data: jsonl([]) },
			{ name: "_tables/documents.jsonl", data: jsonl([{ name: "clients" }]) },
			{ name: "_storage/documents.jsonl", data: jsonl([{ _id: "s" }]) },
		]);
		tables = tablesOf(readZip(zip));
	});

	it("counts every user table, empty ones too, and leaves Convex's own (_tables, _storage) out", () => {
		expect(countsOf(tables)).toEqual({ appKeys: 1, clients: 2, formResponses: 2, rooms: 0 });
	});

	it("opens every sealed value, top level and nested, under the context it was sealed with", async () => {
		const r = await checkSealed(tables, MASTER);
		expect(r).toMatchObject({ found: 3, opened: 3, failed: [] });
		expect(r.byTable).toEqual({ clients: 1, formResponses: 2 });
	});

	it("with another master key the data keys do not even unwrap: refused, nothing reported as opened", async () => {
		await expect(checkSealed(tables, generateMasterKeyText())).rejects.toThrow(
			/decrypt|bad_envelope/,
		);
	});

	it("a sealed value of a tenant with no data key is a failure, not a skip", async () => {
		const extra = new Map(tables);
		extra.set("visits", [
			{
				_id: "v1",
				tenant: "hemisync",
				notesEnc: { keyVersion: 1, iv: "AAAAAAAAAAAAAAAA", data: "AAAA" },
			},
		]);
		const r = await checkSealed(extra, MASTER);
		expect(r.failed).toEqual([{ table: "visits", field: "notesEnc", reason: "no_keys" }]);
		expect(JSON.stringify(r)).not.toContain("AAAA");
	});

	it("a value altered in the archive fails, named by table and field", async () => {
		const altered = new Map(tables);
		const [doc] = altered.get("formResponses") ?? [];
		altered.set("formResponses", [
			{ ...doc, payload: { ...(doc?.payload as object), data: "AAAA" } },
		]);
		const r = await checkSealed(altered, MASTER);
		expect(r.failed).toEqual([
			{ table: "formResponses", field: "payload", reason: "decrypt_failed" },
		]);
	});

	it("countDiff names each table whose count differs, and nothing when they agree", () => {
		expect(countDiff({ a: 1, b: 2 }, { a: 1, b: 2 })).toEqual([]);
		expect(countDiff({ a: 1, b: 2 }, { a: 1, c: 5 })).toEqual([
			{ table: "b", source: 2, restored: 0 },
			{ table: "c", source: 0, restored: 5 },
		]);
	});
});
