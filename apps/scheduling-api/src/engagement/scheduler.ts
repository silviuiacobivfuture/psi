import { APP_KEYS, type AppKey } from "@psi/notify";
import type { LogEvent } from "../http/context";
import type { NotifyPort } from "../ports/notify";
import type { AppointmentRow, StorePort } from "../store/types";
import { StoreRefused } from "../store/types";
import { offDuty, overlaps } from "./conflicts";
import { purgeDeliveries } from "./deliveries";
import { localClock, localDate } from "./digest-data";

/**
 * When the scheduled notifications go, in the app's own wall clock (so a change of summer time moves nothing: "07:30" is
 * what the clinic's clocks say). Each daily one has a window: it is sent at its time or, if the service was away, as soon
 * as it is back, but never after the window closes (a morning agenda at four in the afternoon is not news).
 */
export const SCHEDULE = {
	receptionDaily: { from: "07:30", until: "11:00" },
	practitionerEvening: { from: "19:00", until: "22:00" },
	ownerDaily: { from: "20:00", until: "23:30" },
	/** Mondays: last week, Monday to Sunday. */
	ownerWeekly: { day: "Mon", from: "08:00", until: "12:00" },
} as const;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A booking made less than this before it starts is its own notice: the confirmation is the reminder. */
const MIN_LEAD_FOR_DAY_BEFORE = 26 * HOUR;
const MIN_LEAD_FOR_TWO_HOURS = 3 * HOUR;
/** How long the scheduler's claims are kept, and how long the delivery log is. */
const MARKER_KEEP_DAYS = 7;
const DELIVERY_KEEP_DAYS = 35;

export interface SchedulerOptions {
	store: StorePort;
	/** The notification port the handlers use: the scheduler says what happened, by reference, like they do. */
	port: NotifyPort;
	clock: () => number;
	log: (event: LogEvent) => void;
}

export interface Scheduler {
	/** One pass at `now`: everything due is queued (idempotently), nothing is sent twice. Returns how many notices it queued. */
	tick(now?: number): Promise<number>;
	/** Runs `tick` every `everyMs` (default a minute). Returns the stop. */
	start(everyMs?: number): () => void;
}

function weekday(instant: number, timeZone: string): string {
	return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(instant);
}

