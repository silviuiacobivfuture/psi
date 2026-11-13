import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { type Client, ClinicalData } from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import { reaches } from "../authz/access";
import type { Ctx } from "../http/context";
import { FIELDS } from "../ports/crypto";
import type { AppointmentRow, ClientRow } from "../store/types";

type C = Ctx<RouteSpec>;
type ClientOut = z.output<typeof Client>;
type GroupReach = Awaited<ReturnType<C["reachOf"]>>;
export interface ClientGroupReach {
	contact: GroupReach;
	guardian: GroupReach;
	money: GroupReach;
	clinical: GroupReach;
}

/** Which field groups a projection of a client carries (a list never carries the clinical one). */
export interface ClientInclude {
	contact: boolean;
	guardian: boolean;
	money: boolean;
	clinical: boolean;
}

/** Which field groups of clients the caller may see, per client id: asked once per request, not once per row. */
export async function clientGroupReach(ctx: C): Promise<ClientGroupReach> {
	const [contact, guardian, money, clinical] = await Promise.all([
		ctx.reachOf("clients_view_contact", "sched_client"),
		ctx.reachOf("clients_view_guardian", "sched_client"),
		ctx.reachOf("clients_view_money", "sched_client"),
		ctx.reachOf("clients_view_clinical", "sched_client"),
	]);
	return { contact, guardian, money, clinical };
}

/**
 * A client as the caller may see it: the identity, and each field group only where their reach includes this client.
 * A group they may not see is absent from the object (not null, not masked). Clinical data is opened here and nowhere
 * else, and returns `clinicalRead` so the caller audits the read.
 */
export async function clientView(
	ctx: C,
	row: ClientRow,
	reach: ClientGroupReach,
	include: ClientInclude = { contact: true, guardian: true, money: true, clinical: true },
): Promise<{ client: ClientOut; clinicalRead: boolean }> {
	const out: ClientOut = {
		id: row.id,
		name: row.name,
		status: row.status,
		treating: row.treating,
		...(row.birthYear === undefined ? {} : { birthYear: row.birthYear }),
		...(row.archivedAt === undefined ? {} : { archivedAt: row.archivedAt }),
		...(row.deletedAt === undefined ? {} : { deletedAt: row.deletedAt }),
		...(row.purgeAt === undefined ? {} : { purgeAt: row.purgeAt }),
		...(include.contact && row.contact !== undefined && reaches(reach.contact, row.id)
			? { contact: row.contact }
			: {}),
		...(include.guardian && row.guardian !== undefined && reaches(reach.guardian, row.id)
			? { guardian: row.guardian }
			: {}),
		...(include.money && row.money !== undefined && reaches(reach.money, row.id)
			? { money: row.money }
			: {}),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
	let clinicalRead = false;
	if (include.clinical && reaches(reach.clinical, row.id)) {
		const clinical = await clinicalOf(ctx, row);
		if (clinical !== undefined) {
			out.clinical = clinical;
			clinicalRead = true;
		}
	}
	return { client: out, clinicalRead };
}

/**
 * A client's clinical group, opened. What the service wrote (`clinicalSealed`, the whole group) wins; a client that
 * came in through the import has the old app's three texts apart, and they map as: reason for coming -> `mainReason`,
 * diagnosis -> `diagnosis`, health notes -> `notes`. Nothing here checks who may read: the caller has.
 */
export async function clinicalOf(
	ctx: C,
	row: ClientRow,
): Promise<z.output<typeof ClinicalData> | undefined> {
	if (row.clinicalSealed !== undefined)
		return ClinicalData.parse(
			JSON.parse(await ctx.deps.crypto.open(row.app, FIELDS.clinical, row.clinicalSealed)),
		);
	const imported = row.importedClinical;
	if (imported === undefined) return undefined;
	const text = async (field: string, sealed: string | undefined) =>
		sealed === undefined ? undefined : await ctx.deps.crypto.open(row.app, field, sealed);
	const [mainReason, diagnosis, notes] = await Promise.all([
		text(FIELDS.importedMainReason, imported.mainReason),
		text(FIELDS.importedDiagnosis, imported.diagnosis),
		text(FIELDS.importedHealthNotes, imported.healthNotes),
	]);
	const group = {
		...(mainReason === undefined ? {} : { mainReason }),
		...(diagnosis === undefined ? {} : { diagnosis }),
		...(notes === undefined ? {} : { notes }),
	};
	return Object.keys(group).length === 0 ? undefined : ClinicalData.parse(group);
}

/** What an appointment keeps beyond its identity (who, when, status): visible only with `appointments_view_core`. */
const CORE_FIELDS = [
	"clientId",
	"groupId",
	"roomId",
	"deviceId",
	"serviceId",
	"packageId",
	"note",
	"cancelReason",
] as const;

export interface AppointmentGroups {
	core: boolean;
	money: boolean;
}

type AppointmentOut = Omit<AppointmentRow, "app" | "money" | "therapistNoteSealed"> & {
	money?: AppointmentRow["money"];
	clinical?: { therapistNote: string };
};

/** An appointment as the caller may see it: identity always, `core` and `money` only with their own keys. */
export function appointmentView(row: AppointmentRow, groups: AppointmentGroups): AppointmentOut {
	const { app: _app, money: held, therapistNoteSealed: _sealed, ...rest } = row;
	const shown: AppointmentOut = { ...rest };
	if (!groups.core) for (const field of CORE_FIELDS) delete shown[field];
	return groups.money && held !== undefined ? { ...shown, money: held } : shown;
}

/** The appointment groups the caller may see, per appointment id: asked once per request. */
export async function appointmentGroupReach(
	ctx: C,
): Promise<{ core: GroupReach; money: GroupReach }> {
	const [core, money] = await Promise.all([
		ctx.reachOf("appointments_view_core", "sched_appointment"),
		ctx.reachOf("appointments_view_money", "sched_appointment"),
	]);
	return { core, money };
}
