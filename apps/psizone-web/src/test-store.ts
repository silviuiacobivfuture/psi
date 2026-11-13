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
	service: string;
	practitioner: string;
	start: number;
	mode: Mode;
}

export interface StoreOptions {
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
	const searches: unknown[] = [];
	/** Every callback request that reached the table, as the store would hold it. */
	const callbacks: CallbackInput[] = [];
	const released: string[] = [];
	const client: SchedulingClient = {
		async services() {
			if (options.down) throw new Error("unreachable");
			return options.empty ? undefined : { timeZone: ZONE, services: SERVICES };
		},
		async findSlots(search) {
			searches.push(search);
			if (options.down) throw new Error("unreachable");
			const service = SERVICES.find((s) => s.slug === search.service);
			if (service === undefined) return { ok: false, reason: "unknown_service" };
			const slots = free
				.filter(
					(f) =>
						f.service === search.service &&
						f.start >= search.from &&
						f.start < search.to &&
						(search.mode === undefined || f.mode === search.mode),
				)
				.sort((a, b) => a.start - b.start)
				.slice(0, search.limit ?? 200)
				.map((f) => ({
					id: encodeSlot({ practitioner: f.practitioner, start: f.start, mode: f.mode }),
					practitioner: f.practitioner,
					practitionerName: f.practitioner === ANA ? "Ana" : "Dan",
					start: f.start,
					end: f.start + 3_600_000,
					modes: [f.mode],
				}));
			return {
				ok: true,
				timeZone: ZONE,
				service: { slug: service.slug, durationMinutes: service.durationMinutes, holdMinutes: 15 },
				slots,
			};
		},
		async hold(input) {
			if (options.hold === "down") throw new SchedulingUnavailable("the scheduling store failed");
			if (options.hold !== "ok") return { ok: false, reason: "slot_taken" };
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
		async submit() {
			if (options.submit === "down") throw new SchedulingUnavailable("the scheduling store failed");
			return { ok: false, reason: "not_found" };
		},
		async release(input) {
			released.push(input.reference);
			return { ok: false, reason: "not_found" };
		},
		async requestCallback(input) {
			if (options.callbacks === "down") {
				throw new SchedulingUnavailable("Convex at http://store is unreachable: check CONVEX_URL");
			}
			if (options.callbacks === "refused") return { ok: false, reason: "unknown_tenant" };
			callbacks.push(input);
			return { ok: true, id: `cb${callbacks.length}` };
		},
		cancel: async () => ({ ok: false, reason: "not_found" }),
	};
	return { client, searches, callbacks, released };
}
