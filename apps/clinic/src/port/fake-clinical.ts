import { SEED_FORM_TEMPLATES, validateResponse } from "@psi/scheduling/clinic";
import { ledger } from "../domain/ledger";
import { paidBani } from "../domain/usage";
import { offsetPage } from "./offset-page";
import { type ClinicPort, LIST_PAGE, PortError } from "./port";
import type { AppSlug, Client } from "./schema";
import {
	blacklistActive,
	type ClientFile,
	type ClientFlag,
	type ClientNote,
	type ClientRecord,
	type ClientSummary,
	FILE_MAX_BYTES,
	FILE_TYPES,
	FileNameSchema,
	NewBlacklistSchema,
	NewNoteSchema,
	NewRecordSchema,
	NotePatchSchema,
	RecordPatchSchema,
} from "./schema-clinical";
import type { AppData } from "./seed";
import { type ClinicalData, seedClinical } from "./seed-clinical";

export interface ClinicalDeps {
	today: string;
	data: (app: AppSlug) => AppData;
	guard: (method: keyof ClinicPort) => void;
	log: (d: AppData, actor: string, action: string, target: string) => void;
	nextId: (prefix: string) => string;
}

type ClinicalMethods = Pick<
	ClinicPort,
	| "updateClient"
	| "clientSummaries"
	| "clientFlags"
	| "notes"
	| "addNote"
	| "updateNote"
	| "deleteNote"
	| "blacklistHistory"
	| "addBlacklist"
	| "endBlacklist"
	| "formTemplates"
	| "records"
	| "record"
	| "createRecord"
	| "updateRecord"
	| "deleteRecord"
	| "files"
	| "filePage"
	| "uploadFile"
	| "downloadFile"
	| "renameFile"
	| "deleteFile"
>;

const stamp = (): string => new Date().toISOString().slice(0, 19);

