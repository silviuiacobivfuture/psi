import {
	type DayException,
	type OneOffEntry as DomainEntry,
	entryRows,
	generateSlots,
	oneOffProblems,
	weeklyPlanProblems,
} from "@psi/scheduling/domain";
import { m } from "../paraglide/messages.js";
import {
	type AvailabilityPort,
	type AvailabilityRule,
	type BookingPause,
	type OneOffEntry,
	type PauseInput,
	type RoomClosure,
	SaveRefusal,
} from "./availability-port";
import { type ClinicPort, PortError } from "./port";
import type { AppSlug, Column } from "./schema";
import { instantOf } from "./sdk/time";
import type { AppData } from "./seed";

const ZONE = "Europe/Bucharest";
const MINUTE = 60_000;
/** The most pauses an app keeps, ended ones included (the service's own bound). */
const MAX_PAUSES = 50;
const BOTH: AvailabilityRule["modes"] = ["onsite", "online"];

export interface AvailabilityDeps {
	data: (app: AppSlug) => AppData;
	guard: (method: keyof ClinicPort) => void;
	log: (d: AppData, actor: string, action: string, target: string) => void;
	nextId: (prefix: string) => string;
	now: () => number;
}

type Exception = DayException & { id: string };
interface Held {
	rules: Map<string, AvailabilityRule[]>;
	exceptions: Map<string, Exception[]>;
	closures: Map<string, RoomClosure[]>;
	pauses: BookingPause[];
}

const isPractitioner = (c: Column): boolean =>
	c.kind === "person" && c.active !== false && c.bookable !== false;

/**
 * What a practitioner starts with in the fake: their catalogue hours when they have some, else Monday to Friday
 * 09:00-17:00. The first one has a split day and an alternating Saturday, so the editor shows more than one schedule.
 */
function seedRules(column: Column, first: boolean): AvailabilityRule[] {
	if (first)
		return [
			...[1, 2, 3, 4, 5].flatMap((weekday) => [
				{ weekday, start: 540, end: 780, modes: BOTH },
				{ weekday, start: 900, end: 1140, modes: BOTH },
			]),
			{ weekday: 6, start: 600, end: 780, modes: ["onsite"], week: "A" },
		];
	const hours = column.hours;
	if (hours === undefined)
		return [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: 540, end: 1020, modes: BOTH }));
	return hours.flatMap((h, i) =>
		h === null ? [] : [{ weekday: i + 1, start: h.from, end: h.to, modes: BOTH }],
	);
}

const domainEntry = (e: OneOffEntry): DomainEntry => ({
	from: e.from,
	kind: e.kind,
	...(e.until === undefined ? {} : { until: e.until }),
	...(e.start === undefined ? {} : { start: e.start }),
	...(e.end === undefined ? {} : { end: e.end }),
	...(e.modes === undefined ? {} : { modes: e.modes }),
});

const stateOf = (p: Pick<BookingPause, "from" | "until">, now: number): BookingPause["state"] =>
	p.from !== undefined && p.from > now
		? "scheduled"
		: p.until !== undefined && p.until <= now
			? "ended"
			: "active";

const defaultMessage = (callbacksOpen: boolean): BookingPause["message"] => {
	const say = callbacksOpen ? m.av_pause_default_callbacks : m.av_pause_default_call;
	return { ro: say({}, { locale: "ro" }), en: say({}, { locale: "en" }) };
};

/**
 * The availability editor and the booking pauses in the fake: the same validators as the service (the domain's), so a
 * save the service would refuse is refused here with the same problems, and nothing is written.
 */
