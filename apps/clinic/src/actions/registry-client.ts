import { BLACKLIST_CATEGORIES, BLACKLIST_SEVERITIES } from "@psi/scheduling/clinic";
import { recordResourceFor } from "@psi/scheduling/permissions";
import { z } from "zod";
import { m } from "../paraglide/messages.js";
import { IsoDateSchema } from "../port/schema";
import {
	CLEARABLE_FIELDS,
	FileNameSchema,
	type NewFile,
	NoteCategorySchema,
	RecordStatusSchema,
} from "../port/schema-clinical";
import { blankIsNull, define, flag, label, none, orNull } from "./define";
import { recordKeys } from "./keys";
import type { ActionCtx, ActionDef } from "./types";

const id = z.string().min(1).max(100);
const base = (clientId: string): string => `/clients/${clientId}`;

/** May they change or remove this note: their own, or whoever may delete clients' data. */
async function mayTouchNote(
	ctx: ActionCtx,
	clientId: string,
	noteId: string,
	key: "notes_edit" | "notes_delete",
): Promise<boolean | null> {
	const note = (await ctx.port.notes(ctx.app, clientId)).find((n) => n.id === noteId);
	if (note === undefined) return null;
	// The key held for `own` is the notes one wrote; held for `all` it is anyone's.
	return note.authorSubject === ctx.actor.subject
		? ctx.can.write(key)
		: ctx.can.scopes(key).includes("all");
}

