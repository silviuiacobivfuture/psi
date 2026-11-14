import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { reaches } from "../authz/access";
import type { Ctx, HandlersOf } from "../http/context";
import { fail, forbidden, notFound } from "../http/errors";
import type { NoteRow } from "../store/types";
import { must, newId, paginate, stamps } from "./shared";

type C = Ctx<RouteSpec>;
/** What a key is held for: anyone's notes (`all`), or only the ones the person wrote (`own`). */
interface Held {
	all: boolean;
	own: boolean;
}

/** A note's sealed text is bound to its client, so a copy of it under another client opens to nothing. */
const noteContext = (app: string, clientId: string): string => `${app}:client:${clientId}:note`;
const clinical = (n: Pick<NoteRow, "category">): boolean => n.category === "clinic";

async function held(ctx: C, key: string): Promise<Held> {
	const scopes = await ctx.scopesOf(key);
	return { all: scopes.includes("all"), own: scopes.includes("own") };
}

/** Whether the caller holds a key for this note: anyone's with `all`, one's own with `own`. */
const may = (ctx: C, h: Held, note: Pick<NoteRow, "authorSubject">): boolean =>
	h.all || (h.own && note.authorSubject === ctx.subject);

/** A note a caller may act on with `action`: the key, and for a clinical note the key's clinical group as well. */
async function allowed(ctx: C, action: string, note: NoteRow): Promise<boolean> {
	if (!may(ctx, await held(ctx, `notes_${action}`), note)) return false;
	return !clinical(note) || may(ctx, await held(ctx, `notes_${action}_clinical`), note);
}

async function seen(ctx: C, note: NoteRow): Promise<boolean> {
	return allowed(ctx, "view", note);
}

/** The note as the caller reads it: a clinical text is opened here, and only here. */
function out(ctx: C, n: NoteRow) {
	const text =
		n.sealed === undefined
			? (n.text ?? "")
			: ctx.deps.crypto.open(n.sealed, noteContext(n.app, n.clientId));
	return {
		id: n.id,
		clientId: n.clientId,
		category: n.category,
		text,
		pinned: n.pinned,
		authorSubject: n.authorSubject,
		createdAt: n.createdAt,
		updatedAt: n.updatedAt,
	};
}

/** Pinned first (the latest change first), then newest. */
const order = (a: NoteRow, b: NoteRow): number =>
	Number(b.pinned) - Number(a.pinned) ||
	(a.pinned ? b.updatedAt - a.updatedAt : b.createdAt - a.createdAt);

/**
 * The notes of a client the caller may read, each as they read it. Reading a clinical note is audited (once, with how
 * many were opened), whether it is a list or the client's summary. A caller who may not see the client gets none.
 */
export async function readableNotes(
	ctx: C,
	clientId: string,
	onlyPinned = false,
	/** Whether the caller may see the client, when the caller already asked (a batch asks once for all). */
	seesClient?: boolean,
) {
	const sees = seesClient ?? (await ctx.canOn("clients_view", "sched_client", clientId));
	if (!sees) return [];
	const rows = (await ctx.deps.store.c.notes.list(ctx.app, { eq: { clientId } }))
		.filter((n) => !onlyPinned || n.pinned)
		.sort(order);
	const shown: NoteRow[] = [];
	for (const n of rows) if (await seen(ctx, n)) shown.push(n);
	const opened = shown.filter(clinical).length;
	if (opened > 0)
		await ctx.auditNow(
			"clinical.read",
			{ type: "client", id: clientId },
			{ via: "notes", count: opened },
		);
	return shown.map((n) => out(ctx, n));
}

/** The note, if it exists and the caller may read it: what they may not read is not there for them. */
async function reached(ctx: C): Promise<NoteRow> {
	const note = await must(ctx.deps.store.c.notes, ctx.app, String(ctx.params.id), "note");
	if (!(await ctx.canOn("clients_view", "sched_client", note.clientId)) || !(await seen(ctx, note)))
		throw notFound("note");
	return note;
}

function refuseUnlessAllowed(ok: boolean, action: string): void {
	if (!ok)
		throw forbidden("only a person's own notes, unless the key is held for all", {
			permission: `notes_${action}`,
		});
}