/** Two calendar days (`YYYY-MM-DD`) apart, by plain date arithmetic. */
function addDays(date: string, days: number): string {
	return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

const within = (clock: string, window: { from: string; until: string }): boolean =>
	clock >= window.from && clock < window.until;

export function createScheduler(options: SchedulerOptions): Scheduler {
	const { store, port, log } = options;

	/**
	 * Claims one thing to do, once, across replicas: the first writer wins, so two replicas ticking at once queue it once.
	 * `release` hands it back when queuing failed, so the next tick tries again.
	 */
	async function claim(app: string, key: string): Promise<boolean> {
		try {
			await store.keyed.put(app, "tick", key, 0, "{}");
			return true;
		} catch (error) {
			if (error instanceof StoreRefused && error.reason === "stale") return false;
			throw error;
		}
	}

	async function once(app: AppKey, key: string, send: () => Promise<void>): Promise<number> {
		if (!(await claim(app, key))) return 0;
		try {
			await send();
			return 1;
		} catch {
			await store.keyed.remove(app, "tick", key);
			log({ level: "error", event: "scheduled_notice_failed", requestId: "scheduler", app });
			return 0;
		}
	}

	const notice = (
		app: AppKey,
		event: Parameters<NotifyPort["notify"]>[0]["event"],
		payload: Record<string, string | number | boolean>,
		key: string,
		to: Parameters<NotifyPort["notify"]>[0]["to"],
	) => port.notify({ app, event, payload, to, idempotencyKey: `${app}:${event}:${key}` });

	const TEAM = { kind: "team", permission: "appointments_view" } as const;

	async function reminders(app: AppKey, tz: string, now: number): Promise<number> {
		let queued = 0;
		const ahead = await store.c.appointments.list(app, {
			range: { field: "start", gte: now, lt: now + 25 * HOUR },
		});
		for (const a of ahead) {
			if (!live(a) || a.clientId === undefined || a.status !== "scheduled") continue;
			const day = localDate(a.start, tz);
			const base = `${day}/${a.id}-${a.start}`;
			const client = await store.c.clients.get(app, a.clientId);
			if (client === undefined || client.status !== "active") continue;
			const email = client.contact?.email ?? client.guardian?.email;
			const to = { kind: "client", clientId: client.id } as const;
			if (a.start - now <= 24 * HOUR && a.start - a.createdAt >= MIN_LEAD_FOR_DAY_BEFORE) {
				queued += await once(app, `${day}/day_before/${a.id}-${a.start}`, () =>
					email === undefined
						? notice(
								app,
								"reminder.failed",
								{ appointmentId: a.id, reason: "no_contact" },
								base,
								TEAM,
							)
						: notice(app, "reminder.day_before", { appointmentId: a.id, start: a.start }, base, to),
				);
			}
			if (
				email !== undefined &&
				a.start - now <= 2 * HOUR &&
				a.start - a.createdAt >= MIN_LEAD_FOR_TWO_HOURS
			)
				queued += await once(app, `${day}/two_hours/${a.id}-${a.start}`, () =>
					notice(app, "reminder.two_hours", { appointmentId: a.id, start: a.start }, base, to),
				);
		}
		return queued;
	}

	/** After a session: ask how it went (the client), and remind the therapist that its report is theirs to write. */
	async function afterSessions(app: AppKey, tz: string, now: number): Promise<number> {
		let queued = 0;
		const recent = await store.c.appointments.list(app, {
			range: { field: "start", gte: now - 3 * DAY, lt: now },
		});
		for (const a of recent) {
			if (!live(a) || a.clientId === undefined) continue;
			const day = localDate(a.start, tz);
			const client = await store.c.clients.get(app, a.clientId);
			if (
				a.status === "attended" &&
				a.end <= now - 2 * HOUR &&
				a.end > now - 2 * DAY &&
				client !== undefined &&
				(client.contact?.email ?? client.guardian?.email) !== undefined
			)
				queued += await once(app, `${day}/feedback/${a.id}-${a.start}`, () =>
					notice(app, "feedback.requested", { appointmentId: a.id }, `${a.id}-${a.start}`, {
						kind: "client",
						clientId: a.clientId ?? "",
					}),
				);
			if (
				(a.status === "attended" || a.status === "scheduled") &&
				a.end <= now - HOUR &&
				a.end > now - DAY
			) {
				const written = (await store.c.records.list(app, { eq: { clientId: a.clientId } })).some(
					(r) => r.appointmentId === a.id,
				);
				if (!written)
					queued += await once(app, `${day}/record/${a.id}-${a.start}`, () =>
						notice(app, "record.todo", { appointmentId: a.id }, `${a.id}-${a.start}`, TEAM),
					);
			}
		}
		return queued;
	}

	/** Two live sessions on one therapist, room or device at once: the desk is told, once per pair. */
	async function conflicts(app: AppKey, tz: string, now: number): Promise<number> {
		let queued = 0;
		const rows = await store.c.appointments.list(app, {
			range: { field: "start", gte: now, lt: now + 7 * DAY },
		});
		const roster = new Map(
			(await store.c.roster.list(app)).map((r) => [`${r.personId}_${r.date}`, r]),
		);
		const found = [
			...overlaps(rows),
			...offDuty(
				rows,
				(person, date) => roster.get(`${person}_${date}`),
				(at) => localDate(at, tz),
				tz,
			),
		];
		for (const c of found) {
			const pair =
				c.otherAppointmentId === undefined
					? c.appointmentId
					: `${c.appointmentId}+${c.otherAppointmentId}`;
			queued += await once(app, `${localDate(c.at, tz)}/conflict/${c.what}/${pair}-${c.at}`, () =>
				notice(
					app,
					"appointment.conflict",
					{
						appointmentId: c.appointmentId,
						what: c.what,
						...(c.otherAppointmentId === undefined
							? {}
							: { otherAppointmentId: c.otherAppointmentId }),
					},
					`${c.what}:${pair}-${c.at}`,
					TEAM,
				),
			);
		}
		return queued;
	}

	/** The daily and weekly summaries, each at its own wall-clock time. */
	async function digests(app: AppKey, tz: string, now: number): Promise<number> {
		let queued = 0;
		const today = localDate(now, tz);
		const clock = localClock(now, tz);
		const send = (
			kind: string,
			scope: string,
			event: "digest.reception_daily" | "digest.owner_daily",
			payload: Record<string, string>,
		) =>
			once(app, `${today}/${kind}/${scope}`, () =>
				notice(app, event, payload, `${kind}:${scope}:${today}`, {
					kind: "team",
					permission: "reports_view",
				}),
			);
		if (within(clock, SCHEDULE.receptionDaily))
			queued += await send("reception", "all", "digest.reception_daily", { date: today });
		if (within(clock, SCHEDULE.ownerDaily))
			queued += await send("owner", "all", "digest.owner_daily", { date: today });
		if (within(clock, SCHEDULE.practitionerEvening)) {
			const tomorrow = addDays(today, 1);
			for (const person of await store.c.people.list(app)) {
				if (person.subject === undefined || !person.active) continue;
				queued += await once(app, `${today}/evening/${person.id}`, () =>
					notice(
						app,
						"digest.practitioner_evening",
						{ date: tomorrow, personId: person.id },
						`evening:${person.id}:${tomorrow}`,
						{ kind: "person", subject: person.subject ?? "" },
					),
				);
			}
		}
		if (weekday(now, tz) === SCHEDULE.ownerWeekly.day && within(clock, SCHEDULE.ownerWeekly)) {
			const from = addDays(today, -7);
			queued += await once(app, `${today}/owner_weekly/all`, () =>
				notice(
					app,
					"digest.owner_weekly",
					{ from, to: addDays(today, -1) },
					`owner_weekly:${from}`,
					{
						kind: "team",
						permission: "reports_view",
					},
				),
			);
		}
		return queued;
	}

	/** The claims of days long past, and the delivery log's old days: both are for following up, not for keeping. */
	async function tidy(app: AppKey, now: number): Promise<void> {
		const claimsFrom = new Date(now - MARKER_KEEP_DAYS * DAY).toISOString().slice(0, 10);
		for (const entry of await store.keyed.list(app, "tick", { limit: 1000 }))
			if (entry.key.slice(0, 10) < claimsFrom) await store.keyed.remove(app, "tick", entry.key);
		await purgeDeliveries(
			store.keyed,
			app,
			new Date(now - DELIVERY_KEEP_DAYS * DAY).toISOString().slice(0, 10),
		);
	}

	const tick = async (at?: number): Promise<number> => {
		const now = at ?? options.clock();
		let queued = 0;
		for (const key of APP_KEYS) {
			const row = await store.c.apps.get(key, key);
			if (row === undefined || row.status !== "active") continue;
			try {
				queued += await reminders(key, row.timeZone, now);
				queued += await afterSessions(key, row.timeZone, now);
				queued += await conflicts(key, row.timeZone, now);
				queued += await digests(key, row.timeZone, now);
				await tidy(key, now);
			} catch {
				log({ level: "error", event: "scheduler_pass_failed", requestId: "scheduler", app: key });
			}
		}
		return queued;
	};

	return {
		tick,
		start(everyMs = 60_000) {
			let running = false;
			const timer = setInterval(() => {
				if (running) return;
				running = true;
				tick()
					.catch(() => log({ level: "error", event: "scheduler_failed", requestId: "scheduler" }))
					.finally(() => {
						running = false;
					});
			}, everyMs);
			timer.unref();
			return () => clearInterval(timer);
		},
	};
}

const live = (a: AppointmentRow): boolean => a.deletedAt === undefined && a.kind === "session";
