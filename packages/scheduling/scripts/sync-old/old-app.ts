import { z } from "zod";
import type { FileSource } from "../import-old/files";
import { MUST_BE_EMPTY, TABLES } from "../import-old/source";
import { OldAppError, type ReadOnlyClient } from "./readonly-client";

/** Every table the importer knows, plus the ones it requires to be empty (so a sync still notices rows there). */
export const SYNCED_TABLES: ReadonlyArray<string> = [...Object.keys(TABLES), ...MUST_BE_EMPTY];

/** PostgREST caps a response (1,000 rows by default); pages stay under it. */
const PAGE = 1000;
const MAX_PAGES = 500;

const Rows = z.array(z.unknown());

/** One table, every row, in id order. Reads only (GET). The error names the table and the status, never a body. */
async function fetchTable(client: ReadOnlyClient, table: string): Promise<unknown[]> {
	const out: unknown[] = [];
	for (let page = 0; page < MAX_PAGES; page += 1) {
		const res = await client.get(`/rest/v1/${table}`, {
			select: "*",
			order: "id.asc",
			limit: String(PAGE),
			offset: String(page * PAGE),
		});
		// An unknown table (PostgREST: 404) is an empty one, for the tables the importer requires to be empty.
		if (res.status === 404 && (MUST_BE_EMPTY as ReadonlyArray<string>).includes(table)) return [];
		if (!res.ok)
			throw new OldAppError(`the old app answered ${res.status} for table ${table}`, res.status);
		const rows = Rows.safeParse(await res.json().catch(() => undefined));
		if (!rows.success) throw new OldAppError(`the old app's table ${table} is not a list of rows`);
		out.push(...rows.data);
		if (rows.data.length < PAGE) return out;
	}
	throw new OldAppError(`table ${table} has more than ${MAX_PAGES * PAGE} rows`);
}

export interface OldExport {
	exported_at: string;
	tables: Record<string, unknown[]>;
}

/**
 * The old app's data in the importer's own export format: `{ exported_at, tables }`, every table the importer
 * knows. The tables are read one after another (not one snapshot): a row added in between shows up as a transient
 * orphan reference and settles on the next run.
 */
export async function fetchExport(client: ReadOnlyClient, now: () => Date): Promise<OldExport> {
	const tables: Record<string, unknown[]> = {};
	for (const table of SYNCED_TABLES) tables[table] = await fetchTable(client, table);
	return { exported_at: now().toISOString(), tables };
}

/**
 * The old app's stored files, read over GET with the signed-in user's token; the importer hashes what it reads.
 * One sync pass plans the files several times (the comparison, then the write), so a file is downloaded once per
 * source and kept for the pass: the source lives as long as one run.
 */
export function createRemoteFileSource(client: ReadOnlyClient): FileSource {
	const seen = new Map<string, Promise<Uint8Array<ArrayBuffer> | undefined>>();
	const download = async (
		bucket: string,
		parts: string[],
	): Promise<Uint8Array<ArrayBuffer> | undefined> => {
		const res = await client.get(
			`/storage/v1/object/authenticated/${bucket}/${parts.map(encodeURIComponent).join("/")}`,
		);
		if (res.status === 404 || res.status === 400) return undefined;
		if (!res.ok)
			throw new OldAppError(`the old app answered ${res.status} for a stored file`, res.status);
		return new Uint8Array(await res.arrayBuffer());
	};
	return {
		async read(bucket, path) {
			const parts = path.split("/");
			if (
				path === "" ||
				path.startsWith("/") ||
				parts.some((p) => p === ".." || p === "." || p === "")
			)
				return "unsafe";
			const key = `${bucket}/${path}`;
			const cached = seen.get(key) ?? download(bucket, parts);
			seen.set(key, cached);
			const bytes = await cached;
			// A copy each time: the importer may hold it while the next plan reads the same file.
			return bytes === undefined ? undefined : new Uint8Array(bytes);
		},
	};
}
