import { accountHashOf } from "@psi/scheduling";
import { makeReference } from "@psi/scheduling/domain";
import { newId } from "./ids";
import type { Req } from "./memory-visitor";
import type { Collection, Failed, Rows, VisitorPort } from "./types";

/** What the signed-in visitor's own requests need from the memory booking flow. */
export interface OwnDeps {
	reqs: Map<string, Req>;
	people: Collection<Rows["people"]>;
	clock: () => number;
	/** How long before its start a booking of this service stops being changed online. */
	noticeOf(app: string, slug: string): Promise<number>;
	/** The slot at `start` for this person and service, when it is offered (the moving request's own time ignored). */
	slotAt(
		app: string,
		input: { service: string; practitioner: string; start: number; mode: "onsite" | "online" },
		except: string,
	): Promise<{ ok: true; start: number; end: number } | Failed>;
}

const changeable = (r: Req): boolean => r.status === "requested" || r.status === "confirmed";

/** A visitor's own requests, by the hash of their account: listed, cancelled, moved to another free time. */
export function ownRequests(
	d: OwnDeps,
): Pick<VisitorPort, "mine" | "cancelMine" | "rescheduleMine"> {
	const ownOf = (app: string, subject: string, id: string): Req | undefined => {
		const r = d.reqs.get(id);
		return r !== undefined && r.app === app && r.accountHash === accountHashOf(subject)
			? r
			: undefined;
	};
	return {
		async mine(app, subject) {
			const hash = accountHashOf(subject);
			const people = await d.people.list(app);
			const mine = [...d.reqs.values()].filter(
				(r) => r.app === app && r.accountHash === hash && r.status !== "held",
			);
			return Promise.all(
				mine.map(async (r) => {
					const person = people.find((p) => p.id === r.personId);
					return {
						id: r.id,
						reference: r.reference,
						status: r.status,
						start: r.start,
						end: r.end,
						mode: r.mode,
						noticeMinutes: r.serviceSlug === undefined ? 0 : await d.noticeOf(app, r.serviceSlug),
						...(r.serviceSlug === undefined ? {} : { serviceSlug: r.serviceSlug }),
						...(person === undefined ? {} : { practitionerName: person.displayName }),
					};
				}),
			);
		},
		async rescheduleMine(app, subject, id, to) {
			const r = ownOf(app, subject, id);
			if (r === undefined || r.serviceSlug === undefined || r.personId === undefined)
				return { ok: false, reason: "not_found" };
			if (!changeable(r)) return { ok: false, reason: "not_allowed" };
			const slot = await d.slotAt(
				app,
				{ service: r.serviceSlug, practitioner: r.personId, start: to.start, mode: to.mode },
				r.id,
			);
			if (!slot.ok) return slot;
			const moved: Req = {
				...r,
				id: newId("q"),
				reference: makeReference(),
				start: slot.start,
				end: slot.end,
				mode: to.mode,
				createdAt: d.clock(),
			};
			r.status = "cancelled";
			d.reqs.set(moved.id, moved);
			return {
				ok: true,
				id: moved.id,
				reference: moved.reference,
				start: moved.start,
				end: moved.end,
			};
		},
		async cancelMine(app, subject, id) {
			const r = ownOf(app, subject, id);
			if (r === undefined || !changeable(r)) return { ok: false, reason: "not_found" };
			r.status = "cancelled";
			return { ok: true };
		},
	};
}
