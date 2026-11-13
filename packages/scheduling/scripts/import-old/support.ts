import type { Encrypted } from "../../src/crypto";
import { isLocalDate } from "../../src/domain/time";
import type { AnomalyLog } from "./log";
import type { Mapping } from "./mapping";

/** Encrypts and fingerprints for the import; the dry run uses a stand-in that touches no key. */
export interface Encryptor {
	encrypt(plain: string, field: string): Promise<Encrypted>;
	/** A keyed hash of the normalised source row, so an unchanged row is recognised on a re-run. */
	fingerprint(message: string): Promise<string>;
	/** A file's bytes, encrypted (the object store only ever sees these). */
	encryptBytes(
		bytes: Uint8Array<ArrayBuffer>,
		context: string,
	): Promise<{ keyVersion: number; iv: string; bytes: Uint8Array<ArrayBuffer> }>;
}

/** The stand-in for a run that has no key and writes nothing: constant values, no cryptography. */
export const dryEncryptor: Encryptor = {
	encrypt: async () => ({ keyVersion: 1, iv: "dry", data: "dry" }),
	fingerprint: async () => "dry",
	encryptBytes: async (bytes) => ({ keyVersion: 1, iv: "dry", bytes }),
};

export interface Ctx {
	tenant: string;
	zone: string;
	/** UTC ms of the export. */
	exportedAt: number;
	mapping: Mapping;
	/** Hash of the mapping: a change to it changes every fingerprint it can affect. */
	mappingDigest: string;
	enc: Encryptor;
	log: AnomalyLog;
}

/** Trimmed text, or undefined when empty or absent. */
export function clean(value: string | null | undefined): string | undefined {
	if (value === null || value === undefined) return undefined;
	const t = value.replace(/\s+/g, " ").trim();
	return t === "" ? undefined : t;
}

/** Text with its line breaks kept (notes), trimmed, or undefined. */
export function cleanNote(value: string | null | undefined): string | undefined {
	if (value === null || value === undefined) return undefined;
	const t = value.trim();
	return t === "" ? undefined : t;
}

export function timestamp(value: string | null | undefined): number | undefined {
	const t = clean(value);
	if (t === undefined) return undefined;
	const ms = Date.parse(t);
	return Number.isNaN(ms) ? undefined : ms;
}

/** `YYYY-MM-DD` from a date or timestamp text, or undefined. */
export function day(value: string | null | undefined): string | undefined {
	const t = clean(value)?.slice(0, 10);
	return t !== undefined && isLocalDate(t) ? t : undefined;
}

/** `HH:MM` from `HH:MM` or `HH:MM:SS`, or undefined. */
export function clock(value: string | null | undefined): string | undefined {
	const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(clean(value) ?? "");
	return m === null ? undefined : `${(m[1] ?? "").padStart(2, "0")}:${m[2] ?? ""}`;
}

/** Lowercase, without diacritics: how statuses and types are compared. */
export function fold(value: string | null | undefined): string {
	return (clean(value) ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function slugify(value: string): string {
	return fold(value)
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
}

/** JSON with sorted keys, so equal rows give equal text. */
export function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (typeof value === "object" && value !== null) {
		const entries = Object.entries(value)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
}

/** The fingerprint of one source row under this import's mapping. */
export function fingerprintOf(ctx: Ctx, table: string, row: unknown): Promise<string> {
	return ctx.enc.fingerprint(`${table}|${ctx.mappingDigest}|${canonical(row)}`);
}

/** Reports every non-empty column nothing reads, by column name, as a blocking anomaly. */
export function reportExtraColumns(
	ctx: Ctx,
	table: string,
	id: number,
	row: Readonly<Record<string, unknown>>,
	known: ReadonlySet<string>,
): void {
	for (const [name, value] of Object.entries(row)) {
		if (known.has(name) || value === null || value === undefined || value === "") continue;
		ctx.log.add(`unmapped_column:${table}.${name}`, "blocking", `${table}:${id}`);
	}
}
