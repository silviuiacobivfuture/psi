import { DAY_MINUTES, isLocalDate, resolveLocal } from "@psi/scheduling/domain";
import { z } from "zod";
import type { PauseReason } from "../lib/availability-words";
import type { OneOffEntry, PauseInput, RoomClosureInput } from "../port/availability-port";
import { flag } from "./define";

/**
 * The parameters of the availability and booking-pause actions, as the page's forms post them (and the assistant may
 * send them), and what each becomes for the service. Times are the clinic's wall clock: minutes after midnight for
 * the hours, a `datetime-local` read in the clinic's zone (the first of a repeated hour, none in a skipped one) for a
 * pause.
 */
const Id = z.string().min(1).max(100);
const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const OptionalDate = z
	.string()
	.regex(/^(\d{4}-\d{2}-\d{2})?$/)
	.optional()
	.transform((v) => (v === undefined || v === "" ? undefined : v));
const Clock = z
	.string()
	.regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/)
	.optional()
	.transform((v) => (v === undefined || v === "" ? undefined : v));
/** A list a form sends as repeated fields (none, one or many). */
const Ids = z
	.union([Id, z.array(Id)])
	.optional()
	.transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]));

const Mode = z.enum(["onsite", "online"]);
export const RuleParam = z.object({
	weekday: z.number().int(),
	start: z.number().int(),
	end: z.number().int(),
	modes: z.array(Mode).max(2),
	validFrom: DateKey.optional(),
	validUntil: DateKey.optional(),
	week: z.enum(["A", "B"]).optional(),
	override: z.boolean().optional(),
});

export const RulesParams = z.object({ person: Id, rules: z.array(RuleParam).max(120) });
export const CopyParams = z.object({ person: Id, to: Ids });
export const OneOffParams = z.object({
	person: Id,
	also: Ids,
	from: DateKey,
	until: OptionalDate,
	kind: z.enum(["closed-day", "closed-part", "open"]),
	start: Clock,
	end: Clock,
	onsite: flag,
	online: flag,
});
export const OneOffRemoveParams = z.object({ person: Id, entry: z.string().min(3).max(64) });
export const ClosureParams = z.object({
	room: Id,
	from: DateKey,
	until: OptionalDate,
	part: flag,
	start: Clock,
	end: Clock,
});
export const ClosureRemoveParams = z.object({ room: Id, closure: z.string().min(3).max(64) });

const LocalStamp = z
	.string()
	.regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?)?$/)
	.optional()
	.transform((v) => (v === undefined || v === "" ? undefined : v.slice(0, 16)));
const Text = z.string().max(600).optional().default("");
export const PauseParams = z.object({
	level: z.enum(["organisation", "site", "service", "practitioner"]),
	site: z.string().max(42).optional().default(""),
	service: z.string().max(42).optional().default(""),
	practitioner: z.string().max(100).optional().default(""),
	when: z.enum(["now", "window"]).default("now"),
	from: LocalStamp,
	until: LocalStamp,
	messageRo: Text,
	messageEn: Text,
	/** The words the form was prefilled with: kept as they are, the pause keeps the service's default instead. */
	defaultRo: Text,
	defaultEn: Text,
	callbacksOpen: flag,
	blockStaff: flag,
});
export const PauseUpdateParams = PauseParams.extend({ id: Id });
export const PauseRemoveParams = z.object({ id: Id });

const minutes = (clock: string | undefined, end: boolean): number | undefined => {
	if (clock === undefined) return undefined;
	const [h = 0, m = 0] = clock.split(":").map(Number);
	const total = h * 60 + m;
	return end && total === 0 ? DAY_MINUTES : total;
};

/** The one-off entry a form describes: closed all day, closed for part of it, or open for extra hours. */
export function entryOf(p: z.output<typeof OneOffParams>): OneOffEntry {
	const start = minutes(p.start, false);
	const end = minutes(p.end, true);
	const until = p.until === undefined || p.until === p.from ? {} : { until: p.until };
	if (p.kind === "closed-day") return { from: p.from, ...until, kind: "closed" };
	const times = {
		...(start === undefined ? {} : { start }),
		...(end === undefined ? {} : { end }),
	};
	if (p.kind === "closed-part") return { from: p.from, ...until, kind: "closed", ...times };
	const modes = [
		...(p.onsite ? (["onsite"] as const) : []),
		...(p.online ? (["online"] as const) : []),
	];
	return { from: p.from, ...until, kind: "open", ...times, modes };
}

export function closureOf(p: z.output<typeof ClosureParams>): RoomClosureInput {
	const until = p.until === undefined || p.until === p.from ? {} : { until: p.until };
	if (!p.part) return { from: p.from, ...until };
	const start = minutes(p.start, false);
	const end = minutes(p.end, true);
	return {
		from: p.from,
		...until,
		...(start === undefined ? {} : { start }),
		...(end === undefined ? {} : { end }),
	};
}

/** The instant a `datetime-local` names in the zone: none for a time the clocks skip, the first of a repeated one. */
export function instantOfLocal(
	stamp: string,
	timeZone: string,
): { ok: number } | { reason: PauseReason } {
	const [date = "", clock = ""] = stamp.split("T");
	if (!isLocalDate(date)) return { reason: "bad_time" };
	const [h = 0, m = 0] = clock.split(":").map(Number);
	const resolved = resolveLocal(date, h * 60 + m, timeZone);
	switch (resolved.kind) {
		case "exact":
			return { ok: resolved.instant };
		case "ambiguous":
			return { ok: resolved.earlier };
		case "gap":
			return { reason: "dst_gap" };
		default: {
			const never: never = resolved;
			return never;
		}
	}
}

/** What a pause form asks the service for, or the reason the form itself cannot say it. */
export function pauseOf(
	p: z.output<typeof PauseParams>,
	timeZone: string,
): { ok: PauseInput } | { reason: PauseReason } {
	const scope =
		p.level === "organisation"
			? { level: p.level }
			: p.level === "site"
				? p.site === ""
					? null
					: { level: p.level, site: p.site }
				: p.level === "service"
					? p.service === ""
						? null
						: { level: p.level, service: p.service }
					: p.practitioner === ""
						? null
						: { level: p.level, practitionerId: p.practitioner };
	if (scope === null) return { reason: "no_target" };
	const from =
		p.when === "window" && p.from !== undefined ? instantOfLocal(p.from, timeZone) : null;
	if (p.when === "window" && p.from === undefined) return { reason: "bad_time" };
	if (from !== null && "reason" in from) return from;
	const until = p.until === undefined ? null : instantOfLocal(p.until, timeZone);
	if (until !== null && "reason" in until) return until;
	const ro = p.messageRo.trim();
	const en = p.messageEn.trim();
	// Untouched default words (or none at all): the service's own default, which follows `callbacksOpen`.
	const ownWords =
		!(ro === p.defaultRo.trim() && en === p.defaultEn.trim()) && !(ro === "" && en === "");
	return {
		ok: {
			scope,
			...(from === null ? {} : { from: from.ok }),
			...(until === null ? {} : { until: until.ok }),
			...(ownWords ? { message: { ro: ro === "" ? en : ro, en: en === "" ? ro : en } } : {}),
			callbacksOpen: p.callbacksOpen,
			blockStaff: p.blockStaff,
		},
	};
}
