import { crc32, inflateRawSync } from "node:zlib";

/**
 * Reads a ZIP archive's entries: what `convex export` writes (stored or deflated members, ZIP64 sizes and end record).
 * Node has no ZIP reader, and a backup verifier must not trust a library it cannot see, so this reads the central
 * directory itself, checks each member's size and CRC, and refuses what it does not understand, by name, rather than
 * return a partial archive: encrypted members, other compression methods, multi-disk archives.
 */
export class ZipError extends Error {
	override readonly name = "ZipError";
}

const EOCD = 0x06054b50;
const EOCD64 = 0x06064b50;
const EOCD64_LOCATOR = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const ZIP64_EXTRA = 0x0001;
const STORED = 0;
const DEFLATED = 8;
const U16 = 0xffff;
const U32 = 0xffffffff;

function findEnd(buf: Buffer): number {
	// The end record is 22 bytes plus a comment of at most 65535.
	const floor = Math.max(0, buf.length - 22 - 0xffff);
	for (let i = buf.length - 22; i >= floor; i--) if (buf.readUInt32LE(i) === EOCD) return i;
	throw new ZipError("not a ZIP archive (no end of central directory)");
}

const u64 = (buf: Buffer, at: number): number => {
	const v = buf.readBigUInt64LE(at);
	if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipError("a ZIP64 value is out of range");
	return Number(v);
};

/** The directory's entry count, size and offset, from the ZIP64 end record when the classic one says so. */
function directory(buf: Buffer, end: number): { count: number; offset: number } {
	const count = buf.readUInt16LE(end + 10);
	const offset = buf.readUInt32LE(end + 16);
	if (count !== U16 && offset !== U32 && buf.readUInt32LE(end + 12) !== U32)
		return { count, offset };
	const locator = end - 20;
	if (locator < 0 || buf.readUInt32LE(locator) !== EOCD64_LOCATOR)
		throw new ZipError("ZIP64 end record locator is missing");
	const at = u64(buf, locator + 8);
	if (at + 56 > buf.length || buf.readUInt32LE(at) !== EOCD64)
		throw new ZipError("ZIP64 end record is damaged");
	return { count: u64(buf, at + 32), offset: u64(buf, at + 48) };
}

/** The ZIP64 extended information of an entry: each 32-bit field that is all ones, in order, as 64 bits. */
function zip64Fields(
	extra: Buffer,
	need: { plain: boolean; compressed: boolean; local: boolean },
	name: string,
): { plain?: number; compressed?: number; local?: number } {
	for (let i = 0; i + 4 <= extra.length; ) {
		const id = extra.readUInt16LE(i);
		const len = extra.readUInt16LE(i + 2);
		if (id === ZIP64_EXTRA) {
			let p = i + 4;
			const out: { plain?: number; compressed?: number; local?: number } = {};
			const take = (): number => {
				if (p + 8 > i + 4 + len) throw new ZipError(`${name}: ZIP64 field is short`);
				const v = u64(extra, p);
				p += 8;
				return v;
			};
			if (need.plain) out.plain = take();
			if (need.compressed) out.compressed = take();
			if (need.local) out.local = take();
			return out;
		}
		i += 4 + len;
	}
	throw new ZipError(`${name}: ZIP64 sizes without their extra field`);
}

/** Every member by name, its bytes uncompressed. */
export function readZip(buf: Buffer): Map<string, Buffer> {
	const end = findEnd(buf);
	if (buf.readUInt16LE(end + 4) !== 0 && buf.readUInt16LE(end + 4) !== U16)
		throw new ZipError("multi-disk archives are not read");
	const { count, offset } = directory(buf, end);
	const out = new Map<string, Buffer>();
	let p = offset;
	for (let n = 0; n < count; n++) {
		if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL)
			throw new ZipError(`central directory entry ${n} is damaged`);
		const flags = buf.readUInt16LE(p + 8);
		const method = buf.readUInt16LE(p + 10);
		const crc = buf.readUInt32LE(p + 16);
		let compressed = buf.readUInt32LE(p + 20);
		let plain = buf.readUInt32LE(p + 24);
		const nameLen = buf.readUInt16LE(p + 28);
		const extraLen = buf.readUInt16LE(p + 30);
		const commentLen = buf.readUInt16LE(p + 32);
		let local = buf.readUInt32LE(p + 42);
		const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
		const extra = buf.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
		p += 46 + nameLen + extraLen + commentLen;
		if ((flags & 1) !== 0) throw new ZipError(`${name}: encrypted members are not read`);
		if (compressed === U32 || plain === U32 || local === U32) {
			const z = zip64Fields(
				extra,
				{ plain: plain === U32, compressed: compressed === U32, local: local === U32 },
				name,
			);
			plain = z.plain ?? plain;
			compressed = z.compressed ?? compressed;
			local = z.local ?? local;
		}
		if (local + 30 > buf.length || buf.readUInt32LE(local) !== LOCAL)
			throw new ZipError(`${name}: local header is damaged`);
		const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
		const data = buf.subarray(start, start + compressed);
		if (data.length !== compressed) throw new ZipError(`${name}: truncated`);
		let bytes: Buffer;
		if (method === STORED) bytes = Buffer.from(data);
		else if (method === DEFLATED) bytes = inflateRawSync(data);
		else throw new ZipError(`${name}: compression method ${method} is not read`);
		if (bytes.length !== plain) throw new ZipError(`${name}: size does not match the directory`);
		if (crc32(bytes) !== crc) throw new ZipError(`${name}: checksum does not match`);
		out.set(name, bytes);
	}
	return out;
}
