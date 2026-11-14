import type { CLEARABLE_CLIENT, FieldGroupName } from "@psi/scheduling-sdk/contract";
import { NONE, reaches } from "../authz/access";
import { appLink, treatingLink } from "../authz/links";
import type { HandlersOf } from "../http/context";
import { fail, forbidden } from "../http/errors";
import type { ClientRow } from "../store/types";
import { clientGroupReach, clientView, clinicalContext } from "./fields";
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
			items: page.items.map((row) => clientView(ctx, row, reach, include).client),
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
			// The envelope is bound to the client's id, which the store assigns on insert: sealed in a second step.
			const clinicalSealed = ctx.deps.crypto.seal(
				JSON.stringify(b.clinical),
				clinicalContext(ctx.app, saved.id),
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
		const clear = b.clear ?? [];
		const touched = (g: (typeof GROUPS)[number]): boolean =>
			b[g] !== undefined || clear.some((f) => CLEAR_GROUP[f] === g);
		for (const g of GROUPS)
			if (touched(g) && !(await ctx.canOn(`clients_edit_${g}`, "sched_client", row.id)))
				throw forbidden("not allowed to write this field group", { group: g });
		const both = clear.filter((f) =>
			f === "guardian" ? b.guardian !== undefined : b.contact?.[f] !== undefined,
		);
		if (both.length > 0)
			throw fail("invalid", "a field is either given or cleared", { fields: both });
		const { clinicalSealed, ...plain } = row;
		let sealed = clinicalSealed;
		if (b.clinical !== undefined) {
			const held =
				clinicalSealed === undefined
					? {}
					: JSON.parse(ctx.deps.crypto.open(clinicalSealed, clinicalContext(ctx.app, row.id)));
			sealed = ctx.deps.crypto.seal(
				JSON.stringify({ ...held, ...b.clinical }),
				clinicalContext(ctx.app, row.id),
			);
		}
		const { contact: _contact, guardian: _guardian, ...rest } = plain;
		const contact = contactAfter(row.contact, b.contact, clear);
		const guardian = clear.includes("guardian")
			? undefined
			: b.guardian === undefined
				? row.guardian
				: ({ ...row.guardian, ...b.guardian } as NonNullable<ClientRow["guardian"]>);
		const cleared = clear.filter((f) =>
			f === "guardian" ? row.guardian !== undefined : row.contact?.[f] !== undefined,
		);
		const next: ClientRow = {
			...rest,
			...(contact === undefined ? {} : { contact }),
			...(guardian === undefined ? {} : { guardian }),
			...(b.name === undefined ? {} : { name: b.name }),
			...(b.birthYear === undefined ? {} : { birthYear: b.birthYear }),
			...(b.money === undefined ? {} : { money: { ...row.money, ...b.money } }),
			...(sealed === undefined ? {} : { clinicalSealed: sealed }),
			updatedAt: ctx.now,
		};
		if (cleared.length > 0 && !reachable(next))
			throw fail("conflict", "the client would keep no phone or e-mail to book with", {
				reason: "contact_required",
			});
		const only = Object.keys(b).every((k) => k === "clear");
		if (only && cleared.length === 0) {
			// Emptying what is already empty: nothing to write, nothing to record.
			ctx.unchanged();
			return view(ctx, row);
		}
		await ctx.deps.store.c.clients.replace(next);
		await ctx.changed("client", "updated", row.id);
		ctx.note({
			groups: GROUPS.filter(touched),
			identity: b.name !== undefined || b.birthYear !== undefined,
			...(cleared.length === 0 ? {} : { cleared }),
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

type Contact = NonNullable<ClientRow["contact"]>;
type Clearable = (typeof CLEARABLE_CLIENT)[number];

/** The field group whose edit permission emptying a field needs. */
const CLEAR_GROUP: Readonly<Record<Clearable, (typeof GROUPS)[number]>> = {
	phone: "contact",
	email: "contact",
	guardian: "guardian",
};

/** The contact after a change: what is given merged over what is held, the cleared fields taken away; none when empty. */
function contactAfter(
	held: Contact | undefined,
	given: Contact | undefined,
	clear: readonly Clearable[],
): Contact | undefined {
	const merged: Contact = { ...held, ...given };
	const kept: Contact = {
		...(merged.phone === undefined || clear.includes("phone") ? {} : { phone: merged.phone }),
		...(merged.email === undefined || clear.includes("email") ? {} : { email: merged.email }),
		...(merged.address === undefined ? {} : { address: merged.address }),
	};
	return Object.keys(kept).length === 0 ? undefined : kept;
}

/** What booking needs to reach a client: their own phone or e-mail, or their guardian's. */
const reachable = (row: ClientRow): boolean =>
	row.contact?.phone !== undefined ||
	row.contact?.email !== undefined ||
	row.guardian?.phone !== undefined ||
	row.guardian?.email !== undefined;

async function view(
	ctx: Parameters<typeof clientView>[0],
	row: ClientRow,
): Promise<ReturnType<typeof clientView>["client"]> {
	const { client, clinicalRead } = clientView(ctx, row, await clientGroupReach(ctx));
	if (clinicalRead)
		await ctx.auditNow("clinical.read", { type: "client", id: row.id }, { via: "clients" });
	return client;
}
