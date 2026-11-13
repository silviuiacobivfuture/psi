import type { z } from "zod";
import { within } from "../deadline";
import { PORT_VALUES, type PortResult, parsePortResult, type StaffPort } from "./port";

/** Deadline for one call to the scheduling service. */
export const PORT_TIMEOUT_MS = 8_000;

async function guarded<T>(
	value: z.ZodType<T>,
	what: string,
	call: () => Promise<unknown>,
): Promise<PortResult<T>> {
	try {
		return parsePortResult(value, await within(call(), PORT_TIMEOUT_MS, what));
	} catch {
		return { ok: false, reason: "unavailable" };
	}
}

/**
 * The port as the assistant uses it: every answer is parsed with its schema (a malformed one is
 * `unavailable`, not a guess), a throw or a timeout is `unavailable`, and nothing else leaks out.
 * The console's port may be written any way; this is the one boundary.
 */
export function guardPort(port: StaffPort): StaffPort {
	const p = PORT_VALUES;
	return {
		whoami: () => guarded(p.whoami, "whoami", () => port.whoami()),
		can: (action, subjectId) => guarded(p.can, "can", () => port.can(action, subjectId)),
		audit: (entry) => guarded(p.audit, "audit", () => port.audit(entry)),
		resources: () => guarded(p.resources, "resources", () => port.resources()),
		services: () => guarded(p.services, "services", () => port.services()),
		findClients: (q) => guarded(p.findClients, "findClients", () => port.findClients(q)),
		clientSummary: (id) => guarded(p.clientSummary, "clientSummary", () => port.clientSummary(id)),
		agenda: (q) => guarded(p.agenda, "agenda", () => port.agenda(q)),
		appointment: (id) => guarded(p.appointment, "appointment", () => port.appointment(id)),
		freeSlots: (q) => guarded(p.freeSlots, "freeSlots", () => port.freeSlots(q)),
		checkSlot: (q) => guarded(p.checkSlot, "checkSlot", () => port.checkSlot(q)),
		createAppointment: (i) =>
			guarded(p.appointment, "createAppointment", () => port.createAppointment(i)),
		moveAppointment: (i) =>
			guarded(p.appointment, "moveAppointment", () => port.moveAppointment(i)),
		cancelAppointment: (i) =>
			guarded(p.nothing, "cancelAppointment", () => port.cancelAppointment(i)),
		markAttendance: (i) => guarded(p.appointment, "markAttendance", () => port.markAttendance(i)),
		packages: (id) => guarded(p.packages, "packages", () => port.packages(id)),
		recordPayment: (i) => guarded(p.payment, "recordPayment", () => port.recordPayment(i)),
		roster: (q) => guarded(p.roster, "roster", () => port.roster(q)),
		requestLeave: (i) => guarded(p.nothing, "requestLeave", () => port.requestLeave(i)),
		webRequests: (q) => guarded(p.webRequests, "webRequests", () => port.webRequests(q)),
		webRequest: (id) => guarded(p.webRequest, "webRequest", () => port.webRequest(id)),
		markRequestHandled: (i) =>
			guarded(p.nothing, "markRequestHandled", () => port.markRequestHandled(i)),
		reminderTargets: (d) =>
			guarded(p.reminderTargets, "reminderTargets", () => port.reminderTargets(d)),
		sendReminder: (i) => guarded(p.reminderSent, "sendReminder", () => port.sendReminder(i)),
		searchNotes: (q) => guarded(p.notes, "searchNotes", () => port.searchNotes(q)),
		stats: (q) => guarded(p.stats, "stats", () => port.stats(q)),
		roomsAt: (q) => guarded(p.roomsAt, "roomsAt", () => port.roomsAt(q)),
		activity: (q) => guarded(p.activity, "activity", () => port.activity(q)),
		bookings: (q) => guarded(p.bookings, "bookings", () => port.bookings(q)),
		capabilities: () => guarded(p.capabilities, "capabilities", () => port.capabilities()),
		callRoute: (c) => guarded(p.route, "callRoute", () => port.callRoute(c)),
		attention: (q) => guarded(p.attention, "attention", () => port.attention(q)),
	};
}