export const noteHandlers: HandlersOf<
	"notes.list" | "notes.pinned" | "notes.create" | "notes.update" | "notes.pin" | "notes.remove"
> = {
	async "notes.list"(ctx) {
		const client = await must(ctx.deps.store.c.clients, ctx.app, String(ctx.params.id), "client");
		const h = await held(ctx, "notes_view");
		if (!h.all && !h.own) throw notFound("object");
		return paginate(await readableNotes(ctx, client.id), ctx.query.limit, ctx.query.cursor);
	},

	async "notes.pinned"(ctx) {
		const h = await held(ctx, "notes_view");
		if (!h.all && !h.own) throw notFound("object");
		// Each client as `notes.list` would answer it, pinned only: one the caller may not see has none. Who the caller
		// may see is asked ONCE for the batch (one ListObjects), never once per client.
		const visible = await ctx.reachOf("clients_view", "sched_client");
		const items = await Promise.all(
			ctx.query.clients.map(async (clientId) => ({
				clientId,
				notes:
					reaches(visible, clientId) &&
					(await ctx.deps.store.c.clients.get(ctx.app, clientId)) !== undefined
						? await readableNotes(ctx, clientId, true, true)
						: [],
			})),
		);
		return { items };
	},

	async "notes.create"(ctx) {
		const client = await must(ctx.deps.store.c.clients, ctx.app, String(ctx.params.id), "client");
		const h = await held(ctx, "notes_create");
		if (!h.all && !h.own) throw notFound("object");
		if (!(await ctx.canOn("clients_view", "sched_client", client.id))) throw notFound("client");
		const { category, text, pinned } = ctx.body;
		if (category === "clinic") {
			const c = await held(ctx, "notes_create_clinical");
			if (!c.all && !c.own)
				throw forbidden("not allowed to write this field group", { group: "clinical" });
		}
		const base = {
			id: newId("n"),
			app: ctx.app,
			clientId: client.id,
			category,
			pinned,
			authorSubject: ctx.subject,
			...stamps(ctx.now),
		};
		// A note may be pinned by whoever may pin their own.
		if (pinned) {
			const p = await held(ctx, "notes_pin");
			if (!p.all && !p.own) throw forbidden("not allowed to pin", { permission: "notes_pin" });
		}
		const row = await ctx.deps.store.c.notes.insert(
			category === "clinic"
				? { ...base, sealed: ctx.deps.crypto.seal(text, noteContext(ctx.app, client.id)) }
				: { ...base, text },
		);
		ctx.note({ category, pinned });
		return out(ctx, row);
	},

	async "notes.update"(ctx) {
		const note = await reached(ctx);
		refuseUnlessAllowed(await allowed(ctx, "edit", note), "edit");
		const { text, category } = ctx.body;
		if (category !== undefined && (category === "clinic") !== clinical(note))
			throw fail("invalid", "a note stays on its side of the clinical line", { field: "category" });
		const { sealed: _s, text: _t, ...rest } = note;
		const next: NoteRow = {
			...rest,
			category: category ?? note.category,
			...(clinical(note)
				? {
						sealed:
							text === undefined
								? (note.sealed ?? "")
								: ctx.deps.crypto.seal(text, noteContext(ctx.app, note.clientId)),
					}
				: { text: text ?? note.text ?? "" }),
			updatedAt: ctx.now,
		};
		await ctx.deps.store.c.notes.replace(next);
		ctx.note({ changed: Object.keys(ctx.body) });
		return out(ctx, next);
	},

	async "notes.pin"(ctx) {
		const note = await reached(ctx);
		refuseUnlessAllowed(await allowed(ctx, "pin", note), "pin");
		const next: NoteRow = { ...note, pinned: ctx.body.pinned, updatedAt: ctx.now };
		await ctx.deps.store.c.notes.replace(next);
		return out(ctx, next);
	},

	async "notes.remove"(ctx) {
		const note = await reached(ctx);
		refuseUnlessAllowed(await allowed(ctx, "delete", note), "delete");
		await ctx.deps.store.c.notes.remove(ctx.app, note.id);
		return { ok: true as const };
	},
};
