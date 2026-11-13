import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import {
	type Client,
	ClinicalData,
	FIELD_GROUPS,
	type FieldGroupName,
} from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import { reaches } from "../authz/access";
import type { Ctx } from "../http/context";
import type { AppointmentRow, ClientRow } from "../store/types";

type C = Ctx<RouteSpec>;
type ClientOut = z.output<typeof Client>;

/** Which field groups of clients the caller may see, per client id: asked once per request, not once per row. */
export async function clientGroupReach(
	ctx: C,
): Promise<Record<FieldGroupName, Awaited<ReturnType<C["reachOf"]>>>> {
	const entries = await Promise.all(
		FIELD_GROUPS.map(
			async (g) => [g, await ctx.reachOf(`clients_${g}_view`, "sched_client")] as const,
		),
	);
	return Object.fromEntries(entries) as Record<FieldGroupName, Awaited<ReturnType<C["reachOf"]>>>;
}

export const clinicalContext = (app: string, clientId: string): string =>
	`${app}:client:${clientId}:clinical`;

/**
 * A client as the caller may see it: the identity, and each field group only where their reach includes this client.
 * A group they may not see is absent from the object (not null, not masked). Clinical data is opened here and nowhere
 * else, and returns `clinicalRead` so the caller audits the read.
 */
export function clientView(
	ctx: C,
	row: ClientRow,
	reach: Awaited<ReturnType<typeof clientGroupReach>>,
): { client: ClientOut; clinicalRead: boolean } {
	const out: ClientOut = {
		id: row.id,
		name: row.name,
		status: row.status,
		treating: row.treating,
		...(row.birthYear === undefined ? {} : { birthYear: row.birthYear }),
		...(row.archivedAt === undefined ? {} : { archivedAt: row.archivedAt }),
		...(row.deletedAt === undefined ? {} : { deletedAt: row.deletedAt }),
		...(row.purgeAt === undefined ? {} : { purgeAt: row.purgeAt }),
		...(row.contact !== undefined && reaches(reach.contact, row.id)
			? { contact: row.contact }
			: {}),
		...(row.guardian !== undefined && reaches(reach.guardian, row.id)
			? { guardian: row.guardian }
			: {}),
		...(row.money !== undefined && reaches(reach.money, row.id) ? { money: row.money } : {}),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
	let clinicalRead = false;
	if (row.clinicalSealed !== undefined && reaches(reach.clinical, row.id)) {
		out.clinical = ClinicalData.parse(
			JSON.parse(ctx.deps.crypto.open(row.clinicalSealed, clinicalContext(row.app, row.id))),
		);
		clinicalRead = true;
	}
	return { client: out, clinicalRead };
}

/** An appointment without its money group unless the caller may see it. */
export function appointmentView(
	row: AppointmentRow,
	money: boolean,
): Omit<AppointmentRow, "app" | "money"> & { money?: AppointmentRow["money"] } {
	const { app: _app, money: held, ...rest } = row;
	return money && held !== undefined ? { ...rest, money: held } : rest;
}
