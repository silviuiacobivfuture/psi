import { z } from "zod/v4";
import { route } from "../define";
import { ClientNote, NoteCreate, NotePatch, NotePin } from "../entities-notes";
import { AppParam, Id, IdList, IdParam, Ok, PageQuery, page } from "../primitives";

/**
 * Notes about a client. Every key is held at `all` (anyone's notes) or `own` (the notes the person wrote), so no route
 * is checked against an object: the handler reads which of the two the caller holds. Creating and pinning take either.
 * The clinical category is the `clinical` group of each key.
 */
export const NOTE_ROUTES = [
	route({
		id: "notes.list",
		method: "GET",
		path: "/v1/apps/:app/clients/:id/notes",
		side: "team",
		summary:
			"A client's notes, pinned first and then newest; the clinical ones only for a caller who holds the clinical group",
		params: IdParam,
		query: PageQuery,
		response: page(ClientNote),
		permission: {
			key: "notes_view",
			target: { kind: "dynamic", type: "sched_role", candidates: ["notes_view"] },
		},
	}),
	route({
		id: "notes.pinned",
		method: "GET",
		path: "/v1/apps/:app/notes/pinned",
		side: "team",
		summary:
			"The pinned notes of many clients in one call (a list's flags), each only as the caller may read it",
		params: AppParam,
		query: z.object({ clients: IdList }),
		response: z.object({
			items: z.array(z.object({ clientId: Id, notes: z.array(ClientNote) })),
		}),
		permission: {
			key: "notes_view",
			target: { kind: "dynamic", type: "sched_role", candidates: ["notes_view"] },
		},
	}),
	route({
		id: "notes.create",
		method: "POST",
		path: "/v1/apps/:app/clients/:id/notes",
		side: "team",
		summary:
			"Write a note about a client (a clinical note needs the clinical group; it is stored sealed)",
		params: IdParam,
		body: NoteCreate,
		response: ClientNote,
		permission: {
			key: "notes_create",
			target: { kind: "dynamic", type: "sched_role", candidates: ["notes_create"] },
		},
		audit: "note.create",
	}),
	route({
		id: "notes.update",
		method: "PATCH",
		path: "/v1/apps/:app/notes/:id",
		side: "team",
		summary:
			"Change a note's text or category; only one's own notes unless the key is held for all",
		params: IdParam,
		body: NotePatch,
		response: ClientNote,
		permission: {
			key: "notes_edit",
			target: { kind: "dynamic", type: "sched_role", candidates: ["notes_edit"] },
		},
		audit: "note.update",
	}),
	route({
		id: "notes.pin",
		method: "POST",
		path: "/v1/apps/:app/notes/:id/pin",
		side: "team",
		summary:
			"Pin a note to the top of the client's summary, or let it go; only one's own unless the key is held for all",
		params: IdParam,
		body: NotePin,
		response: ClientNote,
		permission: {
			key: "notes_pin",
			target: { kind: "dynamic", type: "sched_role", candidates: ["notes_pin"] },
		},
		audit: "note.update",
	}),
	route({
		id: "notes.remove",
		method: "DELETE",
		path: "/v1/apps/:app/notes/:id",
		side: "team",
		summary: "Delete a note for good; only one's own unless the key is held for all",
		params: IdParam,
		response: Ok,
		permission: {
			key: "notes_delete",
			target: { kind: "dynamic", type: "sched_role", candidates: ["notes_delete"] },
		},
		audit: "note.delete",
	}),
] as const;
