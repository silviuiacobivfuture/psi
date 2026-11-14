import { SEED_FORM_TEMPLATES } from "@psi/scheduling/clinic";
import {
	FILE_TYPES as API_FILE_TYPES,
	type BlacklistEntry as ApiBlacklist,
	type FileMeta as ApiFile,
} from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import {
	CLIENT_PAGE_SIZE,
	type ClientPage,
	LIST_PAGE,
	type ListedClient,
	type Paged,
	PortError,
} from "../port";
import type { AppSlug, Client } from "../schema";
import type { BlacklistEntry, ClientFile, ClientFlag, ClientSummary } from "../schema-clinical";
import { clinicalNotesGroup } from "./clinical-notes";
import type { SdkContext } from "./context";
import { toPortError } from "./errors";
import { clientOf, drain } from "./map";
import { instantOf, wallOf } from "./time";

const soon = (what: string): Promise<never> =>
	Promise.reject(new PortError("not-available-yet", what));

const stamp = (ms: number, tz: string): string => {
	const w = wallOf(ms, tz);
	const hh = String(Math.floor(w.minutes / 60)).padStart(2, "0");
	const mm = String(w.minutes % 60).padStart(2, "0");
	return `${w.date}T${hh}:${mm}:00`;
};

const entryOf = (e: z.output<typeof ApiBlacklist>, tz: string): BlacklistEntry => ({
	id: e.id,
	clientId: e.client ?? "",
	reason: e.reason,
	category: e.category,
	severity: e.severity,
	createdAt: stamp(e.createdAt, tz),
	createdBy: e.createdBy,
	expiresOn: e.expiresAt === undefined ? null : wallOf(e.expiresAt, tz).date,
	endedAt: e.active ? null : stamp(e.updatedAt, tz),
	endedBy: e.active ? null : e.updatedBy,
	// The service keeps no "why it was removed": the history says who and when.
	endReason: null,
});

const fileOf = (f: z.output<typeof ApiFile>, tz: string): ClientFile => ({
	id: f.id,
	clientId: f.clientId,
	name: f.name,
	contentType: f.contentType,
	size: f.size,
	uploadedByName: f.uploadedBy,
	createdAt: stamp(f.createdAt, tz),
});

