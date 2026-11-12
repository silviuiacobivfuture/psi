import { accountHashOf } from "@psi/scheduling";
import type { Reminder, ReminderPort } from "@psi/scheduling/domain";
import type { PushStore } from "./store";
import type { PushTransport, SendOptions } from "./transport";
import type { NotifyEvent, PushLocale, PushPayload, SubscriptionRecord, Topic } from "./types";

export interface NotifyReport {
	/** Subscriptions the event was meant for. */
	recipients: number;
	sent: number;
	failed: number;
	/** Subscriptions the push service said are gone, now deleted. */
	removed: number;
	/** Why nothing was sent, when nothing was. */
	skipped?: "no-account" | "already-sent" | "unknown-endpoint";
}

export interface Notifier {
	/** The one entry point: scheduling, the CMS publish hook and the ops smoke all call this. */
	notify(event: NotifyEvent): Promise<NotifyReport>;
	/** Scheduling's `ReminderPort`, delivering by push. */
	readonly reminders: ReminderPort;
	/** Sends the reminders now due; the app calls it on a timer (`startReminderClock`). */
	tick(now?: number): Promise<number>;
	/**
	 * A test push to every device of one account on this site (the control plane's "send a test
	 * to me": the staff member's own subject, never someone else's).
	 */
	testAccount(subject: string, site: SubscriptionRecord["site"]): Promise<NotifyReport>;
}

export interface NotifierOptions {
	store: PushStore;
	transport: PushTransport;
	now?: () => number;
	/** Which reminder leads are pushed, in minutes. Default: the day before only. */
	reminderLeads?: ReadonlyArray<number>;
	/**
	 * Asked at send time before a reminder goes out (scheduling's rule: a cancelled or erased
	 * appointment is never reminded). Without it, a cancel through `reminders.cancel` is relied on.
	 */
	stillConfirmed?: (reference: string) => Promise<boolean>;
	onWarn?: (message: string) => void;
}

export const DAY_BEFORE_MINUTES = 24 * 60;
const SEND_BATCH = 20;

/** The account page in the subscriber's language: a booking push leads only there. */
export function accountUrl(locale: PushLocale): string {
	return locale === "en" ? "/en/cont" : "/cont";
}

/** The device collapses repeats by the notification `tag`; no Web Push `Topic` header is sent. */
function bookingOptions(kind: NotifyEvent["kind"]): SendOptions {
	return kind === "booking.reminder"
		? { ttl: 12 * 3600, urgency: "high" }
		: { ttl: 24 * 3600, urgency: "high" };
}

