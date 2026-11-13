import { readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { type FileKind, storageKeyFor } from "../../src/clinic/files";
import { sha256Hex } from "../../src/crypto";
import type { ObjectStorage } from "../../src/storage";
import type { FileRow } from "./rows";
import type { Row } from "./source";
import { type Ctx, clean, fingerprintOf, reportExtraColumns, timestamp } from "./support";

const CLIENT_FILE_COLUMNS = new Set([
	"id",
	"client_id",
	"file_name",
	"file_path",
	"file_size",
	"file_type",
	"uploaded_by",
	"created_at",
]);
const AVIZ_COLUMNS = new Set([
	"id",
	"title",
	"file_name",
	"file_path",
	"file_size",
	"file_type",
	"uploaded_by",
	"created_at",
	"updated_at",
]);

export type Bucket = "client-files" | "avize";

/** Where the exported file bytes are: `<dir>/<bucket>/<file_path>`. */
export interface FileSource {
	read(bucket: Bucket, path: string): Promise<Uint8Array<ArrayBuffer> | "unsafe" | undefined>;
}

export function createDirSource(dir: string): FileSource {
	const root = resolve(dir);
	return {
		async read(bucket, path) {
			const target = resolve(root, bucket, path);
			const inside = relative(resolve(root, bucket), target);
			if (inside === "" || inside.startsWith("..") || resolve(inside) === inside) return "unsafe";
			try {
				if (!(await stat(target)).isFile()) return undefined;
				return new Uint8Array(await readFile(target));
			} catch {
				return undefined;
			}
		},
	};
}

export interface FilesOut {
	rows: FileRow[];
	/** Files whose bytes were read and checked (dry run) or whose row is already imported unchanged. */
	checked: number;
	checkedClientFiles: number;
	checkedAvize: number;
	unchanged: number;
}

type Real = {
	storage: ObjectStorage;
	/** Fingerprints of file rows already imported. */
	known: ReadonlyMap<string, string>;
};

interface Item {
	table: "client_files" | "avize";
	id: number;
	bucket: Bucket;
	kind: FileKind;
	clientLegacy: string | undefined;
	title: string | undefined;
	row: Row<"client_files"> | Row<"avize">;
}

/**
 * Client files and the notice board. Bytes come from the source, are hashed, encrypted and put in
 * the object store (real mode only); the row keeps the hash of the ORIGINAL bytes, the size, and
 * the key version and IV. A file whose row is already imported unchanged is not read again into
 * the store: its IV would no longer match the metadata.
 */
export async function planFiles(
	ctx: Ctx,
	clientFiles: ReadonlyArray<Row<"client_files">>,
	avize: ReadonlyArray<Row<"avize">>,
	clientIds: ReadonlySet<number>,
	source: FileSource | undefined,
	real: Real | undefined,
): Promise<FilesOut> {
	const out: FilesOut = {
		rows: [],
		checked: 0,
		checkedClientFiles: 0,
		checkedAvize: 0,
		unchanged: 0,
	};
	const items: Item[] = [];
	for (const f of clientFiles) {
		reportExtraColumns(ctx, "client_files", f.id, f, CLIENT_FILE_COLUMNS);
		const ref = `client_files:${f.id}`;
		if (f.client_id === null || f.client_id === undefined || !clientIds.has(f.client_id)) {
			ctx.log.add("orphan_file_client", "skipped", ref);
			continue;
		}
		items.push({
			table: "client_files",
			id: f.id,
			bucket: "client-files",
			kind: "client_file",
			clientLegacy: `clients:${f.client_id}`,
			title: undefined,
			row: f,
		});
	}
	for (const a of avize) {
		reportExtraColumns(ctx, "avize", a.id, a, AVIZ_COLUMNS);
		items.push({
			table: "avize",
			id: a.id,
			bucket: "avize",
			kind: "notice",
			clientLegacy: undefined,
			title: clean(a.title),
			row: a,
		});
	}
	if (items.length > 0 && source === undefined) {
		for (const item of items)
			ctx.log.add("files_dir_required", "blocking", `${item.table}:${item.id}`);
		return out;
	}
	for (const item of items) {
		const ref = `${item.table}:${item.id}`;
		const path = clean(item.row.file_path);
		const fileName = clean(item.row.file_name);
		if (path === undefined || fileName === undefined || source === undefined) {
			ctx.log.add("file_without_path_or_name", "skipped", ref);
			continue;
		}
		const bytes = await source.read(item.bucket, path);
		if (bytes === "unsafe") {
			ctx.log.add("unsafe_file_path", "skipped", ref);
			continue;
		}
		if (bytes === undefined) {
			ctx.log.add("file_missing_on_disk", "skipped", ref);
			continue;
		}
		const sha = await sha256Hex(bytes);
		const declared = item.row.file_size;
		if (declared !== null && declared !== undefined && declared !== bytes.length) {
			ctx.log.add("file_size_differs", "note", ref);
		}
		out.checked += 1;
		if (item.table === "client_files") out.checkedClientFiles += 1;
		else out.checkedAvize += 1;
		const legacyId = ref;
		const fingerprint = await fingerprintOf(ctx, item.table, { row: item.row, sha });
		if (real === undefined) continue;
		if (real.known.get(legacyId) === fingerprint) {
			out.unchanged += 1;
			continue;
		}
		const storageKey = storageKeyFor(ctx.tenant, item.kind, `${item.table}-${item.id}`, sha);
		const sealed = await ctx.enc.encryptBytes(bytes, `files|${storageKey}`);
		await real.storage.put(storageKey, sealed.bytes, "application/octet-stream");
		out.rows.push({
			legacyId,
			fingerprint,
			kind: item.kind,
			clientLegacy: item.clientLegacy,
			title: item.title,
			fileName,
			storageKey,
			sha256: sha,
			sizeBytes: bytes.length,
			contentType: clean(item.row.file_type) ?? "application/octet-stream",
			uploadedBy: clean(item.row.uploaded_by) ?? "legacy",
			encryption: { keyVersion: sealed.keyVersion, iv: sealed.iv },
			createdAt: timestamp(item.row.created_at) ?? ctx.exportedAt,
		});
	}
	return out;
}
