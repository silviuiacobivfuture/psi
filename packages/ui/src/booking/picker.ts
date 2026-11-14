import {
	decodeSlot,
	type PauseNotice,
	type ServiceInfo,
	type VisitorSchedulingClient,
} from "@psi/scheduling";
import { z } from "zod";
import {
	addDays,
	isLocalDate,
	localDate,
	mondayOf,
	type PickerSlot,
	type SlotMode,
} from "../slot-week";

/**
 * What the booking picker shows, read from the scheduling store for one request. The visitor's
 * browser sends only choices (a service, a week, a day, a mode, a practitioner, a slot id); every
 * one is parsed, checked against the store's current answer, and dropped when it does not hold. A
 * slot id the browser sends is never trusted: it is shown as chosen only when this very request
 * found it free, for this service and mode.
 */

/** How many weeks ahead the picker lets a visitor look. */
export const HORIZON_WEEKS = 12;
/** The widest offset a time zone has from UTC, so a query covers the whole local week. */
const ZONE_SLACK_MS = 14 * 3_600_000;
const SLOT_LIMIT = 200;

const SERVICE = /^[a-z0-9][a-z0-9-]{1,40}$/;

/** A field that is the empty string unless it parses: bad input is the same as no input. */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
	schema.or(z.literal("")).catch("") as z.ZodType<z.infer<T> | "">;

/** The picker's choices as a form sends them. */
export const PickerChoices = z.object({
	service: optional(z.string().regex(SERVICE)),
	/** The service the picker on screen was built for: a different `service` starts over. */
	shown: optional(z.string().regex(SERVICE)),
	week: optional(z.string().refine(isLocalDate)),
	day: optional(z.string().refine(isLocalDate)),
	mode: optional(z.enum(["onsite", "online"])),
	who: optional(z.string().regex(/^[a-z0-9]{10,64}$/)),
	slot: optional(z.string().max(120)),
});
export type PickerChoices = z.infer<typeof PickerChoices>;

export interface PickerData {
	services: ReadonlyArray<ServiceInfo>;
	service: ServiceInfo;
	timeZone: string;
	today: string;
	week: string;
	prevWeek: string | undefined;
	nextWeek: string | undefined;
	slots: ReadonlyArray<PickerSlot>;
	day: string;
	mode: SlotMode;
	who: string;
	selected: string | undefined;
	/** The visitor's time was taken before this answer. */
	taken: boolean;
	/** When the week is empty: the first week that has times. */
	nextWithTimes: string | undefined;
}

/**
 * `unavailable`: the store could not be read or offers nothing: the callback form stands in. `paused`: the clinic stopped
 * online booking (everything, or the service shown): its message stands instead of the times, the service cards stay so
 * another service can be chosen, and the callback form stands only while the pause keeps callbacks open.
 */
export type PickerView =
	| { kind: "ready"; data: PickerData }
	| { kind: "unavailable" }
	| {
			kind: "paused";
			pause: PauseNotice;
			timeZone: string;
			services: ReadonlyArray<ServiceInfo>;
			service: ServiceInfo | undefined;
	  };

/** What the picker reads: the services and their free times (the site's client over the scheduling service). */
export type PickerClient = Pick<VisitorSchedulingClient, "services" | "findSlots">;

export interface Picker {
	/** False when scheduling is not configured: the forms are the callback form alone. */
	readonly enabled: boolean;
	view(choices: PickerChoices, preferred?: string): Promise<PickerView>;
	/** The store's active services, or none when it cannot be read. */
	services(): Promise<ReadonlyArray<ServiceInfo>>;
}

function utc(date: string): number {
	return Date.parse(`${date}T00:00:00Z`);
}

export function pickService(
	services: ReadonlyArray<ServiceInfo>,
	...wanted: ReadonlyArray<string | undefined>
): ServiceInfo | undefined {
	for (const slug of wanted) {
		const hit = services.find((s) => s.slug === slug);
		if (hit !== undefined) return hit;
	}
	return services.find((s) => s.slug === "evaluation") ?? services[0];
}

function pickMode(service: ServiceInfo, wanted: string): SlotMode {
	if (wanted === "onsite" || wanted === "online") {
		if (service.modes.includes(wanted)) return wanted;
	}
	return service.modes.includes("onsite") ? "onsite" : (service.modes[0] ?? "onsite");
}

