import { recordResourceFor } from "@psi/scheduling/permissions";
import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { reaches } from "../authz/access";
import { appLink, parentLink } from "../authz/links";
import type { Ctx, HandlersOf } from "../http/context";
import { fail, unavailableFiles } from "../http/errors";
import type { FileRow, RecordRow } from "../store/types";
import { must, newId, stamps, writeTuples } from "./shared";

type C = Ctx<RouteSpec>;
const MAX_RECORD_BYTES = 100_000;
/** Bound to the client, not the record: the store assigns the record's id when it is inserted. */
const recordContext = (app: string, clientId: string): string => `${app}:client:${clientId}:record`;

const summary = (r: RecordRow) => ({
	id: r.id,
	clientId: r.clientId,
	formId: r.formId,
	formVersion: r.formVersion,
	...(r.appointmentId === undefined ? {} : { appointmentId: r.appointmentId }),
	authorSubject: r.authorSubject,
	createdAt: r.createdAt,
	updatedAt: r.updatedAt,
});

/** The five permission resources a record can belong to, by the form that wrote it. */
const RECORD_RESOURCES = [
	"report_aba",
	"report_racemeup",
	"report_psychotherapy",
	"report_custom",
	"questionnaire_parent",
] as const;

/** The resource that governs a record: its form's. A form that no longer exists falls to `report_custom`. */
async function resourceOfForm(ctx: C, formId: string): Promise<string> {
	const form = await ctx.deps.store.c.definitions.get(ctx.app, formId);
	return recordResourceFor(form?.kind === "forms" ? form.id : "");
}

/** A record's content is opened only for a caller who may view this record (its form's resource), and the read is audited. */
async function full(ctx: C, r: RecordRow, via: string) {
	const data: unknown = JSON.parse(
		ctx.deps.crypto.open(r.sealed, recordContext(r.app, r.clientId)),
	);
	await ctx.auditNow("clinical.read", { type: "record", id: r.id }, { via });
	return {
		...summary(r),
		data:
			typeof data === "object" && data !== null && !Array.isArray(data)
				? Object.fromEntries(Object.entries(data))
				: {},
	};
}

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
const links = (type: "sched_record" | "sched_file", id: string, app: string, clientId: string) => [
	appLink(type, id, app),
	parentLink(type, id, "client", "sched_client", clientId),
];

function sealed(ctx: C, app: string, clientId: string, data: Record<string, unknown>): string {
	const json = JSON.stringify(data);
	if (json.length > MAX_RECORD_BYTES)
		throw fail("invalid", "the record is too large", { field: "data" });
	return ctx.deps.crypto.seal(json, recordContext(app, clientId));
}

export const recordHandlers: HandlersOf<
	| "records.list"
	| "records.create"
	| "records.get"
	| "records.update"
	| "records.remove"
	| "files.list"
	| "files.init"
	| "files.complete"
	| "files.download"
	| "files.remove"
> = {
	async "records.list"(ctx) {
		const client = String(ctx.params.id);
		const held = await ctx.authorizeAny(
			RECORD_RESOURCES.map((r) => `${r}_view`),
			"sched_client",
			client,
		);
		const rows = (await ctx.deps.store.c.records.list(ctx.app, { eq: { clientId: client } })).sort(
			(a, b) => b.createdAt - a.createdAt,
		);
		const shown: RecordRow[] = [];
		for (const r of rows)
			if (held.includes(`${await resourceOfForm(ctx, r.formId)}_view`)) shown.push(r);
		return { items: await Promise.all(shown.map((r) => full(ctx, r, "records.list"))) };
	},

	async "records.create"(ctx) {
		const form = await ctx.deps.store.c.definitions.get(ctx.app, ctx.body.formId);
		const resource = recordResourceFor(form?.kind === "forms" ? form.id : "");
		await ctx.authorize(`${resource}_create`, "sched_client", String(ctx.params.id));
		const client = await must(ctx.deps.store.c.clients, ctx.app, String(ctx.params.id), "client");
		if (form === undefined || form.kind !== "forms")
			throw fail("invalid", "unknown form", { field: "formId" });
		if (ctx.body.appointmentId !== undefined)
			await must(ctx.deps.store.c.appointments, ctx.app, ctx.body.appointmentId, "appointment");
		const draft: RecordRow = {
			id: newId("x"),
			app: ctx.app,
			clientId: client.id,
			formId: form.id,
			formVersion: form.version,
			...(ctx.body.appointmentId === undefined ? {} : { appointmentId: ctx.body.appointmentId }),
			authorSubject: ctx.subject,
			sealed: sealed(ctx, ctx.app, client.id, ctx.body.data),
			...stamps(ctx.now),
		};
		const row = await ctx.deps.store.c.records.insert(draft);
		await writeTuples(ctx, links("sched_record", row.id, ctx.app, client.id));
		ctx.note({ formId: form.id, formVersion: form.version });
		return summary(row);
	},

	async "records.get"(ctx) {
		const row = await must(ctx.deps.store.c.records, ctx.app, String(ctx.params.id), "record");
		await ctx.authorize(`${await resourceOfForm(ctx, row.formId)}_view`, "sched_record", row.id);
		return full(ctx, row, "records.get");
	},

	async "records.update"(ctx) {
		const row = await must(ctx.deps.store.c.records, ctx.app, String(ctx.params.id), "record");
		await ctx.authorize(`${await resourceOfForm(ctx, row.formId)}_edit`, "sched_record", row.id);
		const next: RecordRow = {
			...row,
			sealed: sealed(ctx, ctx.app, row.clientId, ctx.body.data),
			updatedAt: ctx.now,
		};
		await ctx.deps.store.c.records.replace(next);
		return summary(next);
	},

	async "records.remove"(ctx) {
		const row = await must(ctx.deps.store.c.records, ctx.app, String(ctx.params.id), "record");
		await ctx.authorize(`${await resourceOfForm(ctx, row.formId)}_delete`, "sched_record", row.id);
		await ctx.deps.store.c.records.remove(ctx.app, row.id);
		await writeTuples(ctx, [], links("sched_record", row.id, ctx.app, row.clientId));
		return { ok: true as const };
	},

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
		const draft: FileRow = {
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
		};
		const row = await ctx.deps.store.c.files.insert(draft);
		await writeTuples(ctx, links("sched_file", row.id, ctx.app, client.id));
		const link = objects.signUpload(row.objectKey, row.contentType, 900);
		return {
			file: fileOut(row),
			upload: { url: link.url, expiresAt: link.expiresAt, method: "PUT" as const },
		};
	},

	async "files.complete"(ctx) {
		const row = await must(ctx.deps.store.c.files, ctx.app, String(ctx.params.id), "file");
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
		const link = objects.signDownload(row.objectKey, 300, row.name);
		await ctx.auditNow("file.download", { type: "file", id: row.id });
		return { url: link.url, expiresAt: link.expiresAt, method: "GET" as const };
	},

	async "files.remove"(ctx) {
		const row = await must(ctx.deps.store.c.files, ctx.app, String(ctx.params.id), "file");
		await ctx.deps.objects?.remove(row.objectKey);
		await ctx.deps.store.c.files.remove(ctx.app, row.id);
		await writeTuples(ctx, [], links("sched_file", row.id, ctx.app, row.clientId));
		return { ok: true as const };
	},
};
