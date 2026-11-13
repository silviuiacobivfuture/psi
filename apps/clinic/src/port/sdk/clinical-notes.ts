import { SEED_FORM_TEMPLATES, validateResponse } from "@psi/scheduling/clinic";
import { SchedulingApiError } from "@psi/scheduling-sdk";
import type {
	ClientNote as ApiNoteSchema,
	RecordFull as ApiRecordSchema,
} from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import { PortError } from "../port";
import type { AppSlug, Client } from "../schema";
import type {
	Actor,
	ClientNote,
	ClientPatch,
	ClientRecord,
	NewNote,
	NewRecord,
	NoteCategory,
	NotePatch,
	RecordPatch,
} from "../schema-clinical";
import type { SdkContext } from "./context";
import { clientOf, drain } from "./map";
import { wallOf } from "./time";

type ApiNote = z.output<typeof ApiNoteSchema>;
type ApiRecord = z.output<typeof ApiRecordSchema>;
type ApiCategory = ApiNote["category"];

/** The console's words for a note's category and the service's. */
const TO_API: Readonly<Record<NoteCategory, ApiCategory>> = {
	general: "general",
	administrative: "administrativ",
	payment: "plata",
	behaviour: "comportament",
	clinical: "clinic",
};
const FROM_API: Readonly<Record<ApiCategory, NoteCategory>> = {
	general: "general",
	administrativ: "administrative",
	plata: "payment",
	comportament: "behaviour",
	clinic: "clinical",
};

/** A record's draft/final state is the console's; the service keeps the answers only, so it rides in them under this key. */
const STATUS_KEY = "$status";
/** Fetching the pinned notes of a list is one read per client: this many at a time. */
const PARALLEL = 8;

const stamp = (ms: number, tz: string): string => {
	const w = wallOf(ms, tz);
	const hh = String(Math.floor(w.minutes / 60)).padStart(2, "0");
	const mm = String(w.minutes % 60).padStart(2, "0");
	return `${w.date}T${hh}:${mm}:00`;
};

/**
 * The client page's notes, records and edits over the service: notes (list, write, change, pin, delete), the records of
 * the forms, and a client's own fields. A person's name is the team's display name for the subject, or the subject when
 * the caller may not read the team.
 */
