import { accountHashOf, encodeSlot, sha256 } from "@psi/scheduling";
import {
	canonicalCode,
	generateSlots,
	makeReference,
	makeToken,
	type ServiceSpec,
	type WeeklyRule,
} from "@psi/scheduling/domain";
import { newId } from "./ids";
import type { Collection, Failed, OfferedSlot, RequestsPort, Rows, VisitorPort } from "./types";

type Status =
	| "held"
	| "requested"
	| "confirmed"
	| "declined"
	| "cancelled"
	| "callback"
	| "handled";
interface Req {
	id: string;
	app: string;
	reference: string;
	status: Status;
	personId?: string;
	serviceSlug?: string;
	start: number;
	end: number;
	mode: "onsite" | "online";
	expiresAt?: number;
	holdHash?: string;
	cancelHash?: string;
	contact?: { name: string; email?: string | undefined; phone?: string | undefined };
	accountHash?: string;
	/** Left as a callback (a contact and no slot): listed by when it came, never with a start. */
	callback?: true;
	createdAt: number;
}

const MINUTE = 60_000;
const HOLD_MINUTES = 10;
/** Memory mode only: every practitioner works Monday to Friday, 09:00-17:00 (the Convex store holds the real rules). */
const WEEK: WeeklyRule[] = [1, 2, 3, 4, 5].map((weekday) => ({
	weekday,
	start: 540,
	end: 1020,
	modes: ["onsite", "online"],
}));

type Cs = { [K in keyof Rows]: Collection<Rows[K]> };