/** The newest of an entry list per client: what a flag shows. */
const newestPerClient = (entries: ReadonlyArray<BlacklistEntry>): Map<string, BlacklistEntry> => {
	const by = new Map<string, BlacklistEntry>();
	for (const e of [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
		if (e.clientId !== "") by.set(e.clientId, e);
	return by;
};

/**
 * The client page over the service: the blacklist (list, flag, switch off) and files (announce, upload to the signed
 * URL, complete, download, delete), the notes, the records and a client's own fields use its routes (see
 * `clinical-notes.ts`). A file's rename has no route yet and answers "not available yet".
 */
export function clinicalGroup(
	sdk: SdkContext,
	listClients: (app: AppSlug, status: "active" | "archived", q: string) => Promise<Client[]>,
) {
	const { api, run } = sdk;
	const more = clinicalNotesGroup(sdk);
	/** Active entries of the app by client; a person who may not see the blacklist sees none. */
	const activeByClient = async (app: AppSlug): Promise<Map<string, BlacklistEntry>> => {
		try {
			const tz = await sdk.zone(app);
			const list = await drain((cursor) =>
				api.blacklist.list({
					app,
					includeInactive: "false",
					limit: 500,
					...(cursor === undefined ? {} : { cursor }),
				}),
			);
			return newestPerClient(list.map((e) => entryOf(e, tz)));
		} catch (error) {
			if (toPortError(error).code === "forbidden") return new Map();
			throw error;
		}
	};
	return {
		clientSummaries: (
			app: AppSlug,
			filter: "current" | "archived",
			q: string,
		): Promise<ClientSummary[]> =>
			run(async () => {
				const [clients, listed] = await Promise.all([
					listClients(app, filter === "current" ? "active" : "archived", q.trim()),
					activeByClient(app),
				]);
				const pinned = await more.pinnedCounts(
					app,
					clients.map((c) => c.id),
				);
				return clients.map((c) => ({
					clientId: c.id,
					next: null,
					owedBani: null,
					blacklist: listed.get(c.id) ?? null,
					pinnedNotes: pinned.get(c.id) ?? 0,
				}));
			}),
		clientPage: (
			app: AppSlug,
			filter: "current" | "archived",
			q: string,
			cursor: string | null,
		): Promise<ClientPage> =>
			run(async () => {
				const query = q.trim();
				const [page, listed] = await Promise.all([
					api.clients.list({
						app,
						status: filter === "current" ? "active" : "archived",
						...(query === "" ? {} : { q: query }),
						limit: CLIENT_PAGE_SIZE,
						...(cursor === null ? {} : { cursor }),
					}),
					activeByClient(app),
				]);
				const clients = page.items.map(clientOf);
				const pinned = await more.pinnedCounts(
					app,
					clients.map((c) => c.id),
				);
				return {
					clients,
					summaries: clients.map((c) => ({
						clientId: c.id,
						next: null,
						owedBani: null,
						blacklist: listed.get(c.id) ?? null,
						pinnedNotes: pinned.get(c.id) ?? 0,
					})),
					nextCursor: page.nextCursor ?? null,
				};
			}),
		clientFlags: (app: AppSlug, ids: ReadonlyArray<string>): Promise<Record<string, ClientFlag>> =>
			run(async () => {
				const [listed, pinned] = await Promise.all([
					activeByClient(app),
					more.pinnedFlags(app, ids),
				]);
				const out: Record<string, ClientFlag> = {};
				for (const id of ids) {
					const entry = listed.get(id) ?? null;
					const note = pinned.get(id) ?? null;
					if (entry !== null || note !== null) out[id] = { blacklist: entry, pinned: note };
				}
				return out;
			}),
		formTemplates: async () => SEED_FORM_TEMPLATES,

		/** One page of the active entries, newest first, and their clients' names in one batched read. */
		blacklistPage: (app: AppSlug, cursor: string | null): Promise<Paged<ListedClient>> =>
			run(async () => {
				const [tz, got] = await Promise.all([
					sdk.zone(app),
					api.blacklist.list({ app, limit: LIST_PAGE, ...(cursor === null ? {} : { cursor }) }),
				]);
				const ids = [
					...new Set(got.items.flatMap((e) => (e.client === undefined ? [] : [e.client]))),
				];
				const named =
					ids.length === 0
						? []
						: (await api.clients.list({ app, ids: ids.join(","), limit: ids.length })).items;
				const names = new Map(named.map((c) => [c.id, c.name]));
				return {
					items: got.items.flatMap((e) =>
						e.client === undefined
							? []
							: [
									{
										entry: entryOf(e, tz),
										clientId: e.client,
										clientName: names.get(e.client) ?? "",
									},
								],
					),
					nextCursor: got.nextCursor ?? null,
				};
			}),

		blacklistHistory: (app: AppSlug, clientId: string): Promise<BlacklistEntry[]> =>
			run(async () => {
				const tz = await sdk.zone(app);
				const all = await drain((cursor) =>
					api.blacklist.list({
						app,
						includeInactive: "true",
						limit: 500,
						...(cursor === undefined ? {} : { cursor }),
					}),
				);
				return all
					.filter((e) => e.client === clientId)
					.map((e) => entryOf(e, tz))
					.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
			}),
		addBlacklist: (
			app: AppSlug,
			clientId: string,
			input: {
				reason: string;
				category: BlacklistEntry["category"];
				severity: BlacklistEntry["severity"];
				expiresOn?: string | null;
			},
		): Promise<BlacklistEntry> =>
			run(async () => {
				const tz = await sdk.zone(app);
				const made = await api.blacklist.create({
					app,
					client: clientId,
					reason: input.reason,
					category: input.category,
					severity: input.severity,
					...(input.expiresOn === null || input.expiresOn === undefined
						? {}
						: { expiresAt: instantOf(input.expiresOn, 23 * 60 + 59, tz) }),
				});
				return entryOf(made, tz);
			}),
		endBlacklist: (app: AppSlug, entryId: string): Promise<BlacklistEntry> =>
			run(async () => {
				const tz = await sdk.zone(app);
				const done = await api.blacklist.update({ app, id: entryId, active: false });
				return entryOf(done.entry, tz);
			}),

		files: (app: AppSlug, clientId: string): Promise<ClientFile[]> =>
			run(async () => {
				const tz = await sdk.zone(app);
				const list = await drain((cursor) =>
					api.files.list({
						app,
						id: clientId,
						limit: 500,
						...(cursor === undefined ? {} : { cursor }),
					}),
				);
				return list.filter((f) => f.status === "ready").map((f) => fileOf(f, tz));
			}),
		uploadFile: (
			app: AppSlug,
			clientId: string,
			file: { name: string; contentType: string; bytes: Uint8Array },
		): Promise<ClientFile> =>
			run(async () => {
				const type = API_FILE_TYPES.find((t) => t === file.contentType);
				if (type === undefined) throw new PortError("invalid", "file type");
				const tz = await sdk.zone(app);
				const init = await api.files.init({
					app,
					id: clientId,
					name: file.name,
					contentType: type,
					size: file.bytes.length,
				});
				const put = await sdk.transfer(init.upload.url, {
					method: "PUT",
					headers: { "content-type": file.contentType },
					body: new Uint8Array(file.bytes),
				});
				if (!put.ok) throw new PortError("unavailable", "the upload was not accepted");
				return fileOf(await api.files.complete({ app, id: init.file.id }), tz);
			}),
		downloadFile: (
			app: AppSlug,
			id: string,
		): Promise<{ name: string; contentType: string; bytes: Uint8Array }> =>
			run(async () => {
				const signed = await api.files.download({ app, id });
				const got = await sdk.transfer(signed.url);
				if (!got.ok) throw new PortError("not-found", id);
				// The service answers a URL, not the name: the screen knows it from the list it came from.
				return {
					name: id,
					contentType: got.headers.get("content-type") ?? "application/octet-stream",
					bytes: new Uint8Array(await got.arrayBuffer()),
				};
			}),
		deleteFile: (app: AppSlug, id: string): Promise<void> =>
			run(async () => {
				await api.files.remove({ app, id, confirm: "true" });
			}),
		renameFile: () => soon("files.rename"),

		notes: more.notes,
		addNote: more.addNote,
		updateNote: more.updateNote,
		deleteNote: more.deleteNote,
		records: more.records,
		record: more.record,
		createRecord: more.createRecord,
		updateRecord: more.updateRecord,
		deleteRecord: more.deleteRecord,
		updateClient: more.updateClient,
	};
}
