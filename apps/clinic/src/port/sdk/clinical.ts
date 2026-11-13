import { SEED_FORM_TEMPLATES } from "@psi/scheduling/clinic";
import { PortError } from "../port";
import type { AppSlug, Client } from "../schema";
import type { ClientSummary } from "../schema-clinical";
import type { SdkContext } from "./context";

const soon = (what: string): Promise<never> =>
	Promise.reject(new PortError("not-available-yet", what));

/**
 * The client page's reads and writes the scheduling service has no route for yet answer "not available yet", so a
 * screen says "în curând" instead of showing a blank. What can be answered from other calls is: the rich rows carry
 * what a client list offers, and the seeded form templates stay offered. Records and files follow the service's
 * `records.*` and `files.*` routes once the SDK client exposes them.
 */
export function clinicalGroup(
	_sdk: SdkContext,
	listClients: (app: AppSlug, status: "active" | "archived", q: string) => Promise<Client[]>,
) {
	return {
		clientSummaries: async (
			app: AppSlug,
			filter: "current" | "archived",
			q: string,
		): Promise<ClientSummary[]> =>
			(await listClients(app, filter === "current" ? "active" : "archived", q.trim())).map((c) => ({
				clientId: c.id,
				next: null,
				owedBani: null,
				blacklist: null,
				pinnedNotes: 0,
			})),
		clientFlags: async () => ({}),
		formTemplates: async () => SEED_FORM_TEMPLATES,
		updateClient: () => soon("clients.update"),
		notes: () => soon("notes.list"),
		addNote: () => soon("notes.create"),
		updateNote: () => soon("notes.update"),
		deleteNote: () => soon("notes.delete"),
		blacklistHistory: () => soon("blacklist.list"),
		addBlacklist: () => soon("blacklist.create"),
		endBlacklist: () => soon("blacklist.end"),
		records: () => soon("records.list"),
		record: () => soon("records.get"),
		createRecord: () => soon("records.create"),
		updateRecord: () => soon("records.update"),
		deleteRecord: () => soon("records.remove"),
		files: () => soon("files.list"),
		uploadFile: () => soon("files.upload"),
		downloadFile: () => soon("files.download"),
		renameFile: () => soon("files.rename"),
		deleteFile: () => soon("files.remove"),
	};
}
