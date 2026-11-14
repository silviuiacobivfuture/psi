import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { reaches } from "../authz/access";
import { appLink, parentLink } from "../authz/links";
import type { Ctx, HandlersOf } from "../http/context";
import { fail, unavailableFiles } from "../http/errors";
import type { FileRow } from "../store/types";
import {
	must,
	newId,
	removeTuplesThenRow,
	stamps,
	writeRowThenTuples,
	writeTuples,
} from "./shared";

type C = Ctx<RouteSpec>;

/** A signed upload link is good for fifteen minutes; a download link for five. */
const UPLOAD_TTL_S = 900;
const DOWNLOAD_TTL_S = 300;

const fileOut = (f: FileRow) => ({
	id: f.id,
	clientId: f.clientId,
	name: f.name,
	contentType: f.contentType,
	size: f.size,
	status: f.status,
	uploadedBy: f.uploadedBy,
	createdAt: f.createdAt,
	updatedAt: f.updatedAt,
});

const links = (id: string, app: string, clientId: string) => [
	appLink("sched_file", id, app),
	parentLink("sched_file", id, "client", "sched_client", clientId),
];

/**
 * A completed upload whose object is not what was announced is thrown away: the object, the file, its tuples. A file
 * nobody asked for must not linger as someone's clinical document, and it cannot be fixed (the signed link was for
 * one size and type). The refusal says which of the two differed, never the bytes.
 */
async function rejectUpload(
	ctx: C,
	row: FileRow,
	reason: "size_mismatch" | "type_mismatch",
): Promise<never> {
	await ctx.deps.objects?.remove(row.objectKey);
	await ctx.deps.store.c.files.remove(ctx.app, row.id);
	await writeTuples(ctx, [], links(row.id, ctx.app, row.clientId));
	await ctx.auditNow("file.delete", { type: "file", id: row.id }, { reason: "upload_rejected" });
	throw fail("conflict", "the stored object is not the one announced", { reason });
}

export const fileHandlers: HandlersOf<
	| "files.list"
	| "files.init"
	| "files.complete"
	| "files.download"
	| "files.rename"
	| "files.remove"
> = {
	async "files.list"(ctx) {
		const visible = await ctx.reachOf("files_view", "sched_file");
		return {
			items: (
				await ctx.deps.store.c.files.list(ctx.app, { eq: { clientId: String(ctx.params.id) } })
			)
				.filter((f) => reaches(visible, f.id))
				.sort((a, b) => b.createdAt - a.createdAt)
				.map(fileOut),
		};
	},

	async "files.init"(ctx) {
		const objects = ctx.deps.objects;
		if (objects === undefined) throw unavailableFiles();
		const client = await must(ctx.deps.store.c.clients, ctx.app, String(ctx.params.id), "client");
		const row = await writeRowThenTuples(ctx, {
			write: () =>
				ctx.deps.store.c.files.insert({
					id: newId("f"),
					app: ctx.app,
					clientId: client.id,
					name: ctx.body.name,
					contentType: ctx.body.contentType,
					size: ctx.body.size,
					status: "pending",
					uploadedBy: ctx.subject,
					objectKey: `${ctx.app}/${client.id}/${newId("o")}`,
					...stamps(ctx.now),
				}),
			undo: async (saved) => {
				await ctx.deps.store.c.files.remove(ctx.app, saved.id);
			},
			tuples: (saved) => ({ writes: links(saved.id, ctx.app, client.id), deletes: [] }),
		});
		const link = objects.signUpload(row.objectKey, row.contentType, UPLOAD_TTL_S);
		return {
			file: fileOut(row),
			upload: { url: link.url, expiresAt: link.expiresAt, method: "PUT" as const },
		};
	},

	async "files.complete"(ctx) {
		const objects = ctx.deps.objects;
		if (objects === undefined) throw unavailableFiles();
		const row = await must(ctx.deps.store.c.files, ctx.app, String(ctx.params.id), "file");
		// Completing twice is the same as once: nothing is written the second time.
		if (row.status === "ready") return fileOut(row);
		const stored = await objects.head(row.objectKey);
		if (stored === undefined)
			throw fail("conflict", "the upload has not arrived", { reason: "missing" });
		if (stored.size !== row.size) return rejectUpload(ctx, row, "size_mismatch");
		if (stored.contentType !== undefined && stored.contentType !== row.contentType)
			return rejectUpload(ctx, row, "type_mismatch");
		const next: FileRow = { ...row, status: "ready", updatedAt: ctx.now };
		await ctx.deps.store.c.files.replace(next);
		return fileOut(next);
	},

	async "files.download"(ctx) {
		const objects = ctx.deps.objects;
		if (objects === undefined) throw unavailableFiles();
		const row = await must(ctx.deps.store.c.files, ctx.app, String(ctx.params.id), "file");
		if (row.status !== "ready")
			throw fail("conflict", "the upload has not finished", { status: row.status });
		const link = objects.signDownload(row.objectKey, DOWNLOAD_TTL_S, row.name);
		await ctx.auditNow("file.download", { type: "file", id: row.id });
		return { url: link.url, expiresAt: link.expiresAt, method: "GET" as const };
	},

	/**
	 * Only the name moves. The same name again writes nothing and records nothing (the audit says what happened, and
	 * nothing did). The journal keeps that a file was renamed, never the names: they may carry a client's name.
	 */
	async "files.rename"(ctx) {
		const row = await must(ctx.deps.store.c.files, ctx.app, String(ctx.params.id), "file");
		if (row.name === ctx.body.name) {
			ctx.unchanged();
			return fileOut(row);
		}
		const next: FileRow = { ...row, name: ctx.body.name, updatedAt: ctx.now };
		await ctx.deps.store.c.files.replace(next);
		ctx.note({ client: row.clientId, fields: ["name"] });
		return fileOut(next);
	},

	/** The route's query (`confirm=true`) is parsed before this runs: a call without it never gets here. */
	async "files.remove"(ctx) {
		const row = await must(ctx.deps.store.c.files, ctx.app, String(ctx.params.id), "file");
		await ctx.deps.objects?.remove(row.objectKey);
		await removeTuplesThenRow(ctx, {
			tuples: links(row.id, ctx.app, row.clientId),
			remove: async () => {
				await ctx.deps.store.c.files.remove(ctx.app, row.id);
			},
		});
		return { ok: true as const };
	},
};