/** The picker for one tenant, over one scheduling client. Without a client, every view is unavailable. */
export function createPicker(
	client: PickerClient | undefined,
	tenant: string,
	now: () => number = Date.now,
	log: (error: unknown) => void = () => {},
): Picker {
	async function catalogue() {
		if (client === undefined) return undefined;
		try {
			const found = await client.services(tenant);
			return found === undefined || found.services.length === 0 ? undefined : found;
		} catch (error) {
			log(error);
			return undefined;
		}
	}
	return {
		enabled: client !== undefined,
		async services() {
			return (await catalogue())?.services ?? [];
		},
		async view(choices, preferred) {
			if (client === undefined) return { kind: "unavailable" };
			const found = await catalogue();
			if (found === undefined) return { kind: "unavailable" };
			const service = pickService(found.services, choices.service, preferred);
			const paused = (pause: PauseNotice): PickerView => ({
				kind: "paused",
				pause,
				timeZone: found.timeZone,
				services: found.services,
				service,
			});
			if (found.pause !== undefined) return paused(found.pause);
			if (service === undefined) return { kind: "unavailable" };
			if (service.pause !== undefined) return paused(service.pause);
			// Another service than the one on screen: nothing carries over.
			const same = choices.shown === "" || choices.shown === service.slug;
			const kept = same ? choices : { ...choices, week: "", day: "", slot: "", who: "", mode: "" };
			const timeZone = found.timeZone;
			const instant = now();
			const today = localDate(instant, timeZone);
			const thisWeek = mondayOf(today);
			const lastWeek = addDays(thisWeek, HORIZON_WEEKS * 7);
			const asked = kept.week === "" ? thisWeek : mondayOf(kept.week);
			const week = asked < thisWeek ? thisWeek : asked > lastWeek ? lastWeek : asked;
			const mode = pickMode(service, kept.mode);
			const who = service.practitioners.some((p) => p.id === kept.who) ? kept.who : "";
			const weekEnd = addDays(week, 7);
			try {
				const offered = await client.findSlots({
					tenant,
					service: service.slug,
					from: Math.max(utc(week) - ZONE_SLACK_MS, instant),
					to: utc(weekEnd) + ZONE_SLACK_MS,
					mode,
					limit: SLOT_LIMIT,
					now: instant,
				});
				if (!offered.ok)
					return offered.reason === "paused" ? paused(offered.pause) : { kind: "unavailable" };
				const slots: PickerSlot[] = [];
				for (const slot of offered.slots) {
					const ref = decodeSlot(slot.id);
					if (ref === undefined || ref.mode !== mode) continue;
					if (who !== "" && ref.practitioner !== who) continue;
					const date = localDate(slot.start, timeZone);
					if (date < week || date >= weekEnd || slot.start < instant) continue;
					slots.push({
						id: slot.id,
						start: slot.start,
						practitioner: ref.practitioner,
						practitionerName: slot.practitionerName,
						mode,
					});
				}
				// The chosen time counts only if this answer has it, on the day it is shown for.
				const wanted = kept.slot === "" ? undefined : decodeSlot(kept.slot);
				const live = wanted === undefined ? undefined : slots.find((s) => s.id === kept.slot);
				const wantedDate = wanted === undefined ? "" : localDate(wanted.start, timeZone);
				const taken =
					wanted !== undefined &&
					live === undefined &&
					wanted.mode === mode &&
					(who === "" || wanted.practitioner === who) &&
					wantedDate >= week &&
					wantedDate < weekEnd;
				const days = new Set(slots.map((s) => localDate(s.start, timeZone)));
				const liveDate = live === undefined ? undefined : localDate(live.start, timeZone);
				const day =
					kept.day !== "" && days.has(kept.day)
						? kept.day
						: kept.day === "" && liveDate !== undefined
							? liveDate
							: ([...days].sort()[0] ?? week);
				const selected = live !== undefined && liveDate === day ? live.id : undefined;
				let nextWithTimes: string | undefined;
				if (slots.length === 0) {
					const later = await client.findSlots({
						tenant,
						service: service.slug,
						from: utc(weekEnd),
						to: utc(addDays(lastWeek, 7)),
						mode,
						limit: 1,
						now: instant,
					});
					const first = later.ok ? later.slots[0] : undefined;
					nextWithTimes =
						first === undefined ? undefined : mondayOf(localDate(first.start, timeZone));
				}
				return {
					kind: "ready",
					data: {
						services: found.services,
						service,
						timeZone,
						today,
						week,
						prevWeek: week > thisWeek ? addDays(week, -7) : undefined,
						nextWeek: week < lastWeek ? addDays(week, 7) : undefined,
						slots,
						day,
						mode,
						who,
						selected,
						taken,
						nextWithTimes,
					},
				};
			} catch (error) {
				log(error);
				return { kind: "unavailable" };
			}
		},
	};
}
