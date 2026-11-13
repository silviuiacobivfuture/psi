import type { WrappedKey } from "../../src/crypto";
import type { AppSpec, ImportSink, Kind, RowsByKind, SlugKind, UpsertResult } from "./sink";

/**
 * A stand-in for the store in tests: it follows the same contract as the Convex functions (keyed on
 * the legacy id, an unchanged fingerprint touches nothing, a changed one updates and bumps the
 * version, a reference to a row not stored is an orphan) so the importer's own behaviour can be
 * tested without a backend. The real functions are tested against a real backend elsewhere.
 */
interface Stored {
	row: RowsByKind[Kind];
	version: number;
}

const REFERENCES: Record<Kind, ReadonlyArray<{ field: string; kind: Kind }>> = {
	practitioners: [],
	devices: [],
	rooms: [],
	groups: [],
	staff: [],
	clients: [{ field: "treatingLegacy", kind: "practitioners" }],
	packages: [{ field: "clientLegacy", kind: "clients" }],
	visits: [
		{ field: "clientLegacy", kind: "clients" },
		{ field: "packageLegacy", kind: "packages" },
	],
	payments: [{ field: "clientLegacy", kind: "clients" }],
	roster: [],
	blocks: [],
	responses: [{ field: "clientLegacy", kind: "clients" }],
	files: [],
	blacklist: [{ field: "clientLegacy", kind: "clients" }],
};

export class MemorySink implements ImportSink {
	readonly tables = new Map<Kind, Map<string, Stored>>();
	readonly installed: Array<{ tenant: string; version: number }> = [];
	apps: AppSpec[] = [];
	keyRows: WrappedKey[] = [];
	/** Count of rows created or updated: zero across a re-run means a no-op. */
	changes = 0;

	private table(kind: Kind): Map<string, Stored> {
		const found = this.tables.get(kind);
		if (found !== undefined) return found;
		const made = new Map<string, Stored>();
		this.tables.set(kind, made);
		return made;
	}

	async ensureApp(app: AppSpec): Promise<void> {
		this.apps.push(app);
	}

	async keys(): Promise<WrappedKey[]> {
		return this.keyRows;
	}

	async installKey(tenant: string, version: number, wrapped: WrappedKey): Promise<void> {
		this.installed.push({ tenant, version });
		this.keyRows.push(wrapped);
	}

	async upsert<K extends Kind>(
		_tenant: string,
		kind: K,
		rows: ReadonlyArray<RowsByKind[K]>,
	): Promise<UpsertResult[]> {
		const out: UpsertResult[] = [];
		const table = this.table(kind);
		for (const row of rows) {
			const legacyId = String(Reflect.get(row, "legacyId"));
			const fingerprint = String(Reflect.get(row, "fingerprint"));
			const missing = REFERENCES[kind].find((ref) => {
				const value = Reflect.get(row, ref.field);
				return typeof value === "string" && !this.table(ref.kind).has(value);
			});
			if (missing !== undefined) {
				out.push({ legacyId, outcome: "orphan", flag: `missing:${missing.field}` });
				continue;
			}
			const found = table.get(legacyId);
			if (found === undefined) {
				table.set(legacyId, { row, version: 1 });
				this.changes += 1;
				out.push({ legacyId, id: legacyId, outcome: "created" });
			} else if (kind === "blacklist" || Reflect.get(found.row, "fingerprint") === fingerprint) {
				// Staff own a seeded blacklist entry from the moment it exists: a re-run never rewrites it.
				out.push({ legacyId, id: legacyId, outcome: "unchanged" });
			} else {
				table.set(legacyId, { row, version: found.version + 1 });
				this.changes += 1;
				out.push({ legacyId, id: legacyId, outcome: "updated" });
			}
		}
		return out;
	}

	async knownFiles(): Promise<Map<string, string>> {
		const known = new Map<string, string>();
		for (const [id, stored] of this.table("files")) {
			known.set(id, String(Reflect.get(stored.row, "fingerprint")));
		}
		return known;
	}

	learned: Array<{ definitionKey: string; field: string; values: string[] }> = [];

	async learnOptions(
		_tenant: string,
		entries: ReadonlyArray<{
			definitionKey: string;
			definitionVersion: number;
			field: string;
			values: string[];
		}>,
	): Promise<void> {
		this.learned.push(
			...entries.map((e) => ({ definitionKey: e.definitionKey, field: e.field, values: e.values })),
		);
	}

	async slugs(): Promise<Array<{ kind: SlugKind; slug: string; legacyId: string | undefined }>> {
		const out: Array<{ kind: SlugKind; slug: string; legacyId: string | undefined }> = [];
		for (const kind of ["practitioners", "rooms", "devices", "groups"] as const) {
			for (const [legacyId, stored] of this.table(kind)) {
				out.push({ kind, slug: String(Reflect.get(stored.row, "slug")), legacyId });
			}
		}
		return out;
	}

	count(kind: Kind): number {
		return this.table(kind).size;
	}

	version(kind: Kind, legacyId: string): number | undefined {
		return this.table(kind).get(legacyId)?.version;
	}

	row(kind: Kind, legacyId: string): RowsByKind[Kind] | undefined {
		return this.table(kind).get(legacyId)?.row;
	}

	/** Everything stored, as one string: what the leak tests search. */
	dump(): string {
		return JSON.stringify([...this.tables].map(([k, t]) => [k, [...t.values()].map((s) => s.row)]));
	}
}
