import {
	type CallbackInput,
	encodeSlot,
	type Mode,
	type SchedulingClient,
	SchedulingUnavailable,
	type ServiceInfo,
} from "@psi/scheduling";

/** A scheduling store double for tests: it answers like the real one, from a list of free times. */
export const ZONE = "Europe/Bucharest";
export const NOW = Date.parse("2026-11-12T08:00:00Z"); // Thursday
export const ANA = "anaaaaaaaaaa1";
export const DAN = "danaaaaaaaaa2";

export const SERVICES: ReadonlyArray<ServiceInfo> = [
	{
		slug: "evaluation",
		name: { ro: "Evaluare", en: "Evaluation" },
		durationMinutes: 60,
		modes: ["onsite", "online"],
		practitioners: [
			{ id: ANA, name: "Ana" },
			{ id: DAN, name: "Dan" },
		],
	},
	{
		slug: "therapy",
		durationMinutes: 50,
		modes: ["onsite"],
		practitioners: [{ id: ANA, name: "Ana" }],
	},
];

export interface Free {
	/** The tenant whose calendar has the time; absent: every tenant's (the single-site tests). */
	tenant?: string;
	service: string;
	practitioner: string;
	start: number;
	mode: Mode;
}

/** One call that reached the store, as it was made: the tenant it carried, when the call has one. */
export interface RecordedCall {
	method: "services" | "findSlots" | "hold" | "submit" | "release" | "cancel" | "requestCallback";
	/** The tenant the call named; for a call that names only a reference, the tenant that reference was held for. */
	tenant: string | undefined;
}

export interface StoreOptions {
	/** Each tenant's own catalogue; a tenant not listed has none. Absent: every tenant has `SERVICES`. */
	catalogues?: Readonly<Record<string, ReadonlyArray<ServiceInfo>>>;
	down?: boolean;
	empty?: boolean;
	/** What the callback table does: stores ("ok", the default), is unreachable, or refuses. */
	callbacks?: "ok" | "down" | "refused";
	/** What a hold does: the time is taken (the default), is held, or the store is unreachable. */
	hold?: "taken" | "ok" | "down";
	/** What submitting a held time does: refuses (the default) or the store is unreachable. */
	submit?: "refused" | "down";
}

export function store(free: Free[], options: StoreOptions = {}) {
	const calls: RecordedCall[] = [];
	/** The tenant each reference was held for: submit, release and cancel carry the reference only. */
	const heldFor = new Map<string, string>();
	const searches: unknown[] = [];
	/** Every callback request that reached the table, as the store would hold it. */
	const callbacks: CallbackInput[] = [];
	const released: string[] = [];
	const client: SchedulingClient = {
		async services(tenant) {
			calls.push({ method: "services", tenant });
			if (options.down) throw new Error("unreachable");
			const own = options.catalogues === undefined ? SERVICES : options.catalogues[tenant];
			return options.empty || own === undefined || own.length === 0
				? undefined
				: { timeZone: ZONE, services: own };
		},
		async findSlots(search) {
			calls.push({ method: "findSlots", tenant: search.tenant });
			searches.push(search);
			if (options.down) throw new Error("unreachable");
			const own = options.catalogues === undefined ? SERVICES : options.catalogues[search.tenant];
			const service = own?.find((s) => s.slug === search.service);
			if (service === undefined) return { ok: false, reason: "unknown_service" };
			const slots = free
				.filter(
					(f) =>
						(f.tenant === undefined || f.tenant === search.tenant) &&
						f.service === search.service &&
						f.start >= search.from &&
						f.start < search.to &&
						(search.mode === undefined || f.mode === search.mode),
				)
				.sort((a, b) => a.start - b.start)
				.slice(0, search.limit ?? 200)
				.map((f) => ({
					id: encodeSlot({
						practitioner: f.practitioner,
						start: f.start,
						mode: f.mode,
					}),
					practitioner: f.practitioner,
					practitionerName: f.practitioner === ANA ? "Ana" : "Dan",
					start: f.start,
					end: f.start + 3_600_000,
					modes: [f.mode],
				}));
			return {
				ok: true,
				timeZone: ZONE,
				service: {
					slug: service.slug,
					durationMinutes: service.durationMinutes,
					holdMinutes: 15,
				},
				slots,
			};
		},
		async hold(input) {
			calls.push({ method: "hold", tenant: input.tenant });
			if (options.hold === "down") throw new SchedulingUnavailable("the scheduling store failed");
			if (options.hold !== "ok") return { ok: false, reason: "slot_taken" };
			heldFor.set("ABCD2345", input.tenant);
			return {
				ok: true,
				reference: "ABCD2345",
				holdToken: "h".repeat(24),
				start: input.start,
				end: input.start + 3_600_000,
				mode: input.mode,
				expiresAt: input.start,
				practitionerName: "Ana",
				timeZone: ZONE,
			};
		},
		async submit(input) {
			calls.push({ method: "submit", tenant: heldFor.get(input.reference) });
			if (options.submit === "down") throw new SchedulingUnavailable("the scheduling store failed");
			return { ok: false, reason: "not_found" };
		},
		async release(input) {
			calls.push({ method: "release", tenant: heldFor.get(input.reference) });
			released.push(input.reference);
			return { ok: false, reason: "not_found" };
		},
		async requestCallback(input) {
			calls.push({ method: "requestCallback", tenant: input.tenant });
			if (options.callbacks === "down") {
				throw new SchedulingUnavailable("Convex at http://store is unreachable: check CONVEX_URL");
			}
			if (options.callbacks === "refused") return { ok: false, reason: "unknown_tenant" };
			callbacks.push(input);
			return { ok: true, id: `cb${callbacks.length}` };
		},
		cancel: async (input) => {
			calls.push({ method: "cancel", tenant: heldFor.get(input.reference) });
			return { ok: false, reason: "not_found" };
		},
	};
	return { client, searches, callbacks, released, calls };
}

/**
 * One tenant's calendar for the isolation tests: a `session` service named after the tenant, one
 * practitioner of its own, and one free time. Two of these in one store (`catalogues` and `free`)
 * let a test see any answer that crossed from one tenant to the other.
 */
export function tenantCalendar(
	tenant: string,
	practitioner: string,
	start: number,
): { catalogue: ReadonlyArray<ServiceInfo>; free: Free[] } {
	return {
		catalogue: [
			{
				slug: "session",
				name: { ro: `Sesiune ${tenant}`, en: `Session ${tenant}` },
				durationMinutes: 60,
				modes: ["onsite"],
				practitioners: [{ id: practitioner, name: `Specialist ${tenant}` }],
			},
		],
		free: [{ tenant, service: "session", practitioner, start, mode: "onsite" }],
	};
}
