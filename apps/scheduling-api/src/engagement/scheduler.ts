import { APP_KEYS, type AppKey } from "@psi/notify";
import type { LogEvent } from "../http/context";
import type { NotifyPort } from "../ports/notify";
import type { SsoPort } from "../ports/sso";
import type { AppointmentRow, StorePort } from "../store/types";
import { StoreRefused } from "../store/types";
import { activateInvite } from "./activate";
import { offDuty, overlaps } from "./conflicts";
import { purgeDeliveries } from "./deliveries";
import { localClock, localDate } from "./digest-data";
import { invites } from "./records";

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
	/** The estate sign-in, when configured: an invited account that has signed in is seen to have used its invitation. */
	sso?: SsoPort | undefined;
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

/** A claim's key as the store accepts it: any character it does not take becomes `_`, and it is cut to the store's bound. */
const claimKey = (key: string): string => key.replace(/[^A-Za-z0-9._:@/-]/g, "_").slice(0, 200);

/** How often the sign-in is asked who has signed in since being invited, and for how long an invitation is watched. */
const ACTIVATION_POLL_MS = 5 * 60_000;
const ACTIVATION_WATCH_DAYS = 30;

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
			await store.keyed.put(app, "tick", claimKey(key), 0, "{}");
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
			await store.keyed.remove(app, "tick", claimKey(key));
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

	/** The desk's list of reminders: one the service has sent reads "sent" there, and a confirmed one stays confirmed. */
	async function markSent(app: AppKey, id: string, now: number): Promise<void> {
		const held = await store.c.reminders.get(app, id);
		if (held?.state === "confirmed" || held?.state === "sent") return;
		const row = { id, app, state: "sent" as const, updatedAt: now };
		if (held === undefined) await store.c.reminders.insert(row);
		else await store.c.reminders.replace(row);
		await store.changes.append(app, { kind: "appointment", op: "updated", id });
	}

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
				queued += await once(app, `${day}/day_before/${a.id}-${a.start}`, async () => {
					if (email === undefined)
						return notice(
							app,
							"reminder.failed",
							{ appointmentId: a.id, reason: "no_contact" },
							base,
							TEAM,
						);
					await notice(
						app,
						"reminder.day_before",
						{ appointmentId: a.id, start: a.start },
						base,
						to,
					);
					// The desk's own reminder list shows it as sent: reception must not send the same reminder a second time.
					await markSent(app, a.id, now);
				});
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

	/** Runs one section of a pass; its failure is logged and leaves the other sections to run. */
	async function section(app: AppKey, name: string, run: () => Promise<number>): Promise<number> {
		try {
			return await run();
		} catch {
			log({ level: "error", event: "scheduler_section_failed", requestId: "scheduler", app, name });
			return 0;
		}
	}

	let polledAt = Number.NEGATIVE_INFINITY;
	/**
	 * A site that has not moved to the SDK never tells this service that an invited account signed in, so the sign-in is
	 * asked: an invitation whose account has signed in since it was sent has been used. At most every five minutes, and only
	 * for invitations still waiting that are not older than a month.
	 */
	async function activations(app: AppKey, now: number): Promise<number> {
		const sso = options.sso;
		if (sso === undefined || now - polledAt < ACTIVATION_POLL_MS) return 0;
		let activated = 0;
		for (const held of await invites(store.keyed).all(app)) {
			const { row } = held;
			if (row.status !== "invited" || now - row.invitedAt > ACTIVATION_WATCH_DAYS * DAY) continue;
			const seen = await sso.lastLogin(row.ssoUserId);
			if (seen === undefined || seen <= row.invitedAt) continue;
			const done = await activateInvite({ deps: { store, clock: () => now }, port }, app, held, {
				subject: "system:scheduler",
				kind: "service",
			});
			if (done) activated++;
		}
		polledAt = now;
		return activated;
	}

	const tick = async (at?: number): Promise<number> => {
		const now = at ?? options.clock();
		let queued = 0;
		for (const key of APP_KEYS) {
			const row = await store.c.apps.get(key, key);
			if (row === undefined || row.status !== "active") continue;
			// A section that fails leaves the others to run: one bad row must not silence the morning list.
			queued += await section(key, "reminders", () => reminders(key, row.timeZone, now));
			queued += await section(key, "after_sessions", () => afterSessions(key, row.timeZone, now));
			queued += await section(key, "conflicts", () => conflicts(key, row.timeZone, now));
			queued += await section(key, "digests", () => digests(key, row.timeZone, now));
			queued += await section(key, "activations", () => activations(key, now));
			await section(key, "tidy", async () => {
				await tidy(key, now);
				return 0;
			});
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
