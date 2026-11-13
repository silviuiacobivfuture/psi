import { z } from "zod";
import { currentActor } from "../actor";
import { type Collection, type FileRow, StoreRefused } from "../types";
import { toApiId } from "./ids";
import { isNotFound, matches } from "./recordSupport";
import { answer, type Rpc, unwrap } from "./rpc";

/**
 * Client files over apiRecordsExtra (metadata; the bytes are in object storage and never pass here). An upload the API
 * signed is `pending` until it is completed; `updatedAt` is the completion time, or the creation time before it. Only
 * the status moves after a file is made: its name, type and size are what was signed.
 */
const Stored = z.object({
	id: z.string(),
	client: z.string().optional(),
	fileName: z.string(),
	storageKey: z.string(),
	sizeBytes: z.number(),
	contentType: z.string(),
	uploadedBy: z.string(),
	status: z.enum(["pending", "ready"]),
	createdAt: z.number(),
	completedAt: z.number().optional(),
});
const One = answer({ file: Stored });
const Many = answer({ files: z.array(Stored) });
const Saved = answer({ id: z.string() });
const Done = answer({});

function rowOf(app: string, f: z.infer<typeof Stored>): FileRow {
	if (f.client === undefined) throw new StoreRefused("invalid");
	return {
		id: toApiId(f.id),
		app,
		clientId: toApiId(f.client),
		name: f.fileName,
		contentType: f.contentType,
		size: f.sizeBytes,
		status: f.status,
		uploadedBy: f.uploadedBy,
		objectKey: f.storageKey,
		createdAt: f.createdAt,
		updatedAt: f.completedAt ?? f.createdAt,
	};
}

export function fileCollection(rpc: Rpc): Collection<FileRow> {
	const actor = () => ({ subject: currentActor() });
	const get = async (app: string, id: string): Promise<FileRow | undefined> => {
		try {
			return rowOf(
				app,
				unwrap(await rpc.query("apiRecordsExtra:fileById", { tenant: app, file: id }, One)).file,
			);
		} catch (error) {
			if (isNotFound(error)) return undefined;
			throw error;
		}
	};
	const complete = async (app: string, id: string): Promise<void> => {
		unwrap(
			await rpc.mutation(
				"apiRecordsExtra:completeFile",
				{ tenant: app, actor: actor(), file: id },
				Done,
			),
		);
	};
	return {
		get,
		async list(app, query) {
			const out = unwrap(
				await rpc.query(
					"apiRecordsExtra:clientFiles",
					{
						tenant: app,
						...(query?.eq?.clientId === undefined ? {} : { client: query.eq.clientId }),
					},
					Many,
				),
			);
			return out.files.map((f) => rowOf(app, f)).filter((r) => matches(r, query));
		},
		async insert(row) {
			const made = unwrap(
				await rpc.mutation(
					"apiRecordsExtra:initFile",
					{
						tenant: row.app,
						actor: actor(),
						client: row.clientId,
						fileName: row.name,
						storageKey: row.objectKey,
						sizeBytes: row.size,
						contentType: row.contentType,
					},
					Saved,
				),
			);
			if (row.status === "ready") await complete(row.app, made.id);
			const saved = await get(row.app, made.id);
			if (saved === undefined) throw new StoreRefused("not_found");
			return saved;
		},
		async replace(row) {
			const held = await get(row.app, row.id);
			if (held === undefined) return false;
			if (
				held.clientId !== row.clientId ||
				held.name !== row.name ||
				held.contentType !== row.contentType ||
				held.size !== row.size ||
				held.objectKey !== row.objectKey ||
				(held.status === "ready" && row.status === "pending")
			)
				throw new StoreRefused("invalid");
			if (held.status === "pending" && row.status === "ready") await complete(row.app, row.id);
			return true;
		},
		async remove(app, id) {
			if ((await get(app, id)) === undefined) return false;
			try {
				unwrap(
					await rpc.mutation(
						"apiRecords:removeFile",
						{ tenant: app, actor: actor(), file: id },
						answer({ storageKey: z.string() }),
					),
				);
				return true;
			} catch (error) {
				if (isNotFound(error)) return false;
				throw error;
			}
		},
	};
}
