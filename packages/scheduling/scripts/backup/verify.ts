import { z } from "zod";
import {
	buildKeyRing,
	CryptoError,
	decryptField,
	type Encrypted,
	encryptedSchema,
	type KeyRing,
	parseMasterKey,
	wrappedKeySchema,
} from "../../src/crypto";

/**
 * What a restore must prove of a `convex export` archive: how many documents each table holds, and that every sealed
 * value in it opens with the master key the estate escrowed. A sealed value is any `{ keyVersion, iv, data }` in a
 * document; it is opened under the context it was sealed with (`<tenant>|<table>.<field>`, or a field name the service
 * uses for that column), and a value that opens under none of them is a failure: lost, damaged, or another key's.
 * Nothing it reads is ever printed, only names and counts.
 */

const KEYS_TABLE = "appKeys";
/** The field names the service and the import seal under, beside `<table>.<column>` itself. */
export const KNOWN_FIELDS = [
	"formResponses.payload",
	"clients.clinical",
	"feedback.text",
	"clientNotes.textEnc",
	"clients.mainReasonEnc",
	"clients.diagnosisEnc",
	"clients.healthNotesEnc",
	"visits.therapistNotes",
] as const;

const Doc = z.record(z.string(), z.unknown());
const KeyDoc = z.object({ tenant: z.string(), version: z.number(), wrapped: wrappedKeySchema });

/** `<table>/documents.jsonl` members, parsed: one document per line. */
export function tablesOf(
	entries: ReadonlyMap<string, Buffer>,
): Map<string, Record<string, unknown>[]> {
	const out = new Map<string, Record<string, unknown>[]>();
	for (const [name, bytes] of entries) {
		const m = /^([^/]+)\/documents\.jsonl$/.exec(name);
		if (m?.[1] === undefined || m[1].startsWith("_")) continue;
		const docs = bytes
			.toString("utf8")
			.split("\n")
			.filter((l) => l.trim() !== "")
			.map((l, i) => {
				const parsed = Doc.safeParse(JSON.parse(l));
				if (!parsed.success) throw new Error(`${m[1]} line ${i + 1}: not a document`);
				return parsed.data;
			});
		out.set(m[1], docs);
	}
	return out;
}

export const countsOf = (tables: ReadonlyMap<string, unknown[]>): Record<string, number> =>
	Object.fromEntries(
		[...tables]
			.map(([t, d]) => [t, d.length])
			.sort(([a], [b]) => String(a).localeCompare(String(b))),
	);

/** Every sealed value in a document, with the path of the field that holds it (nested up to three levels). */
function sealedIn(
	value: unknown,
	path: string,
	depth: number,
	out: { path: string; enc: Encrypted }[],
): void {
	const enc = encryptedSchema.safeParse(value);
	if (enc.success) {
		out.push({ path, enc: enc.data });
		return;
	}
	if (depth === 0 || value === null || typeof value !== "object") return;
	const items = Array.isArray(value)
		? value.map((v, i) => [String(i), v] as const)
		: Object.entries(value);
	for (const [k, v] of items) sealedIn(v, path === "" ? k : `${path}.${k}`, depth - 1, out);
}

export interface SealedReport {
	found: number;
	opened: number;
	/** Where a value did not open: table, field, and why (never the value). */
	failed: { table: string; field: string; reason: string }[];
	byTable: Record<string, number>;
}

async function opens(
	ring: KeyRing,
	enc: Encrypted,
	contexts: ReadonlyArray<string>,
): Promise<string | null> {
	let last = "decrypt_failed";
	for (const context of contexts) {
		try {
			await decryptField(ring, enc, context);
			return null;
		} catch (error) {
			if (error instanceof CryptoError) last = error.code;
			else throw error;
		}
	}
	return last;
}

/** Opens every sealed value with the master key and the archive's own wrapped data keys. */
export async function checkSealed(
	tables: ReadonlyMap<string, Record<string, unknown>[]>,
	masterKeyText: string,
): Promise<SealedReport> {
	const master = await parseMasterKey(masterKeyText);
	const wrapped = new Map<string, z.infer<typeof wrappedKeySchema>[]>();
	for (const d of tables.get(KEYS_TABLE) ?? []) {
		const k = KeyDoc.parse(d);
		wrapped.set(k.tenant, [...(wrapped.get(k.tenant) ?? []), k.wrapped]);
	}
	const rings = new Map<string, KeyRing>();
	const ringOf = async (tenant: string): Promise<KeyRing | null> => {
		const held = rings.get(tenant);
		if (held !== undefined) return held;
		const keys = wrapped.get(tenant);
		if (keys === undefined) return null;
		const ring = await buildKeyRing(master, tenant, keys);
		rings.set(tenant, ring);
		return ring;
	};
	const report: SealedReport = { found: 0, opened: 0, failed: [], byTable: {} };
	for (const [table, docs] of tables) {
		if (table === KEYS_TABLE) continue;
		for (const doc of docs) {
			const found: { path: string; enc: Encrypted }[] = [];
			for (const [k, v] of Object.entries(doc)) sealedIn(v, k, 3, found);
			if (found.length === 0) continue;
			const tenant =
				typeof doc.tenant === "string" ? doc.tenant : typeof doc.app === "string" ? doc.app : "";
			for (const { path, enc } of found) {
				report.found++;
				report.byTable[table] = (report.byTable[table] ?? 0) + 1;
				const ring = tenant === "" ? null : await ringOf(tenant);
				if (ring === null) {
					report.failed.push({ table, field: path, reason: "no_keys" });
					continue;
				}
				const contexts = [
					`${tenant}|${table}.${path}`,
					...KNOWN_FIELDS.map((f) => `${tenant}|${f}`),
				];
				const why = await opens(ring, enc, contexts);
				if (why === null) report.opened++;
				else report.failed.push({ table, field: path, reason: why });
			}
		}
	}
	return report;
}

/** Tables whose counts differ between two archives (a restore against its source). */
export function countDiff(
	a: Record<string, number>,
	b: Record<string, number>,
): { table: string; source: number; restored: number }[] {
	const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
	return names
		.filter((t) => (a[t] ?? 0) !== (b[t] ?? 0))
		.map((t) => ({ table: t, source: a[t] ?? 0, restored: b[t] ?? 0 }));
}
