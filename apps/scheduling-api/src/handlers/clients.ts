import type { FieldGroupName } from "@psi/scheduling-sdk/contract";
import { NONE, reaches } from "../authz/access";
import { appLink, treatingLink } from "../authz/links";
import type { HandlersOf } from "../http/context";
import { fail, forbidden } from "../http/errors";
import { FIELDS } from "../ports/crypto";
import type { ClientRow } from "../store/types";
import { clientGroupReach, clientView } from "./fields";
import { readableNotes } from "./notes";
import { diff, must, newId, paginate, stamps, writeTuples } from "./shared";

const GROUPS = [
	"contact",
	"guardian",
	"money",
	"clinical",
] as const satisfies readonly FieldGroupName[];
const PURGE_DAYS = 30;

export const clientHandlers: HandlersOf<
	| "clients.list"
	| "clients.create"
	| "clients.get"
	| "clients.update"
	| "clients.assign"
	| "clients.archive"
	| "clients.restore"
	| "clients.remove"
> = {
	async "clients.list"(ctx) {
		const rows = (
			await ctx.deps.store.c.clients.list(ctx.app, { eq: { status: ctx.query.status } })
		)
			.filter((r) => reaches(ctx.reach, r.id))
			.filter(
				(r) =>
					ctx.query.q === undefined || r.name.toLowerCase().includes(ctx.query.q.toLowerCase()),
			)
			.sort((a, b) => a.name.localeCompare(b.name));
		// A list never decrypts or audits clinical data: that is one client at a time.
		const groups = ctx.query.fields === "groups";
		const include = { contact: groups, guardian: groups, money: groups, clinical: false };
		const reach = groups
			? await clientGroupReach(ctx)
			: { contact: NONE, guardian: NONE, money: NONE, clinical: NONE };
		const page = paginate(rows, ctx.query.limit, ctx.query.cursor);
		return {
			...page,
			items: (await Promise.all(page.items.map((row) => clientView(ctx, row, reach, include)))).map(
				(v) => v.client,
			),
		};
	},

	async "clients.create"(ctx) {
		const b = ctx.body;
		for (const g of GROUPS)
			if (b[g] !== undefined && !(await ctx.canAll(`clients_create_${g}`)))
				throw forbidden("not allowed to write this field group", { group: g });
		if (b.treating !== undefined && b.treating.length > 0 && !(await ctx.canAll("clients_assign")))
			throw forbidden("not allowed to assign practitioners", { permission: "clients_assign" });
		const people = await ctx.deps.store.c.people.list(ctx.app);
		for (const p of b.treating ?? [])
			if (!people.some((x) => x.id === p && x.active))
				throw fail("invalid", "unknown person", { person: p });
		const row: ClientRow = {
			id: newId("c"),
			app: ctx.app,
			name: b.name,
			status: "active",
			treating: [...new Set(b.treating ?? [])],
			...(b.birthYear === undefined ? {} : { birthYear: b.birthYear }),
			...(b.contact === undefined ? {} : { contact: b.contact }),
			...(b.guardian === undefined ? {} : { guardian: b.guardian }),
			...(b.money === undefined ? {} : { money: b.money }),
			...stamps(ctx.now),
		};
		let saved = await ctx.deps.store.c.clients.insert(row);
		if (b.clinical !== undefined) {
			// Written in a second step: the clinical group is the store's own column, set once the client exists.
			const clinicalSealed = await ctx.deps.crypto.seal(
				ctx.app,
				FIELDS.clinical,
				JSON.stringify(b.clinical),
			);
			saved = { ...saved, clinicalSealed };
			try {
				await ctx.deps.store.c.clients.replace(saved);
			} catch (error) {
				await ctx.deps.store.c.clients.remove(ctx.app, saved.id);
				throw error;
			}
		}
		await writeTuples(ctx, [
			appLink("sched_client", saved.id, ctx.app),
			...saved.treating.map((p) => treatingLink(saved.id, p)),
		]);
		await ctx.changed("client", "created", saved.id);
		ctx.note({ groups: GROUPS.filter((g) => b[g] !== undefined) });
		return view(ctx, saved);
	},

	async "clients.get"(ctx) {
		const row = await must(ctx.deps.store.c.clients, ctx.app, String(ctx.params.id), "client");
		// The summary carries the pinned notes the caller may read (a clinical one only with the clinical group).
		// Like a field group the caller lacks, it is ABSENT (not empty) for a role with no notes key at all.
		const holds = (await ctx.scopesOf("notes_view")).length > 0;
		return {
			...(await view(ctx, row)),
			...(holds ? { pinnedNotes: await readableNotes(ctx, row.id, true) } : {}),
		};
	},

	async "clients.update"(ctx) {
		const row = await must(ctx.deps.store.c.clients, ctx.app, String(ctx.params.id), "client");
		const b = ctx.body;
		for (const g of GROUPS)
			if (b[g] !== undefined && !(await ctx.canOn(`clients_edit_${g}`, "sched_client", row.id)))
				throw forbidden("not allowed to write this field group", { group: g });
		const { clinicalSealed, ...plain } = row;
		let sealed = clinicalSealed;
		if (b.clinical !== undefined) {
			const held =
				clinicalSealed === undefined
					? {}
					: JSON.parse(await ctx.deps.crypto.open(ctx.app, FIELDS.clinical, clinicalSealed));
			sealed = await ctx.deps.crypto.seal(
				ctx.app,
				FIELDS.clinical,
				JSON.stringify({ ...held, ...b.clinical }),
			);
		}
		const next: ClientRow = {
			...plain,
			...(b.name === undefined ? {} : { name: b.name }),
			...(b.birthYear === undefined ? {} : { birthYear: b.birthYear }),
			...(b.contact === undefined ? {} : { contact: { ...row.contact, ...b.contact } }),
			...(b.guardian === undefined
				? {}
				: { guardian: { ...row.guardian, ...b.guardian } as NonNullable<ClientRow["guardian"]> }),
			...(b.money === undefined ? {} : { money: { ...row.money, ...b.money } }),
			...(sealed === undefined ? {} : { clinicalSealed: sealed }),
			updatedAt: ctx.now,
		};
		await ctx.deps.store.c.clients.replace(next);
		await ctx.changed("client", "updated", row.id);
		ctx.note({
			groups: GROUPS.filter((g) => b[g] !== undefined),
			identity: b.name !== undefined || b.birthYear !== undefined,
		});
		return view(ctx, next);
	},

	async "clients.assign"(ctx) {
		const row = await must(ctx.deps.store.c.clients, ctx.app, String(ctx.params.id), "client");
		const people = await ctx.deps.store.c.people.list(ctx.app);
		for (const p of ctx.body.treating)
			if (!people.some((x) => x.id === p && x.active))
				throw fail("invalid", "unknown person", { person: p });
		const next: ClientRow = {
			...row,
			treating: [...new Set(ctx.body.treating)],
			updatedAt: ctx.now,
		};
		await ctx.deps.store.c.clients.replace(next);
		const change = diff(
			row.treating.map((p) => treatingLink(row.id, p)),
			next.treating.map((p) => treatingLink(row.id, p)),
		);
		await writeTuples(ctx, change.writes, change.deletes);
		await ctx.changed("client", "updated", row.id);
		// Every change of who treats a client is explicit and audited: from, to, and the reason the person gave.
		ctx.note({ from: row.treating, to: next.treating, reason: ctx.body.reason });
		return view(ctx, next);
	},

	async "clients.archive"(ctx) {
		const row = await must(ctx.deps.store.c.clients, ctx.app, String(ctx.params.id), "client");
		if (row.status !== "active")
			throw fail("conflict", "only an active client can be archived", { status: row.status });
		const next: ClientRow = { ...row, status: "archived", archivedAt: ctx.now, updatedAt: ctx.now };
		await ctx.deps.store.c.clients.replace(next);
		await ctx.changed("client", "updated", row.id);
		return view(ctx, next);
	},

	async "clients.restore"(ctx) {
		const row = await must(ctx.deps.store.c.clients, ctx.app, String(ctx.params.id), "client");
		if (row.status === "active")
			throw fail("conflict", "the client is active", { status: row.status });
		const { archivedAt: _a, deletedAt: _d, purgeAt: _p, ...rest } = row;
		const next: ClientRow = { ...rest, status: "active", updatedAt: ctx.now };
		await ctx.deps.store.c.clients.replace(next);
		await ctx.changed("client", "updated", row.id);
		return view(ctx, next);
	},

	async "clients.remove"(ctx) {
		const row = await must(ctx.deps.store.c.clients, ctx.app, String(ctx.params.id), "client");
		if (row.status === "deleted") throw fail("conflict", "already deleted", { status: row.status });
		const purgeAt = ctx.now + PURGE_DAYS * 86_400_000;
		await ctx.deps.store.c.clients.replace({
			...row,
			status: "deleted",
			deletedAt: ctx.now,
			purgeAt,
			updatedAt: ctx.now,
		});
		await ctx.changed("client", "deleted", row.id);
		return { id: row.id, status: "deleted" as const, purgeAt };
	},
};

async function view(
	ctx: Parameters<typeof clientView>[0],
	row: ClientRow,
): Promise<Awaited<ReturnType<typeof clientView>>["client"]> {
	const { client, clinicalRead } = await clientView(ctx, row, await clientGroupReach(ctx));
	if (clinicalRead)
		await ctx.auditNow("clinical.read", { type: "client", id: row.id }, { via: "clients" });
	return client;
}
