import { z } from "zod";
import { BRANDS } from "../authz/types";

/**
 * The Scheduling setup as one plain, serialisable value (it crosses from the server to the page),
 * and what "ready" means and why a service shows no times: decided here, once, for the page and
 * the overview. No runtime imports, so the page can use it in the browser.
 */
const Mode = z.enum(["onsite", "online"]);
export type SetupMode = z.infer<typeof Mode>;

const Rule = z.object({
	id: z.string(),
	weekday: z.number().int().min(1).max(7),
	start: z.number().int(),
	end: z.number().int(),
	modes: z.array(Mode),
	/** Holds only between two dates: shown on its own, never rewritten by the week grid. */
	dated: z.boolean(),
	/** Only in the alternating week A or B. */
	week: z.enum(["A", "B"]).optional(),
	/** A period schedule: replaces the regular week between its dates. */
	override: z.boolean().optional(),
	validFrom: z.string().optional(),
	validUntil: z.string().optional(),
});
export type SetupRule = z.infer<typeof Rule>;

const Exception = z.object({
	id: z.string(),
	date: z.string(),
	kind: z.enum(["closed", "open"]),
	start: z.number().int().optional(),
	end: z.number().int().optional(),
});
export type SetupException = z.infer<typeof Exception>;

const Practitioner = z.object({
	id: z.string(),
	slug: z.string(),
	name: z.string(),
	active: z.boolean(),
	/** A contractor: the team sees it, a visitor never does. */
	external: z.boolean(),
	/** The rooms this person may use; empty means any suitable room. */
	rooms: z.array(z.string()),
	/** A Monday when alternating weeks are on (its week is A), else null. */
	abAnchor: z.string().nullable(),
	/** Null when this person's hours could not be read just now. */
	rules: z.array(Rule).nullable(),
	exceptions: z.array(Exception),
});
export type SetupPractitioner = z.infer<typeof Practitioner>;

const Service = z.object({
	id: z.string(),
	slug: z.string(),
	name: z.object({ ro: z.string(), en: z.string() }).nullable(),
	durationMinutes: z.number().int(),
	bufferMinutes: z.number().int(),
	stepMinutes: z.number().int(),
	minNoticeMinutes: z.number().int(),
	horizonDays: z.number().int(),
	holdMinutes: z.number().int(),
	modes: z.array(Mode),
	location: z.string().optional(),
	practitioners: z.array(z.string()),
	active: z.boolean(),
	/** An onsite session needs a room of this kind; null: no room. */
	roomKind: z.string().nullable(),
	roomEquipment: z.array(z.string()),
	roomAudiences: z.array(z.enum(["child", "teen", "adult"])),
});
export type SetupService = z.infer<typeof Service>;

const Room = z.object({
	id: z.string(),
	slug: z.string(),
	name: z.string(),
	kind: z.string(),
	capacity: z.number().int(),
	suits: z.array(z.enum(["child", "teen", "adult"])),
	equipment: z.array(z.string()),
	active: z.boolean(),
	closures: z.array(
		z.object({
			id: z.string(),
			date: z.string(),
			start: z.number().int().optional(),
			end: z.number().int().optional(),
		}),
	),
});
export type SetupRoom = z.infer<typeof Room>;

export const SetupSchema = z.object({
	brand: z.enum(BRANDS),
	tenant: z.string(),
	/** False while the store has no row for the tenant: a production deployment's first day. */
	exists: z.boolean(),
	timeZone: z.string(),
	today: z.string(),
	practitioners: z.array(Practitioner),
	services: z.array(Service),
	rooms: z.array(Room),
});
export type SetupState = z.infer<typeof SetupSchema>;

/** Why a service offers no times, from the setup alone; null when nothing in the setup explains it. */
export type EmptyReason =
	| "service_off"
	| "no_practitioner"
	| "practitioner_off"
	| "no_hours"
	| "no_room"
	| "none_in_window";

export function whyEmpty(state: SetupState, service: SetupService): EmptyReason {
	if (!service.active) return "service_off";
	const team = state.practitioners.filter((p) => service.practitioners.includes(p.id));
	if (team.length === 0) return "no_practitioner";
	const active = team.filter((p) => p.active);
	if (active.length === 0) return "practitioner_off";
	if (active.every((p) => (p.rules ?? []).length === 0)) return "no_hours";
	const onsiteOnly = service.modes.every((m) => m === "onsite");
	if (
		onsiteOnly &&
		service.roomKind !== null &&
		!state.rooms.some((r) => r.active && r.kind === service.roomKind)
	) {
		return "no_room";
	}
	return "none_in_window";
}

/** True when a visitor could be offered a time: an active service, an active person, some hours. */
export function isReady(state: SetupState): boolean {
	return state.services.some((s) => s.active && whyEmpty(state, s) === "none_in_window");
}

/** A practitioner's name turned into a slug: lowercase ASCII, digits and hyphens, 2 to 41 characters. */
export function slugify(name: string): string {
	const base = name
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 36)
		.replace(/-+$/g, "");
	return base.length >= 2 ? base : `${base || "x"}-1`.slice(0, 41);
}