export function createNotifier(opts: NotifierOptions): Notifier {
	const now = opts.now ?? Date.now;
	const leads = new Set(opts.reminderLeads ?? [DAY_BEFORE_MINUTES]);
	const warn = opts.onWarn ?? ((m: string) => console.warn(`[pwa] ${m}`));

	async function deliver(
		to: ReadonlyArray<SubscriptionRecord>,
		payloadFor: (s: SubscriptionRecord) => PushPayload,
		options: SendOptions,
	): Promise<NotifyReport> {
		const report: NotifyReport = { recipients: to.length, sent: 0, failed: 0, removed: 0 };
		for (let i = 0; i < to.length; i += SEND_BATCH) {
			await Promise.all(
				to.slice(i, i + SEND_BATCH).map(async (s) => {
					const r = await opts.transport.send(s, payloadFor(s), options);
					if (r.ok) {
						report.sent++;
						await opts.store.delivered(s.endpoint, now());
					} else if (r.gone) {
						report.removed++;
						await opts.store.removeEndpoint(s.endpoint);
					} else {
						report.failed++;
						warn(`push to ${new URL(s.endpoint).host} failed (${r.status})`);
						await opts.store.failed(s.endpoint, now());
					}
				}),
			);
		}
		return report;
	}

	const none = (skipped: NotifyReport["skipped"]): NotifyReport => ({
		recipients: 0,
		sent: 0,
		failed: 0,
		removed: 0,
		...(skipped !== undefined ? { skipped } : {}),
	});

	async function notify(event: NotifyEvent): Promise<NotifyReport> {
		switch (event.kind) {
			case "booking.confirmed":
			case "booking.cancelled":
			case "booking.reminder": {
				if (event.reference !== undefined) {
					if (event.kind === "booking.cancelled") await opts.store.cancelReminders(event.reference);
					if (event.kind === "booking.confirmed" && event.start !== undefined) {
						await plan([
							{
								reference: event.reference,
								start: event.start,
								at: event.start - DAY_BEFORE_MINUTES * 60_000,
								leadMinutes: DAY_BEFORE_MINUTES,
							},
						]);
					}
				}
				const to = await bookingRecipients(event);
				if (to === null) return none("no-account");
				return deliver(
					to,
					(s) => ({
						v: 1,
						kind: event.kind,
						locale: s.locale,
						url: accountUrl(s.locale),
						tag: "booking",
					}),
					bookingOptions(event.kind),
				);
			}
			case "article.published": {
				if (!(await opts.store.claim(`article:${event.id}`, now()))) return none("already-sent");
				const topic: Topic = `articles:${event.brand}`;
				const to = await opts.store.forTopic(topic);
				return deliver(
					to,
					(s) => ({
						v: 1,
						kind: "article.published",
						locale: s.locale,
						url: event.url[s.locale],
						tag: `article-${event.id}`.slice(0, 64),
						brand: event.brand,
						...(event.headline !== undefined ? { headline: event.headline[s.locale] } : {}),
					}),
					{ ttl: 3 * 86_400, urgency: "low" },
				);
			}
			case "test": {
				const s = await opts.store.byEndpoint(event.endpoint);
				if (s === null) return none("unknown-endpoint");
				return deliver(
					[s],
					(x) => ({ v: 1, kind: "test", locale: x.locale, url: "/", tag: "test" }),
					{ ttl: 60, urgency: "high" },
				);
			}
		}
	}

	/** The account's booking subscriptions: by subject, by scheduling hash, or by a linked reference. */
	async function bookingRecipients(
		event: Extract<NotifyEvent, { kind: `booking.${string}` }>,
	): Promise<SubscriptionRecord[] | null> {
		if (event.subject !== undefined) return opts.store.forTopic("booking", event.subject);
		if (event.accountHash !== undefined) {
			const all = await opts.store.bookingSubscriptions();
			return all.filter(
				(s) => s.subject !== null && accountHashOf(s.subject) === event.accountHash,
			);
		}
		const subject =
			event.reference !== undefined ? await opts.store.bookingSubject(event.reference) : null;
		return subject === null ? null : opts.store.forTopic("booking", subject);
	}

	async function plan(reminders: ReadonlyArray<Reminder>): Promise<void> {
		const wanted = reminders
			.filter((r) => leads.has(r.leadMinutes) && r.at > now())
			.map((r) => ({ reference: r.reference, at: r.at, leadMinutes: r.leadMinutes }));
		if (wanted.length > 0) await opts.store.planReminders(wanted);
	}

	return {
		notify,
		reminders: {
			schedule: plan,
			cancel: (reference) => opts.store.cancelReminders(reference),
		},
		async testAccount(subject, site) {
			const to = (await opts.store.forSubject(subject)).filter((s) => s.site === site);
			if (to.length === 0) return none("no-account");
			return deliver(to, (x) => ({ v: 1, kind: "test", locale: x.locale, url: "/", tag: "test" }), {
				ttl: 60,
				urgency: "high",
			});
		},
		async tick(at = now()) {
			let sent = 0;
			for (const r of await opts.store.takeDueReminders(at)) {
				if (opts.stillConfirmed !== undefined && !(await opts.stillConfirmed(r.reference)))
					continue;
				sent += (await notify({ kind: "booking.reminder", reference: r.reference })).sent;
			}
			return sent;
		},
	};
}

/** Runs `tick` every minute; returns the stop function. One clock per process is enough. */
export function startReminderClock(notifier: Notifier, everyMs = 60_000): () => void {
	const timer = setInterval(() => {
		notifier.tick().catch((err: unknown) => console.warn(`[pwa] reminders: ${String(err)}`));
	}, everyMs);
	timer.unref();
	return () => clearInterval(timer);
}