export const CLIENT_ACTIONS: ReadonlyArray<ActionDef> = [
	define({
		id: "client.new",
		tier: "daily",
		entity: "client",
		label: label((o) => m.ac_client_new({}, o)),
		icon: "plus",
		placements: { primary: ["clients"], empty: ["clients"], palette: ["global"] },
		mobile: "fab",
		needs: { write: ["clients_create"] },
		route: { method: "POST", path: "/clients" },
		confirm: "none",
		opens: "newClient",
		to: () => "/clients?new=1",
		params: z.object({
			name: z.string().trim().min(1).max(120),
			phone: orNull(40),
			guardian: orNull(120),
		}),
		run: async (ctx, p) => {
			const made = await ctx.port.createClient(ctx.app, p);
			return { status: "ok", to: base(made.id), data: made };
		},
	}),
	define({
		id: "client.edit",
		tier: "daily",
		entity: "client",
		label: label((o) => m.ac_client_edit({}, o)),
		icon: "edit",
		placements: {
			primary: ["client.overview"],
			menu: ["client"],
			empty: ["client.overview"],
			palette: ["client"],
		},
		mobile: "bar",
		needs: { write: ["clients_edit"] },
		route: { method: "POST", path: "/clients/:id/edit" },
		confirm: "none",
		opens: "editClient",
		to: (e) => `${base(e.clientId ?? "")}?edit=1`,
		params: z.object({
			id,
			name: z.string().trim().min(1).max(120),
			// A field the form did not show is not changed; one left empty is emptied.
			phone: blankIsNull(40),
			guardian: blankIsNull(120),
			email: blankIsNull(200),
			note: z.string().max(20_000).optional(),
		}),
		run: async (ctx, { id: clientId, name, phone, guardian, email, note }) => {
			// The clinical note is a clinical field: only who may see it may change it.
			await ctx.port.updateClient(ctx.app, clientId, {
				name,
				...(phone === undefined ? {} : { phone }),
				...(guardian === undefined ? {} : { guardian }),
				...(email === undefined ? {} : { email }),
				...(note === undefined || !ctx.can.group("clinical") ? {} : { note }),
			});
			return { status: "ok", to: base(clientId) };
		},
	}),
	define({
		id: "client.clearContact",
		tier: "daily",
		entity: "client",
		label: label((o) => m.ac_client_clear_contact({}, o)),
		icon: "trash",
		placements: { palette: ["client"] },
		mobile: "sheet",
		needs: { write: ["clients_edit"], group: "contact" },
		route: { method: "POST", path: "/clients/:id/contact/clear" },
		confirm: "confirm",
		opens: "editClient",
		to: (e) => `${base(e.clientId ?? "")}?edit=1`,
		params: z.object({ id, field: z.enum(CLEARABLE_FIELDS) }),
		run: async (ctx, p) => {
			// The service refuses (`conflict`) to leave the client with nothing to book with; the sheet says so.
			await ctx.port.updateClient(ctx.app, p.id, { [p.field]: null });
			return { status: "ok", to: `${base(p.id)}?edit=1&cleared=${p.field}` };
		},
	}),
	define({
		id: "client.archive",
		tier: "daily",
		entity: "client",
		label: label((o) => m.archive_button({}, o)),
		icon: "archive",
		placements: { menu: ["client"], palette: ["client"] },
		mobile: "menu",
		needs: { write: ["clients_archive"] },
		route: { method: "POST", path: "/clients/:id/archive" },
		confirm: "confirm",
		opens: "askArchive",
		when: (_c, e) => e.clientArchived !== true,
		params: z.object({ id }),
		run: async (ctx, p) => {
			await ctx.port.archiveClient(ctx.app, p.id);
			return { status: "ok", to: `${base(p.id)}?done=archived` };
		},
	}),
	define({
		id: "client.delete",
		tier: "daily",
		entity: "client",
		label: label((o) => m.delete_button({}, o)),
		icon: "trash",
		placements: { menu: ["client"] },
		mobile: "menu",
		needs: { write: ["clients_delete"] },
		route: { method: "POST", path: "/clients/:id/delete" },
		confirm: "confirm",
		opens: "askDelete",
		params: z.object({ id }),
		run: async (ctx, p) => {
			await ctx.port.deleteClient(ctx.app, p.id);
			return { status: "ok", to: "/clients?deleted=1" };
		},
	}),
	define({
		id: "note.add",
		tier: "daily",
		entity: "note",
		label: label((o) => m.ac_note_add({}, o)),
		icon: "plus",
		placements: {
			primary: ["client.notes"],
			empty: ["client.notes", "client.overview"],
			palette: ["client"],
		},
		mobile: "bar",
		needs: { write: ["notes_create"] },
		route: { method: "POST", path: "/clients/:id/notes" },
		confirm: "none",
		opens: "newNote",
		to: (e) => `${base(e.clientId ?? "")}/notes?new=1`,
		params: z.object({
			clientId: id,
			body: z.string().trim().min(1).max(4000),
			category: NoteCategorySchema.default("general"),
			pinned: flag,
		}),
		run: async (ctx, p) => {
			if (p.category === "clinical" && !ctx.can.group("clinical"))
				return { status: "refused", code: "forbidden" };
			const made = await ctx.port.addNote(ctx.app, p.clientId, p, ctx.actor);
			return { status: "ok", to: `${base(p.clientId)}/notes`, data: made };
		},
	}),
	define({
		id: "note.edit",
		tier: "daily",
		entity: "note",
		label: label((o) => m.ac_note_edit({}, o)),
		icon: "edit",
		placements: { menu: ["client.notes"] },
		mobile: "menu",
		needs: { write: ["notes_edit"] },
		route: { method: "POST", path: "/clients/:id/notes/:nid" },
		confirm: "none",
		to: (e) => `${base(e.clientId ?? "")}/notes?edit=${encodeURIComponent(e.id ?? "")}`,
		when: (ctx, e) => e.own === true || ctx.can.scopes("notes_edit").includes("all"),
		params: z.object({
			clientId: id,
			id,
			body: z.string().trim().min(1).max(4000),
			category: NoteCategorySchema,
		}),
		run: async (ctx, p) => {
			const may = await mayTouchNote(ctx, p.clientId, p.id, "notes_edit");
			if (may === null) return { status: "refused", code: "not-found" };
			if (!may || (p.category === "clinical" && !ctx.can.group("clinical")))
				return { status: "refused", code: "forbidden" };
			await ctx.port.updateNote(ctx.app, p.id, { body: p.body, category: p.category });
			return { status: "ok", to: `${base(p.clientId)}/notes` };
		},
	}),
	define({
		id: "note.pin",
		tier: "daily",
		entity: "note",
		label: label((o) => m.ac_note_pin({}, o)),
		icon: "check",
		placements: { screen: ["client.notes", "client.overview"] },
		mobile: "list",
		needs: { write: ["notes_pin"] },
		route: { method: "POST", path: "/clients/:id/notes/:nid/pin" },
		confirm: "none",
		params: z.object({ clientId: id, id, pinned: flag }),
		run: async (ctx, p) => {
			await ctx.port.updateNote(ctx.app, p.id, { pinned: p.pinned });
			return { status: "ok", to: `${base(p.clientId)}/notes` };
		},
	}),
	define({
		id: "note.delete",
		tier: "daily",
		entity: "note",
		label: label((o) => m.ac_note_delete({}, o)),
		icon: "trash",
		placements: { menu: ["client.notes"] },
		mobile: "menu",
		needs: { write: ["notes_delete"] },
		route: { method: "POST", path: "/clients/:id/notes/:nid/delete" },
		confirm: "confirm",
		to: (e) =>
			`${base(e.clientId ?? "")}/notes?confirm=note.delete&id=${encodeURIComponent(e.id ?? "")}`,
		when: (ctx, e) => e.own === true || ctx.can.scopes("notes_delete").includes("all"),
		params: z.object({ clientId: id, id }),
		run: async (ctx, p) => {
			const may = await mayTouchNote(ctx, p.clientId, p.id, "notes_delete");
			if (may === null) return { status: "refused", code: "not-found" };
			if (!may) return { status: "refused", code: "forbidden" };
			await ctx.port.deleteNote(ctx.app, p.id);
			return { status: "ok", to: `${base(p.clientId)}/notes` };
		},
	}),
	define({
		id: "blacklist.add",
		tier: "daily",
		entity: "blacklist",
		label: label((o) => m.ac_blacklist_add({}, o)),
		icon: "alert",
		placements: { menu: ["client"], palette: ["client"] },
		mobile: "menu",
		needs: { write: ["blacklist_create", "blacklist_create_warn"] },
		route: { method: "POST", path: "/clients/:id/blacklist" },
		confirm: "none",
		opens: "askBlacklist",
		when: (_c, e) => e.blacklistId === null || e.blacklistId === undefined,
		params: z.object({
			clientId: id,
			reason: z.string().trim().min(1).max(2000),
			category: z.enum(BLACKLIST_CATEGORIES),
			severity: z.enum(BLACKLIST_SEVERITIES),
			expiresOn: z
				.string()
				.optional()
				.transform((v) => (v === undefined || v === "" ? null : v))
				.pipe(IsoDateSchema.nullable()),
		}),
		run: async (ctx, p) => {
			// `create_warn` alone reaches only a warning.
			if (p.severity !== "warn" && !ctx.can.write("blacklist_create"))
				return { status: "refused", code: "forbidden" };
			await ctx.port.addBlacklist(ctx.app, p.clientId, p, ctx.actor);
			return { status: "ok", to: base(p.clientId) };
		},
	}),
	define({
		id: "blacklist.end",
		tier: "daily",
		entity: "blacklist",
		label: label((o) => m.ac_blacklist_end({}, o)),
		icon: "check",
		placements: { menu: ["client"], screen: ["client.overview"], palette: ["client"] },
		mobile: "menu",
		needs: { write: ["blacklist_edit"] },
		route: { method: "POST", path: "/clients/:id/blacklist/:bid/end" },
		confirm: "reason",
		opens: "askUnlist",
		when: (_c, e) => typeof e.blacklistId === "string",
		params: z.object({ clientId: id, id, reason: z.string().trim().min(1).max(500) }),
		run: async (ctx, p) => {
			await ctx.port.endBlacklist(ctx.app, p.id, p.reason, ctx.actor);
			return { status: "ok", to: base(p.clientId) };
		},
	}),
	define({
		id: "record.new",
		tier: "daily",
		entity: "record",
		label: label((o) => m.ac_record_new({}, o)),
		icon: "plus",
		placements: {
			primary: ["client.records"],
			empty: ["client.records", "client.overview"],
			palette: ["client"],
		},
		mobile: "bar",
		needs: { write: recordKeys("create") },
		route: { method: "GET", path: "/clients/:id/records/new" },
		confirm: "none",
		to: (e) => `${base(e.clientId ?? "")}/records/new`,
		params: none,
	}),
	define({
		id: "record.save",
		tier: "daily",
		entity: "record",
		label: label((o) => m.ac_record_save({}, o)),
		icon: "check",
		placements: { screen: ["client.records"] },
		mobile: "bar",
		needs: { write: [...recordKeys("create"), ...recordKeys("edit")] },
		route: { method: "POST", path: "/clients/:id/records" },
		confirm: "none",
		params: z.object({
			clientId: id,
			id: id.optional(),
			formKey: z.string().min(1).max(60),
			appointmentId: orNull(100),
			status: RecordStatusSchema,
			data: z.record(z.unknown()),
		}),
		run: async (ctx, p) => {
			// The permission that governs this form's records, not any of them.
			const resource = recordResourceFor(p.formKey);
			if (!ctx.can.write(`${resource}_${p.id === undefined ? "create" : "edit"}`))
				return { status: "refused", code: "forbidden" };
			const record =
				p.id === undefined
					? await ctx.port.createRecord(ctx.app, p.clientId, p, ctx.actor)
					: await ctx.port.updateRecord(ctx.app, p.id, {
							status: p.status,
							data: p.data,
							appointmentId: p.appointmentId,
						});
			return { status: "ok", to: `${base(p.clientId)}/records`, data: record };
		},
	}),
	define({
		id: "record.delete",
		tier: "daily",
		entity: "record",
		label: label((o) => m.ac_record_delete({}, o)),
		icon: "trash",
		placements: { menu: ["client.records"] },
		mobile: "menu",
		needs: { write: recordKeys("delete") },
		route: { method: "POST", path: "/clients/:id/records/:rid/delete" },
		confirm: "confirm",
		to: (e) =>
			`${base(e.clientId ?? "")}/records?confirm=record.delete&id=${encodeURIComponent(e.id ?? "")}`,
		params: z.object({ clientId: id, id }),
		run: async (ctx, p) => {
			const found = await ctx.port.record(ctx.app, p.id);
			if (found === null || found.clientId !== p.clientId)
				return { status: "refused", code: "not-found" };
			if (!ctx.can.write(`${recordResourceFor(found.formKey)}_delete`))
				return { status: "refused", code: "forbidden" };
			await ctx.port.deleteRecord(ctx.app, p.id);
			return { status: "ok", to: `${base(p.clientId)}/records` };
		},
	}),
	define({
		id: "file.upload",
		tier: "daily",
		entity: "file",
		label: label((o) => m.ac_file_upload({}, o)),
		icon: "plus",
		placements: {
			primary: ["client.files"],
			empty: ["client.files", "client.overview"],
			palette: ["client"],
		},
		mobile: "bar",
		needs: { write: ["files_upload"] },
		route: { method: "POST", path: "/clients/:id/files" },
		confirm: "none",
		opens: "newFile",
		to: (e) => `${base(e.clientId ?? "")}/files?new=1`,
		params: z.object({
			clientId: id,
			files: z.custom<ReadonlyArray<NewFile>>((v) => Array.isArray(v) && v.length > 0),
		}),
		run: async (ctx, p) => {
			for (const f of p.files) await ctx.port.uploadFile(ctx.app, p.clientId, f, ctx.actor);
			return { status: "ok", to: `${base(p.clientId)}/files`, data: p.files.length };
		},
	}),
	define({
		id: "file.download",
		tier: "daily",
		entity: "file",
		label: label((o) => m.ac_file_download({}, o)),
		icon: "download",
		placements: { menu: ["client.files"] },
		mobile: "list",
		needs: { read: ["files_view"] },
		route: { method: "GET", path: "/clients/:id/files/:fid/download" },
		confirm: "none",
		to: (e) => `${base(e.clientId ?? "")}/files/${encodeURIComponent(e.id ?? "")}/download`,
		params: none,
	}),
	define({
		id: "file.rename",
		tier: "daily",
		entity: "file",
		label: label((o) => m.ac_file_rename({}, o)),
		icon: "edit",
		placements: { menu: ["client.files"] },
		mobile: "menu",
		needs: { write: ["files_upload"] },
		route: { method: "POST", path: "/clients/:id/files/:fid/rename" },
		confirm: "none",
		to: (e) => `${base(e.clientId ?? "")}/files?rename=${encodeURIComponent(e.id ?? "")}`,
		params: z.object({ clientId: id, id, name: FileNameSchema }),
		run: async (ctx, p) => {
			await ctx.port.renameFile(ctx.app, p.id, p.name);
			return { status: "ok", to: `${base(p.clientId)}/files` };
		},
	}),
	define({
		id: "file.delete",
		tier: "daily",
		entity: "file",
		label: label((o) => m.ac_file_delete({}, o)),
		icon: "trash",
		placements: { menu: ["client.files"] },
		mobile: "menu",
		needs: { write: ["files_delete"] },
		route: { method: "POST", path: "/clients/:id/files/:fid/delete" },
		confirm: "confirm",
		to: (e) =>
			`${base(e.clientId ?? "")}/files?confirm=file.delete&id=${encodeURIComponent(e.id ?? "")}`,
		params: z.object({ clientId: id, id }),
		run: async (ctx, p) => {
			await ctx.port.deleteFile(ctx.app, p.id);
			return { status: "ok", to: `${base(p.clientId)}/files` };
		},
	}),
];
