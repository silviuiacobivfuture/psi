import type { ActionInfo } from "../actions";
import type { StaffScreen } from "../events";

/** An action of the fake registry: who may see it (a capability key) and on which screens. */
export interface FakeAction extends ActionInfo {
	needs: string;
	/** The words for a Romanian-speaking person (the registry answers in the person's language). */
	ro: { label: string; summary: string };
	/** Only on these screens (all when absent). */
	screens?: ReadonlyArray<StaffScreen>;
}

const clientId = {
	name: "clientId",
	label: "Client",
	kind: "id",
	required: true,
	description: "The client's id; on a client's page, that client.",
} as const;

/**
 * What the fake console registry offers, in the shape the real one answers (`listActions(ctx)`):
 * a few reads and writes across the clinic, each behind a capability.
 */
export const FAKE_ACTIONS: ReadonlyArray<FakeAction> = [
	{
		id: "clients.addNote",
		label: "Add a note to a client's file",
		summary: "Adds a dated note to the client's file",
		group: "clients",
		kind: "write",
		destructive: false,
		ro: {
			label: "Adaugă o notiță la fișa clientului",
			summary: "Adaugă o notiță datată în fișa clientului",
		},
		needs: "records_create",
		params: [clientId, { name: "text", label: "Note", kind: "text", required: true }],
	},
	{
		id: "clients.blacklist",
		label: "Blacklist a client",
		summary: "Blocks the client from booking online and records why",
		group: "clients",
		kind: "write",
		destructive: true,
		ro: {
			label: "Pune un client pe lista neagră",
			summary: "Blochează clientul la programarea online și notează motivul",
		},
		needs: "clients_edit",
		params: [clientId, { name: "reason", label: "Reason", kind: "text", required: true }],
	},
	{
		id: "files.upload",
		label: "Upload a file to a client's record",
		summary:
			"Files are uploaded on the client's page, in the Files tab; a file cannot be sent through chat",
		group: "clients",
		kind: "write",
		destructive: false,
		ro: {
			label: "Încarcă un fișier în fișa clientului",
			summary:
				"Fișierele se încarcă pe pagina clientului, la fila Fișiere; un fișier nu poate fi trimis prin chat",
		},
		needs: "files_upload",
		screens: ["client"],
		params: [clientId, { name: "name", label: "File name", kind: "text", required: false }],
	},
	{
		id: "reports.noShows",
		label: "List the no-shows of a period",
		summary: "Who did not come between two dates",
		group: "reports",
		kind: "read",
		destructive: false,
		ro: { label: "Lista absențelor dintr-o perioadă", summary: "Cine nu a venit între două date" },
		needs: "appointments_view",
		params: [
			{ name: "from", label: "From", kind: "date", required: true },
			{ name: "to", label: "To", kind: "date", required: true },
		],
	},
	{
		id: "roles.edit",
		label: "Change a role's permissions",
		summary: "Edits what a role may do",
		group: "admin",
		kind: "write",
		destructive: false,
		ro: { label: "Schimbă drepturile unui rol", summary: "Modifică ce poate face un rol" },
		needs: "roles_edit",
		params: [
			{ name: "role", label: "Role", kind: "text", required: true },
			{ name: "permission", label: "Permission", kind: "text", required: true },
		],
	},
];