/** The client page's data in the fake: notes, the blacklist, records and files, with the service's own rules. */
export function createFakeClinical(deps: ClinicalDeps): ClinicalMethods {
	const { guard, log, nextId, today } = deps;
	const states = new Map<AppSlug, ClinicalData>();
	const state = (app: AppSlug): ClinicalData => {
		let s = states.get(app);
		if (s === undefined) {
			s = seedClinical(deps.data(app).clients, today);
			states.set(app, s);
		}
		return s;
	};
	const known = (app: AppSlug, clientId: string): Client => {
		const c = deps.data(app).clients.find((x) => x.id === clientId);
		if (c === undefined) throw new PortError("not-found", clientId);
		return c;
	};
	const activeEntry = (app: AppSlug, clientId: string) =>
		state(app)
			.blacklist.filter((e) => e.clientId === clientId && blacklistActive(e, today))
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
	const newest = <T extends { createdAt: string }>(rows: T[]): T[] =>
		[...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	const check = (formKey: string, data: Record<string, unknown>, final: boolean): number => {
		const def = SEED_FORM_TEMPLATES.find((t) => t.key === formKey);
		if (def === undefined) throw new PortError("invalid", `unknown form ${formKey}`);
		const res = validateResponse(def, data);
		if (!res.ok && res.problems.some((p) => final || p.code !== "required"))
			throw new PortError("invalid", res.problems.map((p) => `${p.field}:${p.code}`).join(","));
		return def.version;
	};
	const withClient = <T extends { clientId: string }>(app: AppSlug, rows: T[], id: string): T[] => {
		known(app, id);
		return rows.filter((r) => r.clientId === id);
	};

	return {
		async updateClient(app, id, patch) {
			guard("updateClient");
			const d = deps.data(app);
			const i = d.clients.findIndex((c) => c.id === id);
			const held = d.clients[i];
			if (held === undefined) throw new PortError("not-found", id);
			const next: Client = {
				...held,
				...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
			};
			d.clients[i] = next;
			log(d, "console", "client.edit", id);
			return next;
		},
		async clientSummaries(app, filter, query) {
			guard("clientSummaries");
			const d = deps.data(app);
			const q = query.trim().toLowerCase();
			const s = state(app);
			return d.clients
				.filter((c) => c.status === filter)
				.filter(
					(c) =>
						q === "" ||
						[c.name, c.phone ?? "", c.guardian ?? ""].some((x) => x.toLowerCase().includes(q)),
				)
				.map((c): ClientSummary => {
					const next =
						d.appointments
							.filter(
								(a) =>
									a.clientId === c.id &&
									a.date >= today &&
									a.status !== "cancelled" &&
									a.status !== "no-show",
							)
							.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)[0] ?? null;
					const owedBani = d.packages
						.filter((p) => p.clientId === c.id)
						.reduce(
							(sum, p) => sum + Math.max(0, ledger(p.totalBani, paidBani(p)).remainingBani),
							0,
						);
					return {
						clientId: c.id,
						next: next === null ? null : { date: next.date, startMin: next.startMin },
						owedBani,
						blacklist: activeEntry(app, c.id),
						pinnedNotes: s.notes.filter((n) => n.clientId === c.id && n.pinned).length,
					};
				});
		},
		async clientFlags(app, ids) {
			guard("clientFlags");
			const out: Record<string, ClientFlag> = {};
			for (const id of ids) {
				const pinned = newest(state(app).notes.filter((n) => n.clientId === id && n.pinned))[0];
				const blacklist = activeEntry(app, id);
				if (pinned !== undefined || blacklist !== null)
					out[id] = {
						blacklist,
						pinned: pinned === undefined ? null : { body: pinned.body, category: pinned.category },
					};
			}
			return out;
		},
		async notes(app, clientId) {
			guard("notes");
			return newest(withClient(app, state(app).notes, clientId));
		},
		async addNote(app, clientId, raw, by) {
			guard("addNote");
			known(app, clientId);
			const input = NewNoteSchema.safeParse(raw);
			if (!input.success) throw new PortError("invalid", "note");
			const note: ClientNote = {
				id: nextId("n"),
				clientId,
				...input.data,
				authorSubject: by.subject,
				authorName: by.name,
				createdAt: stamp(),
				editedAt: null,
			};
			state(app).notes.push(note);
			log(deps.data(app), by.name, "note.add", clientId);
			return note;
		},
		async updateNote(app, noteId, raw) {
			guard("updateNote");
			const s = state(app);
			const i = s.notes.findIndex((n) => n.id === noteId);
			const held = s.notes[i];
			if (held === undefined) throw new PortError("not-found", noteId);
			const patch = NotePatchSchema.safeParse(raw);
			if (!patch.success) throw new PortError("invalid", "note");
			const textChanged =
				(patch.data.body !== undefined && patch.data.body !== held.body) ||
				(patch.data.category !== undefined && patch.data.category !== held.category);
			const next: ClientNote = {
				...held,
				...Object.fromEntries(Object.entries(patch.data).filter(([, v]) => v !== undefined)),
				editedAt: textChanged ? stamp() : held.editedAt,
			};
			s.notes[i] = next;
			log(deps.data(app), "console", "note.edit", noteId);
			return next;
		},
		async deleteNote(app, noteId) {
			guard("deleteNote");
			const s = state(app);
			if (!s.notes.some((n) => n.id === noteId)) throw new PortError("not-found", noteId);
			s.notes = s.notes.filter((n) => n.id !== noteId);
			log(deps.data(app), "console", "note.delete", noteId);
		},
		async blacklistHistory(app, clientId) {
			guard("blacklistHistory");
			return newest(withClient(app, state(app).blacklist, clientId));
		},
		async addBlacklist(app, clientId, raw, by) {
			guard("addBlacklist");
			known(app, clientId);
			const input = NewBlacklistSchema.safeParse(raw);
			if (!input.success) throw new PortError("invalid", "blacklist");
			if (activeEntry(app, clientId) !== null) throw new PortError("conflict", "already listed");
			const entry = {
				id: nextId("b"),
				clientId,
				...input.data,
				createdAt: stamp(),
				createdBy: by.name,
				endedAt: null,
				endedBy: null,
				endReason: null,
			};
			state(app).blacklist.push(entry);
			log(deps.data(app), by.name, "blacklist.add", clientId);
			return entry;
		},
		async endBlacklist(app, entryId, reason, by) {
			guard("endBlacklist");
			const s = state(app);
			const i = s.blacklist.findIndex((e) => e.id === entryId);
			const held = s.blacklist[i];
			if (held === undefined) throw new PortError("not-found", entryId);
			if (reason.trim() === "") throw new PortError("invalid", "reason");
			const next = { ...held, endedAt: stamp(), endedBy: by.name, endReason: reason.trim() };
			s.blacklist[i] = next;
			log(deps.data(app), by.name, "blacklist.end", held.clientId);
			return next;
		},
		async formTemplates() {
			guard("formTemplates");
			return SEED_FORM_TEMPLATES;
		},
		async records(app, clientId) {
			guard("records");
			return newest(withClient(app, state(app).records, clientId));
		},
		async record(app, id) {
			guard("record");
			return state(app).records.find((r) => r.id === id) ?? null;
		},
		async createRecord(app, clientId, raw, by) {
			guard("createRecord");
			known(app, clientId);
			const input = NewRecordSchema.safeParse(raw);
			if (!input.success) throw new PortError("invalid", "record");
			const formVersion = check(input.data.formKey, input.data.data, input.data.status === "final");
			const rec: ClientRecord = {
				id: nextId("r"),
				clientId,
				formKey: input.data.formKey,
				formVersion,
				appointmentId: input.data.appointmentId,
				status: input.data.status,
				authorName: by.name,
				createdAt: stamp(),
				updatedAt: stamp(),
				data: input.data.data,
			};
			state(app).records.push(rec);
			log(deps.data(app), by.name, "record.create", rec.id);
			return rec;
		},
		async updateRecord(app, id, raw) {
			guard("updateRecord");
			const s = state(app);
			const i = s.records.findIndex((r) => r.id === id);
			const held = s.records[i];
			if (held === undefined) throw new PortError("not-found", id);
			const patch = RecordPatchSchema.safeParse(raw);
			if (!patch.success) throw new PortError("invalid", "record");
			const next: ClientRecord = {
				...held,
				...Object.fromEntries(Object.entries(patch.data).filter(([, v]) => v !== undefined)),
				updatedAt: stamp(),
			};
			check(next.formKey, next.data, next.status === "final");
			s.records[i] = next;
			log(deps.data(app), "console", "record.update", id);
			return next;
		},
		async deleteRecord(app, id) {
			guard("deleteRecord");
			const s = state(app);
			if (!s.records.some((r) => r.id === id)) throw new PortError("not-found", id);
			s.records = s.records.filter((r) => r.id !== id);
			log(deps.data(app), "console", "record.delete", id);
		},
		async files(app, clientId) {
			guard("files");
			known(app, clientId);
			return newest(
				state(app)
					.files.map((f) => f.meta)
					.filter((f) => f.clientId === clientId),
			);
		},
		async filePage(app, clientId, cursor) {
			guard("filePage");
			return offsetPage(await this.files(app, clientId), cursor, LIST_PAGE);
		},
		async uploadFile(app, clientId, file, by) {
			guard("uploadFile");
			known(app, clientId);
			const name = FileNameSchema.safeParse(file.name);
			if (
				!name.success ||
				file.bytes.length === 0 ||
				file.bytes.length > FILE_MAX_BYTES ||
				!FILE_TYPES.includes(file.contentType)
			)
				throw new PortError("invalid", "file");
			const meta: ClientFile = {
				id: nextId("f"),
				clientId,
				name: name.data,
				contentType: file.contentType,
				size: file.bytes.length,
				uploadedByName: by.name,
				createdAt: stamp(),
			};
			state(app).files.push({ meta, bytes: file.bytes });
			log(deps.data(app), by.name, "file.upload", meta.id);
			return meta;
		},
		async downloadFile(app, id) {
			guard("downloadFile");
			const f = state(app).files.find((x) => x.meta.id === id);
			if (f === undefined) throw new PortError("not-found", id);
			return { name: f.meta.name, contentType: f.meta.contentType, bytes: f.bytes };
		},
		async renameFile(app, id, rawName) {
			guard("renameFile");
			const f = state(app).files.find((x) => x.meta.id === id);
			if (f === undefined) throw new PortError("not-found", id);
			const name = FileNameSchema.safeParse(rawName);
			if (!name.success) throw new PortError("invalid", "name");
			f.meta = { ...f.meta, name: name.data };
			log(deps.data(app), "console", "file.rename", id);
			return f.meta;
		},
		async deleteFile(app, id) {
			guard("deleteFile");
			const s = state(app);
			if (!s.files.some((x) => x.meta.id === id)) throw new PortError("not-found", id);
			s.files = s.files.filter((x) => x.meta.id !== id);
			log(deps.data(app), "console", "file.delete", id);
		},
	};
}
