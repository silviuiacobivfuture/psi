import { encodeSlot, type Mode, type SchedulingClient, type ServiceInfo } from "@psi/scheduling";

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

export function store(free: Free[], options: { down?: boolean; empty?: boolean } = {}) {
	const searches: unknown[] = [];
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
		hold: async () => ({ ok: false, reason: "slot_taken" }),
		submit: async () => ({ ok: false, reason: "not_found" }),
		release: async () => ({ ok: false, reason: "not_found" }),
		cancel: async () => ({ ok: false, reason: "not_found" }),
	};
	return { client, searches };
}
