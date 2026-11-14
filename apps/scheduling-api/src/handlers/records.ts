import { recordResourceFor } from "@psi/scheduling/permissions";
import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { appLink, parentLink } from "../authz/links";
import type { Ctx, HandlersOf } from "../http/context";
import { fail, forbidden } from "../http/errors";
import { FIELDS } from "../ports/crypto";
import type { RecordRow } from "../store/types";
import { must, newId, paginate, stamps, writeTuples } from "./shared";

type C = Ctx<RouteSpec>;
const MAX_RECORD_BYTES = 100_000;

const summary = (r: RecordRow) => ({
	id: r.id,
	...(r.clientId === undefined ? {} : { clientId: r.clientId }),
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
	const data: unknown = JSON.parse(await ctx.deps.crypto.open(r.app, FIELDS.record, r.sealed));
	await ctx.auditNow("clinical.read", { type: "record", id: r.id }, { via });
	return {
		...summary(r),
		data:
			typeof data === "object" && data !== null && !Array.isArray(data)
				? Object.fromEntries(Object.entries(data))
				: {},
	};
}

/**
 * A record's facts: its app, and its client when it has one. A record of no client has no client fact, so no
 * own/assigned scope and no client's grant reaches it: only the app-wide scope does (`sched_record` in the model).
 */
const links = (type: "sched_record", id: string, app: string, clientId: string | undefined) => [
	appLink(type, id, app),
	...(clientId === undefined ? [] : [parentLink(type, id, "client", "sched_client", clientId)]),
];

async function sealed(ctx: C, app: string, data: Record<string, unknown>): Promise<string> {
	const json = JSON.stringify(data);
	if (json.length > MAX_RECORD_BYTES)
		throw fail("invalid", "the record is too large", { field: "data" });
	return ctx.deps.crypto.seal(app, FIELDS.record, json);
}

export const recordHandlers: HandlersOf<
	| "records.list"
	| "records.withoutClient"
	| "records.create"
	| "records.get"
	| "records.update"
	| "records.remove"
> = {
	async "records.withoutClient"(ctx) {
		// A record of no client is reached by the app-wide scope of its form's resource only: there is no client whose
		// practitioner, coordinator or grant could stand for it. A role with none of them app-wide is refused.
		const readable = new Set<string>();
		for (const resource of RECORD_RESOURCES)
			if ((await ctx.scopesOf(`${resource}_view`)).includes("all"))
				readable.add(`${resource}_view`);
		if (readable.size === 0)
			throw forbidden("the role does not allow this", { permission: "record:dynamic" });
		const rows = (await ctx.deps.store.c.records.list(ctx.app, { absent: "clientId" }))
			.filter((r) => r.clientId === undefined)
			.sort((a, b) => b.createdAt - a.createdAt);
		const shown: RecordRow[] = [];
		for (const r of rows)
			if (readable.has(`${await resourceOfForm(ctx, r.formId)}_view`)) shown.push(r);
		const page = paginate(shown, ctx.query.limit, ctx.query.cursor);
		return {
			...page,
			items: await Promise.all(page.items.map((r) => full(ctx, r, "records.withoutClient"))),
		};
	},

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
		// Only the page is opened (decrypted and audited), never every record the client has.
		const page = paginate(shown, ctx.query.limit, ctx.query.cursor);
		return {
			...page,
			items: await Promise.all(page.items.map((r) => full(ctx, r, "records.list"))),
		};
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
			sealed: await sealed(ctx, ctx.app, ctx.body.data),
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
			sealed: await sealed(ctx, ctx.app, ctx.body.data),
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
};