export function createFakeAvailability(deps: AvailabilityDeps): {
	port: AvailabilityPort;
	/** Refuses a staff booking a pause that blocks staff covers (`conflict`, reason `booking_paused`). */
	refuseStaff(app: AppSlug, columnId: string, serviceId: string): void;
} {
	const { data, guard, log, nextId, now } = deps;
	const apps = new Map<AppSlug, Held>();
	const held = (app: AppSlug): Held => {
		let h = apps.get(app);
		if (h === undefined) {
			const people = data(app).columns.filter(isPractitioner);
			h = {
				rules: new Map(people.map((c, i) => [c.id, seedRules(c, i === 0)])),
				exceptions: new Map(),
				closures: new Map(),
				pauses: [],
			};
			apps.set(app, h);
		}
		return h;
	};
	const practitioner = (app: AppSlug, id: string): void => {
		if (!data(app).columns.some((c) => c.id === id && isPractitioner(c)))
			throw new PortError("not-found", id);
	};
	const room = (app: AppSlug, id: string): void => {
		if (!data(app).columns.some((c) => c.id === id && c.kind === "room"))
			throw new PortError("not-found", id);
	};
	const rulesOf = (app: AppSlug, id: string): AvailabilityRule[] =>
		held(app).rules.get(id) ?? seedRules({ id, kind: "person", name: id, colour: 1 }, false);
	const daysOf = (app: AppSlug, id: string): Exception[] => held(app).exceptions.get(id) ?? [];
	const view = (app: AppSlug, personId: string, from: string) => ({
		personId,
		timeZone: ZONE,
		rules: rulesOf(app, personId).map((r) => ({ ...r, modes: [...r.modes] })),
		exceptions: daysOf(app, personId)
			.filter((e) => e.date >= from)
			.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? 0) - (b.start ?? 0))
			.map(({ modes, ...e }) => ({ ...e, ...(modes === undefined ? {} : { modes: [...modes] }) })),
	});
	const refusePlan = (rules: ReadonlyArray<AvailabilityRule>): void => {
		const problems = weeklyPlanProblems(rules);
		if (problems.length > 0)
			throw new SaveRefusal("the weekly rules have problems", { reason: "plan", problems });
	};
	const sites = (app: AppSlug): string[] => [`${app}-web`];
	const checkPause = (app: AppSlug, input: PauseInput, at: number): void => {
		const start = input.from ?? at;
		const refuse = (reason: string): never => {
			throw new PortError("invalid", reason, [], reason);
		};
		if (input.until !== undefined && input.until <= start) refuse("until_before_from");
		if (input.until !== undefined && input.until <= at) refuse("until_past");
		const scope = input.scope;
		const d = data(app);
		if (scope.level === "site" && !sites(app).includes(scope.site)) refuse("unknown_site");
		if (scope.level === "service" && !d.services.some((s) => s.id === scope.service))
			refuse("unknown_service");
		if (
			scope.level === "practitioner" &&
			!d.columns.some((c) => c.id === scope.practitionerId && isPractitioner(c))
		)
			refuse("unknown_practitioner");
	};
	const shown = (p: BookingPause, at: number): BookingPause => ({ ...p, state: stateOf(p, at) });
	const pauseOf = (input: PauseInput, was: BookingPause | undefined, at: number, id: string) => ({
		id,
		scope: input.scope,
		...(input.from === undefined ? {} : { from: input.from }),
		...(input.until === undefined ? {} : { until: input.until }),
		message: input.message ?? defaultMessage(input.callbacksOpen),
		defaultMessage: input.message === undefined,
		callbacksOpen: input.callbacksOpen,
		blockStaff: input.blockStaff,
		state: stateOf(input, at),
		createdAt: was?.createdAt ?? at,
		createdBy: was?.createdBy ?? "console",
		updatedAt: at,
	});

	const port: AvailabilityPort = {
		async practitioners(app) {
			guard("practitioners");
			return data(app)
				.columns.filter(isPractitioner)
				.map((c) => ({ id: c.id, name: c.name }));
		},
		async bookableServices(app) {
			guard("bookableServices");
			return data(app)
				.services.filter((s) => s.active !== false)
				.map((s) => ({
					slug: s.id,
					name: s.name,
					durationMin: s.durationMin,
					bufferMin: s.bufferMin ?? 0,
				}));
		},
		async availability(app, personId, from) {
			guard("availability");
			practitioner(app, personId);
			return view(app, personId, from);
		},
		async saveRules(app, personId, rules) {
			guard("saveRules");
			practitioner(app, personId);
			refusePlan(rules);
			held(app).rules.set(
				personId,
				rules.map((r) => ({ ...r, modes: [...new Set(r.modes)] })),
			);
			log(data(app), "console", "availability.rules", `calendar:${personId}`);
			return view(app, personId, "0000-01-01");
		},
		async copyRules(app, from, to) {
			guard("copyRules");
			if (to.includes(from) || new Set(to).size !== to.length)
				throw new PortError("invalid", "copy to other practitioners, once each");
			for (const id of [from, ...to]) practitioner(app, id);
			const source = rulesOf(app, from);
			refusePlan(source);
			for (const id of to)
				held(app).rules.set(
					id,
					source.map((r) => ({ ...r, modes: [...r.modes] })),
				);
			log(data(app), "console", "availability.copy", `calendar:${from}`);
			return { items: to.map((personId) => ({ personId, rules: source.length })) };
		},
		async addOneOff(app, personIds, raw) {
			guard("addOneOff");
			if (new Set(personIds).size !== personIds.length)
				throw new PortError("invalid", "each practitioner once");
			for (const id of personIds) practitioner(app, id);
			const entry = domainEntry(raw);
			const problems = personIds.flatMap((personId) =>
				oneOffProblems(entry, daysOf(app, personId), ZONE).map((p) => ({ ...p, personId })),
			);
			if (problems.length > 0)
				throw new SaveRefusal("the entry has problems", { reason: "entry", problems });
			const rows = entryRows(entry);
			for (const id of personIds)
				held(app).exceptions.set(id, [
					...daysOf(app, id),
					...rows.map((row) => ({ ...row, id: nextId("x") })),
				]);
			log(data(app), "console", "availability.one_off_add", `calendar:${personIds[0] ?? ""}`);
			return { items: personIds.map((personId) => ({ personId, added: rows.length })) };
		},
		async removeOneOff(app, personId, entryId) {
			guard("removeOneOff");
			const days = daysOf(app, personId);
			if (!days.some((e) => e.id === entryId)) throw new PortError("not-found", entryId);
			held(app).exceptions.set(
				personId,
				days.filter((e) => e.id !== entryId),
			);
			log(data(app), "console", "availability.one_off_remove", `calendar:${personId}`);
		},
		async availabilityPreview(app, personId, slug, from, to) {
			guard("availabilityPreview");
			practitioner(app, personId);
			if (to <= from || to - from > 8 * 24 * 60 * MINUTE)
				throw new PortError("invalid", "a preview spans at most 8 days");
			const d = data(app);
			const service = d.services.find((s) => s.id === slug && s.active !== false);
			if (service === undefined) throw new PortError("not-found", slug);
			const buffer = service.bufferMin ?? 0;
			const busy = d.appointments
				.filter(
					(a) => a.columnId === personId && (a.status === "confirmed" || a.status === "requested"),
				)
				.map((a) => {
					const start = instantOf(a.date, a.startMin, ZONE);
					return { start, until: start + (a.durationMin + buffer) * MINUTE };
				});
			const at = now();
			const slots = generateSlots({
				timeZone: ZONE,
				service: {
					durationMinutes: service.durationMin,
					bufferMinutes: buffer,
					stepMinutes: 15,
					minNoticeMinutes: 0,
					horizonDays: 120,
					holdMinutes: 10,
					modes: service.online === false ? ["onsite"] : BOTH,
				},
				rules: rulesOf(app, personId),
				exceptions: daysOf(app, personId),
				busy,
				from,
				to,
				now: at,
			});
			const paused = held(app).pauses.some(
				(p) =>
					stateOf(p, at) === "active" &&
					(p.scope.level === "organisation" ||
						p.scope.level === "site" ||
						(p.scope.level === "service" && p.scope.service === slug) ||
						(p.scope.level === "practitioner" && p.scope.practitionerId === personId)),
			);
			return {
				personId,
				timeZone: ZONE,
				service: { slug, durationMinutes: service.durationMin, holdMinutes: 10 },
				from,
				to,
				slots: slots.map((s) => ({ start: s.start, end: s.end, modes: [...s.modes] })),
				paused,
			};
		},
		async roomClosures(app, roomId, from) {
			guard("roomClosures");
			room(app, roomId);
			return (held(app).closures.get(roomId) ?? [])
				.filter((x) => x.date >= from)
				.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? 0) - (b.start ?? 0));
		},
		async addRoomClosure(app, roomId, input) {
			guard("addRoomClosure");
			const entry = domainEntry({ ...input, kind: "closed" });
			const problems = oneOffProblems(entry, [], ZONE);
			if (problems.length > 0)
				throw new SaveRefusal("the closure has problems", { reason: "entry", problems });
			room(app, roomId);
			const kept = held(app).closures.get(roomId) ?? [];
			const fresh = entryRows(entry).filter(
				(r) => !kept.some((k) => k.date === r.date && k.start === r.start && k.end === r.end),
			);
			held(app).closures.set(roomId, [
				...kept,
				...fresh.map((r) => ({
					id: nextId("k"),
					date: r.date,
					...(r.start === undefined ? {} : { start: r.start }),
					...(r.end === undefined ? {} : { end: r.end }),
				})),
			]);
			log(data(app), "console", "rooms.closure_add", `room:${roomId}`);
			return this.roomClosures(app, roomId, input.from);
		},
		async removeRoomClosure(app, roomId, closureId) {
			guard("removeRoomClosure");
			const kept = held(app).closures.get(roomId) ?? [];
			if (!kept.some((k) => k.id === closureId)) throw new PortError("not-found", closureId);
			held(app).closures.set(
				roomId,
				kept.filter((k) => k.id !== closureId),
			);
			log(data(app), "console", "rooms.closure_remove", `room:${roomId}`);
		},
		async bookingPauses(app) {
			guard("bookingPauses");
			const at = now();
			const items = held(app)
				.pauses.map((p) => shown(p, at))
				.sort((a, b) => b.createdAt - a.createdAt);
			return { items, sites: sites(app), paused: items.some((p) => p.state === "active") };
		},
		async createPause(app, input) {
			guard("createPause");
			const at = now();
			checkPause(app, input, at);
			const pauses = held(app).pauses;
			if (pauses.length >= MAX_PAUSES) throw new PortError("invalid", "too_many", [], "too_many");
			const made = pauseOf(input, undefined, at, nextId("bp"));
			pauses.push(made);
			log(data(app), "console", "booking_pause.create", `pause:${made.id}`);
			return made;
		},
		async updatePause(app, id, input) {
			guard("updatePause");
			const pauses = held(app).pauses;
			const i = pauses.findIndex((p) => p.id === id);
			const was = pauses[i];
			if (was === undefined) throw new PortError("not-found", id);
			const at = now();
			checkPause(app, input, at);
			const made = pauseOf(input, was, at, id);
			pauses[i] = made;
			log(data(app), "console", "booking_pause.update", `pause:${id}`);
			return made;
		},
		async removePause(app, id) {
			guard("removePause");
			const h = held(app);
			if (!h.pauses.some((p) => p.id === id)) throw new PortError("not-found", id);
			h.pauses = h.pauses.filter((p) => p.id !== id);
			log(data(app), "console", "booking_pause.remove", `pause:${id}`);
		},
	};
	return {
		port,
		refuseStaff(app, columnId, serviceId) {
			const at = now();
			const blocked = held(app).pauses.some(
				(p) =>
					p.blockStaff &&
					stateOf(p, at) === "active" &&
					(p.scope.level === "organisation" ||
						(p.scope.level === "service" && p.scope.service === serviceId) ||
						(p.scope.level === "practitioner" && p.scope.practitionerId === columnId)),
			);
			if (blocked)
				throw new PortError("conflict", "online booking is paused", [], "booking_paused");
		},
	};
}