export function clinicalNotesGroup(sdk: SdkContext) {
	const { api, run } = sdk;

	async function names(app: AppSlug): Promise<Map<string, string>> {
		try {
			const team = await drain((cursor) =>
				api.members.list({ app, limit: 500, ...(cursor === undefined ? {} : { cursor }) }),
			);
			return new Map(team.map((m) => [m.subject, m.displayName]));
		} catch (error) {
			if (error instanceof SchedulingApiError && error.code === "forbidden") return new Map();
			throw error;
		}
	}

	const noteOf = (n: ApiNote, tz: string, who: Map<string, string>): ClientNote => ({
		id: n.id,
		clientId: n.clientId,
		body: n.text,
		category: FROM_API[n.category],
		pinned: n.pinned,
		authorSubject: n.authorSubject,
		authorName: who.get(n.authorSubject) ?? n.authorSubject,
		createdAt: stamp(n.createdAt, tz),
		// The service stamps a change of the text, the category or the pin alike.
		editedAt: n.updatedAt > n.createdAt ? stamp(n.updatedAt, tz) : null,
	});

	/** Pinned first, newest pin first: the order the service answers in. A person who may read no notes has none. */
	async function pinned(app: AppSlug, clientId: string): Promise<ApiNote[]> {
		try {
			return (await api.notes.list({ app, id: clientId })).items.filter((n) => n.pinned);
		} catch (error) {
			if (
				error instanceof SchedulingApiError &&
				(error.code === "forbidden" || error.code === "not_found")
			)
				return [];
			throw error;
		}
	}

	async function eachClient<T>(
		ids: ReadonlyArray<string>,
		read: (id: string) => Promise<T>,
	): Promise<T[]> {
		const out: T[] = [];
		for (let at = 0; at < ids.length; at += PARALLEL)
			out.push(...(await Promise.all(ids.slice(at, at + PARALLEL).map(read))));
		return out;
	}

	const template = (key: string) => SEED_FORM_TEMPLATES.find((t) => t.key === key);

	/** The form must exist in the service's builder before a record can be written against it. */
	async function ensureForm(app: AppSlug, key: string): Promise<void> {
		const def = template(key);
		if (def === undefined) throw new PortError("invalid", `unknown form ${key}`);
		const held = await api.builder.list({ app, kind: "forms" });
		if (held.items.some((f) => f.id === key)) return;
		await api.builder.put({
			app,
			kind: "forms",
			id: key,
			name: def.title,
			body: {
				kind: def.kind === "report" ? "session_report" : "questionnaire",
				fields: def.fields.map((f) => f.key),
			},
		});
	}

	function recordOf(r: ApiRecord, tz: string, who: Map<string, string>): ClientRecord {
		const { [STATUS_KEY]: status, ...data } = r.data ?? {};
		return {
			id: r.id,
			clientId: r.clientId,
			formKey: r.formId,
			formVersion: r.formVersion,
			appointmentId: r.appointmentId ?? null,
			status: status === "draft" ? "draft" : "final",
			authorName: who.get(r.authorSubject) ?? r.authorSubject,
			createdAt: stamp(r.createdAt, tz),
			updatedAt: stamp(r.updatedAt, tz),
			data,
		};
	}

	/** A final record must satisfy its form (the engine's own check); a draft may be incomplete but not wrong. */
	function checked(formKey: string, data: Record<string, unknown>, final: boolean): void {
		const def = template(formKey);
		if (def === undefined) return;
		const res = validateResponse(def, data);
		if (!res.ok && res.problems.some((p) => final || p.code !== "required"))
			throw new PortError("invalid", res.problems.map((p) => `${p.field}:${p.code}`).join(","));
	}

	return {
		pinnedCounts: (app: AppSlug, ids: ReadonlyArray<string>): Promise<Map<string, number>> =>
			run(async () => {
				const counts = await eachClient(
					ids,
					async (id) => [id, (await pinned(app, id)).length] as const,
				);
				return new Map(counts);
			}),
		pinnedFlags: (
			app: AppSlug,
			ids: ReadonlyArray<string>,
		): Promise<Map<string, { body: string; category: NoteCategory }>> =>
			run(async () => {
				const found = await eachClient(
					ids,
					async (id) => [id, (await pinned(app, id))[0]] as const,
				);
				return new Map(
					found.flatMap(([id, n]) =>
						n === undefined
							? []
							: [[id, { body: n.text, category: FROM_API[n.category] }] as const],
					),
				);
			}),

		notes: (app: AppSlug, clientId: string): Promise<ClientNote[]> =>
			run(async () => {
				const [tz, who, list] = await Promise.all([
					sdk.zone(app),
					names(app),
					api.notes.list({ app, id: clientId }),
				]);
				return list.items.map((n) => noteOf(n, tz, who));
			}),
		addNote: (app: AppSlug, clientId: string, input: NewNote, by: Actor): Promise<ClientNote> =>
			run(async () => {
				const tz = await sdk.zone(app);
				const made = await api.notes.create({
					app,
					id: clientId,
					category: TO_API[input.category ?? "general"],
					text: input.body,
					pinned: input.pinned ?? false,
				});
				return noteOf(made, tz, new Map([[by.subject, by.name]]));
			}),
		updateNote: (app: AppSlug, noteId: string, patch: NotePatch): Promise<ClientNote> =>
			run(async () => {
				const [tz, who] = await Promise.all([sdk.zone(app), names(app)]);
				let latest: ApiNote | undefined;
				if (patch.body !== undefined || patch.category !== undefined)
					latest = await api.notes.update({
						app,
						id: noteId,
						...(patch.body === undefined ? {} : { text: patch.body }),
						...(patch.category === undefined ? {} : { category: TO_API[patch.category] }),
					});
				if (patch.pinned !== undefined)
					latest = await api.notes.pin({ app, id: noteId, pinned: patch.pinned });
				if (latest === undefined) throw new PortError("invalid", "nothing to change");
				return noteOf(latest, tz, who);
			}),
		deleteNote: (app: AppSlug, noteId: string): Promise<void> =>
			run(async () => {
				await api.notes.remove({ app, id: noteId });
			}),

		records: (app: AppSlug, clientId: string): Promise<ClientRecord[]> =>
			run(async () => {
				const [tz, who, list] = await Promise.all([
					sdk.zone(app),
					names(app),
					api.records.list({ app, id: clientId }),
				]);
				return list.items.map((r) => recordOf(r, tz, who));
			}),
		record: (app: AppSlug, id: string): Promise<ClientRecord | null> =>
			run(async () => {
				const [tz, who] = await Promise.all([sdk.zone(app), names(app)]);
				try {
					return recordOf(await api.records.get({ app, id }), tz, who);
				} catch (error) {
					if (error instanceof SchedulingApiError && error.code === "not_found") return null;
					throw error;
				}
			}),
		createRecord: (
			app: AppSlug,
			clientId: string,
			input: NewRecord,
			by: Actor,
		): Promise<ClientRecord> =>
			run(async () => {
				const status = input.status ?? "draft";
				checked(input.formKey, input.data, status === "final");
				await ensureForm(app, input.formKey);
				const tz = await sdk.zone(app);
				const made = await api.records.create({
					app,
					id: clientId,
					formId: input.formKey,
					...(input.appointmentId == null ? {} : { appointmentId: input.appointmentId }),
					data: { ...input.data, [STATUS_KEY]: status },
				});
				// The create answers a summary (no content): the record is read back as the person will see it.
				const full = await api.records.get({ app, id: made.id });
				return recordOf(full, tz, new Map([[by.subject, by.name]]));
			}),
		updateRecord: (app: AppSlug, id: string, patch: RecordPatch): Promise<ClientRecord> =>
			run(async () => {
				const [tz, who] = await Promise.all([sdk.zone(app), names(app)]);
				const held = recordOf(await api.records.get({ app, id }), tz, who);
				if (patch.appointmentId !== undefined && patch.appointmentId !== held.appointmentId)
					throw new PortError("invalid", "a record is not moved to another appointment");
				const status = patch.status ?? held.status;
				const data = patch.data ?? held.data;
				checked(held.formKey, data, status === "final");
				await api.records.update({ app, id, data: { ...data, [STATUS_KEY]: status } });
				return recordOf(await api.records.get({ app, id }), tz, who);
			}),
		deleteRecord: (app: AppSlug, id: string): Promise<void> =>
			run(async () => {
				await api.records.remove({ app, id });
			}),

		updateClient: (app: AppSlug, id: string, patch: ClientPatch): Promise<Client> =>
			run(async () => {
				// The service merges what it is given and cannot take a contact away: clearing one is not a change it knows.
				if (patch.phone === null || patch.email === null || patch.guardian === null)
					throw new PortError("not-available-yet", "clearing a contact");
				const contact = {
					...(patch.phone === undefined ? {} : { phone: patch.phone }),
					...(patch.email === undefined ? {} : { email: patch.email }),
				};
				return clientOf(
					await api.clients.update({
						app,
						id,
						...(patch.name === undefined ? {} : { name: patch.name }),
						...(Object.keys(contact).length === 0 ? {} : { contact }),
						...(patch.guardian === undefined ? {} : { guardian: { name: patch.guardian } }),
						...(patch.note === undefined ? {} : { clinical: { notes: patch.note } }),
					}),
				);
			}),
	};
}
