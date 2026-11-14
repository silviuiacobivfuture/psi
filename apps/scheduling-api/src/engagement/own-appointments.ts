import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import type { Ctx } from "../http/context";
import { accountClients } from "./account-links";

type C = Ctx<RouteSpec>;

export interface OwnItem {
	id: string;
	reference: string;
	status: string;
	start: number;
	end: number;
	mode?: "onsite" | "online";
	serviceSlug?: string;
	practitioner?: string;
	practitionerName?: string;
	/** A session the clinic booked is cancelled online up to its start; it is moved by calling the clinic. */
	changeUntil: number;
	canChange: boolean;
	canMove: boolean;
}

/**
 * The clinic's own appointments of the clients an account covers: invited for (a guardian's account covers each child),
 * or linked by a booking whose vouched e-mail was theirs, or by the team.
 * Only a live session shows: a soft-deleted one, a block, a group slot and a no-show are the team's business. A booking
 * the team made reads as `confirmed`, because that is what it is to the person.
 */
export async function clinicAppointmentsOf(ctx: C, subject: string): Promise<OwnItem[]> {
	const { store } = ctx.deps;
	const out: OwnItem[] = [];
	for (const clientId of await accountClients(ctx, subject)) {
		const rows = await store.c.appointments.list(ctx.app, { eq: { clientId } });
		for (const a of rows) {
			if (a.deletedAt !== undefined || a.kind !== "session") continue;
			if (a.status !== "scheduled" && a.status !== "attended" && a.status !== "cancelled") continue;
			const [service, person] = await Promise.all([
				a.serviceId === undefined ? undefined : store.c.services.get(ctx.app, a.serviceId),
				store.c.people.get(ctx.app, a.practitionerId),
			]);
			const open = a.status === "scheduled" && ctx.now < a.start;
			out.push({
				id: a.id,
				reference: a.id,
				status: a.status === "cancelled" ? "cancelled" : "confirmed",
				start: a.start,
				end: a.end,
				...(service === undefined ? {} : { serviceSlug: service.slug }),
				practitioner: a.practitionerId,
				...(person === undefined ? {} : { practitionerName: person.displayName }),
				changeUntil: a.start,
				canChange: open,
				canMove: false,
			});
		}
	}
	return out.sort((x, y) => y.start - x.start);
}

/**
 * Cancels one of those appointments for the person it belongs to. False when it is not theirs, not a live session, not
 * scheduled, or already started: the caller answers "not found" for all of them, so an id of someone else's says nothing.
 */
export async function cancelClinicAppointment(
	ctx: C,
	subject: string,
	id: string,
): Promise<boolean> {
	const own = await clinicAppointmentsOf(ctx, subject);
	if (!own.some((a) => a.id === id)) return false;
	const row = await ctx.deps.store.c.appointments.get(ctx.app, id);
	if (row === undefined || row.status !== "scheduled" || row.start <= ctx.now) return false;
	await ctx.deps.store.c.appointments.replace({
		...row,
		status: "cancelled",
		cancelReason: "Anulat de client din cont",
		updatedAt: ctx.now,
	});
	await ctx.changed("appointment", "updated", id);
	await ctx.notify(
		"appointment.cancelled",
		{ kind: "client", clientId: row.clientId ?? "" },
		{ appointmentId: id, start: row.start, source: "client" },
		`own:${id}`,
	);
	return true;
}