/** The visitor flow and the web requests, over the in-memory collections: for tests and the local run. */
export function createMemoryVisitor(
	c: Cs,
	clock: () => number,
): { visitor: VisitorPort; requests: RequestsPort; state: () => unknown } {
	const reqs = new Map<string, Req>();

	const live = (r: Req): boolean =>
		r.status === "requested" ||
		r.status === "confirmed" ||
		(r.status === "held" && (r.expiresAt ?? 0) > clock());

	async function zone(app: string): Promise<string | undefined> {
		return (await c.apps.get(app, app))?.timeZone;
	}

	async function spec(
		app: string,
		slug: string,
	): Promise<
		| {
				id: string;
				spec: ServiceSpec;
				people: { id: string; name: string }[];
				name: { ro: string; en: string };
		  }
		| undefined
	> {
		const service = (await c.services.list(app)).find((s) => s.slug === slug && s.active);
		if (service === undefined) return undefined;
		const people = (await c.people.list(app))
			.filter((p) => p.active && service.practitionerIds.includes(p.id))
			.map((p) => ({ id: p.id, name: p.displayName }));
		return {
			id: service.id,
			name: service.name,
			people,
			spec: {
				durationMinutes: service.durationMinutes,
				bufferMinutes: service.bufferMinutes,
				stepMinutes: 30,
				minNoticeMinutes: 60,
				horizonDays: 90,
				holdMinutes: HOLD_MINUTES,
				modes: service.modes,
			},
		};
	}

	async function busyOf(
		app: string,
		personId: string,
		buffer: number,
	): Promise<{ start: number; until: number }[]> {
		const taken = [...reqs.values()]
			.filter((r) => r.app === app && r.personId === personId && live(r))
			.map((r) => ({ start: r.start, until: r.end + buffer * MINUTE }));
		const booked = (await c.appointments.list(app, { eq: { practitionerId: personId } }))
			.filter((a) => a.status !== "cancelled")
			.map((a) => ({ start: a.start, until: a.end + buffer * MINUTE }));
		return [...taken, ...booked];
	}

	async function offered(
		app: string,
		slug: string,
		from: number,
		to: number,
		mode?: "onsite" | "online",
		only?: string,
	): Promise<
		| {
				ok: true;
				timeZone: string;
				slots: OfferedSlot[];
				found: NonNullable<Awaited<ReturnType<typeof spec>>>;
		  }
		| Failed
	> {
		const found = await spec(app, slug);
		const timeZone = await zone(app);
		if (found === undefined || timeZone === undefined)
			return { ok: false, reason: "unknown_service" };
		const slots: OfferedSlot[] = [];
		for (const person of found.people.filter((p) => only === undefined || p.id === only)) {
			const busy = await busyOf(app, person.id, found.spec.bufferMinutes);
			for (const slot of generateSlots({
				timeZone,
				service: found.spec,
				rules: WEEK,
				exceptions: [],
				busy,
				from,
				to,
				now: clock(),
				...(mode ? { mode } : {}),
			})) {
				for (const m of slot.modes)
					if (mode === undefined || m === mode)
						slots.push({
							id: encodeSlot({ practitioner: person.id, start: slot.start, mode: m }),
							practitioner: person.id,
							practitionerName: person.name,
							start: slot.start,
							end: slot.end,
							modes: [...slot.modes],
						});
			}
		}
		return { ok: true, timeZone, slots: slots.sort((a, b) => a.start - b.start), found };
	}

	const byReference = (app: string, reference: string): Req | undefined => {
		const code = canonicalCode(reference, 8);
		return [...reqs.values()].find(
			(r) => r.app === app && code !== undefined && r.reference === code,
		);
	};

	const visitor: VisitorPort = {
		async services(app) {
			const timeZone = await zone(app);
			if (timeZone === undefined) return undefined;
			const services = (await c.services.list(app)).filter((s) => s.active);
			const people = await c.people.list(app);
			return {
				timeZone,
				services: services.map((s) => ({
					slug: s.slug,
					name: s.name,
					durationMinutes: s.durationMinutes,
					modes: s.modes,
					practitioners: people
						.filter((p) => p.active && s.practitionerIds.includes(p.id))
						.map((p) => ({ id: p.id, name: p.displayName })),
				})),
			};
		},
		async slots(app, q) {
			const out = await offered(app, q.service, q.from, q.to, q.mode);
			if (!out.ok) return out;
			return {
				ok: true,
				timeZone: out.timeZone,
				service: {
					slug: q.service,
					durationMinutes: out.found.spec.durationMinutes,
					holdMinutes: HOLD_MINUTES,
				},
				slots: out.slots.slice(0, q.limit ?? 50),
			};
		},
		async hold(app, input) {
			const out = await offered(
				app,
				input.service,
				input.start,
				input.start + 1,
				input.mode,
				input.practitioner,
			);
			if (!out.ok) return out;
			const slot = out.slots.find((s) => s.start === input.start && s.modes.includes(input.mode));
			if (slot === undefined) {
				const person = out.found.people.find((p) => p.id === input.practitioner);
				if (person === undefined) return { ok: false, reason: "not_offered" };
				const busy = await busyOf(app, person.id, out.found.spec.bufferMinutes);
				return {
					ok: false,
					reason: busy.some(
						(b) =>
							b.start < input.start + out.found.spec.durationMinutes * MINUTE &&
							input.start < b.until,
					)
						? "slot_taken"
						: "not_offered",
				};
			}
			const holdToken = makeToken();
			const r: Req = {
				id: newId("q"),
				app,
				reference: makeReference(),
				status: "held",
				personId: input.practitioner,
				serviceSlug: input.service,
				start: slot.start,
				end: slot.end,
				mode: input.mode,
				expiresAt: clock() + HOLD_MINUTES * MINUTE,
				holdHash: sha256(holdToken),
				createdAt: clock(),
			};
			reqs.set(r.id, r);
			return {
				ok: true,
				reference: r.reference,
				holdToken,
				start: r.start,
				end: r.end,
				mode: r.mode,
				expiresAt: r.expiresAt ?? 0,
				practitionerName: slot.practitionerName,
				timeZone: out.timeZone,
			};
		},
		async release(app, reference, holdToken) {
			const r = byReference(app, reference);
			if (r === undefined || r.status !== "held" || r.holdHash !== sha256(holdToken))
				return { ok: false, reason: "not_found" };
			if ((r.expiresAt ?? 0) <= clock()) return { ok: false, reason: "hold_expired" };
			r.status = "cancelled";
			return { ok: true };
		},
		async submit(app, input) {
			const r = byReference(app, input.reference);
			if (r === undefined || r.status !== "held" || r.holdHash !== sha256(input.holdToken))
				return { ok: false, reason: "not_found" };
			if ((r.expiresAt ?? 0) <= clock()) return { ok: false, reason: "hold_expired" };
			if (input.contact.email === undefined && input.contact.phone === undefined)
				return { ok: false, reason: "invalid" };
			const cancelCode = makeToken();
			Object.assign(r, {
				status: "requested",
				cancelHash: sha256(cancelCode),
				contact: input.contact,
				...(input.subject === undefined ? {} : { accountHash: accountHashOf(input.subject) }),
			});
			delete r.expiresAt;
			return {
				ok: true,
				reference: r.reference,
				cancelCode,
				start: r.start,
				end: r.end,
				mode: r.mode,
				timeZone: (await zone(app)) ?? "UTC",
			};
		},
		async cancel(app, reference, cancelCode) {
			const r = byReference(app, reference);
			if (
				r === undefined ||
				r.cancelHash !== sha256(cancelCode) ||
				(r.status !== "requested" && r.status !== "confirmed")
			)
				return { ok: false, reason: "not_found" };
			r.status = "cancelled";
			return { ok: true, start: r.start };
		},
		async callback(app, input) {
			const r: Req = {
				id: newId("q"),
				app,
				reference: makeReference(),
				status: "callback",
				callback: true,
				start: clock(),
				end: clock(),
				mode: "onsite",
				contact: input.contact,
				createdAt: clock(),
			};
			reqs.set(r.id, r);
			return { reference: r.reference };
		},
		async mine(app, subject) {
			const hash = accountHashOf(subject);
			return [...reqs.values()]
				.filter((r) => r.app === app && r.accountHash === hash && r.status !== "held")
				.map((r) => ({
					id: r.id,
					reference: r.reference,
					status: r.status,
					start: r.start,
					end: r.end,
					mode: r.mode,
					...(r.serviceSlug === undefined ? {} : { serviceSlug: r.serviceSlug }),
				}));
		},
		async cancelMine(app, subject, id) {
			const r = reqs.get(id);
			if (
				r === undefined ||
				r.app !== app ||
				r.accountHash !== accountHashOf(subject) ||
				(r.status !== "requested" && r.status !== "confirmed")
			)
				return { ok: false, reason: "not_found" };
			r.status = "cancelled";
			return { ok: true };
		},
	};

	const requests: RequestsPort = {
		async list(app, from, to) {
			return [...reqs.values()]
				.filter(
					(r) =>
						r.app === app &&
						r.status !== "held" &&
						(r.callback === true ? r.createdAt : r.start) >= from &&
						(r.callback === true ? r.createdAt : r.start) < to,
				)
				.map((r) => ({
					reference: r.reference,
					status:
						r.status === "callback" || r.status === "held" ? ("requested" as const) : r.status,
					...(r.callback === true ? {} : { start: r.start, end: r.end }),
					...(r.serviceSlug === undefined ? {} : { serviceSlug: r.serviceSlug }),
					createdAt: r.createdAt,
					...(r.contact === undefined
						? {}
						: {
								contact: {
									name: r.contact.name,
									...(r.contact.phone === undefined ? {} : { phone: r.contact.phone }),
									...(r.contact.email === undefined ? {} : { email: r.contact.email }),
								},
							}),
				}));
		},
		async pending(app) {
			return [...reqs.values()].filter(
				(r) => r.app === app && (r.status === "requested" || r.status === "callback"),
			).length;
		},
		async decide(app, reference, decision, _reason, actor) {
			const r = byReference(app, reference);
			if (r === undefined) return { ok: false, reason: "not_found" };
			// A callback can only be called back, once: there is no slot to confirm and no booking to decline.
			if (r.callback === true) {
				if (decision !== "handle" || r.status !== "callback")
					return { ok: false, reason: "not_allowed" };
				r.status = "handled";
				return { ok: true };
			}
			if (decision === "handle") return { ok: false, reason: "not_allowed" };
			if (r.status !== "requested" && r.status !== "confirmed")
				return { ok: false, reason: "not_found" };
			if (decision === "confirm") {
				if (r.status !== "requested") return { ok: false, reason: "not_allowed" };
				r.status = "confirmed";
				if (r.personId !== undefined) {
					const now = clock();
					await c.appointments.insert({
						id: newId("a"),
						app,
						kind: "session",
						status: "scheduled",
						practitionerId: r.personId,
						start: r.start,
						end: r.end,
						note: `web request ${r.reference} confirmed by ${actor}`,
						createdAt: now,
						updatedAt: now,
					});
				}
				return { ok: true };
			}
			r.status = decision === "decline" ? "declined" : "cancelled";
			return { ok: true };
		},
	};

	return { visitor, requests, state: () => [...reqs.values()] };
}
