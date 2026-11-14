import type { AppKey, AppSettings, EventId } from "./apps";
import {
	AudienceSchema,
	type Channel,
	type Entry,
	entryFor,
	PAYLOADS,
	workflowId,
} from "./catalogue";
import type { DeliveryEvent, DeliverySink, DeliveryStatus, SuppressedWhy } from "./delivery";
import type { TeamAudience } from "./identity";
import { createNovuHttp, type NovuHttp, NovuRefused, type SubscriberFields } from "./novu-http";
import { createMemoryOutbox, type Job, type Outbox } from "./outbox";
import { applyPrefs, type PreferenceSource, type Prefs, type PrefsOwner } from "./prefs";
import {
	idempotencyKey,
	isPerson,
	isTeam,
	NO_CHANNELS,
	type PersonRecipient,
	type Recipient,
	recipientKey,
	refOf,
	shortHash,
	type TeamPerson,
	type TeamRecipient,
	target,
} from "./recipients";
import type { Meta } from "./render";

export type { PersonRecipient, Recipient, TeamPerson, TeamRecipient } from "./recipients";
export { idempotencyKey } from "./recipients";

export type NotifyOutcome =
	| { status: "queued"; jobs: number }
	| { status: "off"; reason: "event-off" | "receipts-off" | "no-channel" | "no-recipient" }
	| { status: "invalid"; reason: "payload" | "recipient" | "unknown-app" };

export interface AppRuntime {
	settings: AppSettings;
	siteUrl: string;
	consoleUrl: string;
}

export type Logger = (line: {
	level: "info" | "warn" | "error";
	msg: string;
	[field: string]: string | number | boolean;
}) => void;

/** Who a team is, at send time: the people who hold the permission the entry names (the service resolves them). */
export type TeamResolver = (
	app: AppKey,
	entry: Entry,
	team: TeamRecipient,
) => Promise<ReadonlyArray<TeamPerson>>;

export interface NotifyOptions {
	novu: { apiUrl: string; secretKey: string; fetch?: typeof globalThis.fetch };
	apps: Readonly<Partial<Record<AppKey, AppRuntime>>>;
	outbox?: Outbox;
	/** A team recipient with no person is resolved here; without it the team is a Novu topic (the legacy shape). */
	team?: TeamResolver;
	/** What each person chose; a failure reading it means the catalogue's defaults, never a lost notification. */
	preferences?: PreferenceSource;
	/** Where each step of a delivery is recorded. */
	deliveries?: DeliverySink;
	now?: () => number;
	log?: Logger;
	/** Attempts before a job is given up on. */
	maxAttempts?: number;
	/** First retry delay; doubles each attempt, capped at one hour. */
	backoffMs?: number;
}

export interface Notifier {
	/**
	 * Queues the notification and returns. NEVER throws and never waits on Novu: a failed delivery
	 * is retried by `drain`, and an action of a person is never blocked by it.
	 */
	notify(
		app: AppKey,
		event: EventId,
		payload: Record<string, unknown>,
		to: ReadonlyArray<Recipient>,
		occurrence?: string,
	): Promise<NotifyOutcome>;
	/** Delivers the jobs that are due; returns how many reached Novu. Called on a timer (`start`). */
	drain(): Promise<number>;
	start(everyMs?: number): () => void;
	/** Keeps Novu's subscriber in step with the scheduling service's person. */
	upsertSubscriber(app: AppKey, recipient: PersonRecipient): Promise<void>;
	/** Puts staff in an app team's topic (creating it), or takes them out. */
	setTeam(
		app: AppKey,
		team: TeamAudience,
		add: ReadonlyArray<string>,
		remove: ReadonlyArray<string>,
	): Promise<void>;
	pending(): Promise<number>;
}

const ownerOf = (r: PersonRecipient): PrefsOwner =>
	r.audience === "client"
		? { side: "client", clientId: r.clientId }
		: { side: "staff", subject: r.subject };

export function createNotifier(options: NotifyOptions): Notifier {
	const http: NovuHttp = createNovuHttp(options.novu);
	const outbox = options.outbox ?? createMemoryOutbox();
	const now = options.now ?? Date.now;
	const maxAttempts = options.maxAttempts ?? 8;
	const backoff = options.backoffMs ?? 5_000;
	const log: Logger = options.log ?? ((line) => console.log(JSON.stringify(line)));

	async function record(
		job: Pick<Job, "app" | "event" | "idempotencyKey" | "attempts">,
		meta: { audience: DeliveryEvent["audience"]; to: string; ref: string | undefined },
		step: {
			status: DeliveryStatus;
			channels?: Readonly<Record<Channel, boolean>>;
			suppressed?: DeliveryEvent["suppressed"];
			why?: SuppressedWhy;
			httpStatus?: number;
		},
	): Promise<void> {
		if (options.deliveries === undefined) return;
		const app = job.app as AppKey;
		const event = job.event as EventId;
		try {
			await options.deliveries.record({
				app,
				event,
				audience: meta.audience,
				key: job.idempotencyKey,
				to: meta.to,
				...(meta.ref === undefined ? {} : { ref: meta.ref }),
				status: step.status,
				channels: step.channels ?? NO_CHANNELS,
				suppressed: step.suppressed ?? {},
				...(step.why === undefined ? {} : { why: step.why }),
				attempts: job.attempts,
				...(step.httpStatus === undefined ? {} : { httpStatus: step.httpStatus }),
				at: now(),
			});
		} catch {
			log({ level: "warn", msg: "delivery step not recorded", app, event });
		}
	}

	async function prefsOf(app: AppKey, r: PersonRecipient): Promise<Prefs | undefined> {
		if (options.preferences === undefined) return undefined;
		try {
			return await options.preferences.resolve(app, ownerOf(r));
		} catch {
			log({ level: "warn", msg: "preferences unreadable, defaults used", app });
			return undefined;
		}
	}

	/** A team recipient becomes its people; anything else is itself. */
	async function expand(
		app: AppKey,
		r: Recipient,
		entry: Entry,
	): Promise<ReadonlyArray<Recipient>> {
		if (!isTeam(r) || r.subject !== undefined || options.team === undefined) return [r];
		const people = await options.team(app, entry, r);
		return people.map((p) => ({ ...p, audience: r.audience }));
	}

	return {
		async notify(app, event, payload, to, occurrence) {
			try {
				const runtime = options.apps[app];
				if (runtime === undefined) return { status: "invalid", reason: "unknown-app" };
				const parsed = PAYLOADS[event].safeParse(payload);
				if (!parsed.success) {
					log({ level: "warn", msg: "notification payload refused", app, event });
					return { status: "invalid", reason: "payload" };
				}
				const { settings } = runtime;
				if (settings.off.includes(event)) return { status: "off", reason: "event-off" };
				if (event === "payment.recorded" && !settings.receipts)
					return { status: "off", reason: "receipts-off" };
				const jobs: Job[] = [];
				let reachable = 0;
				for (const asked of to) {
					const entry = entryFor(event, asked.audience);
					if (entry === undefined) return { status: "invalid", reason: "recipient" };
					for (const r of await expand(app, asked, entry)) {
						reachable++;
						const person = isPerson(r) ? r : undefined;
						const prefs = person === undefined ? undefined : await prefsOf(app, person);
						const { channels, suppressed } = applyPrefs({
							entry,
							prefs,
							appQuiet: settings.quietHours,
							now: now(),
							hasEmail: r.audience !== "client" || r.email !== undefined,
						});
						const who = recipientKey(app, r);
						const key = idempotencyKey(app, event, r.audience, parsed.data, who, occurrence);
						const base = { app, event, idempotencyKey: key, attempts: 0 };
						const meta = { audience: r.audience, to: shortHash(who), ref: refOf(parsed.data) };
						if (!channels.in_app && !channels.push && !channels.email) {
							await record(base, meta, {
								status: "suppressed",
								channels,
								suppressed,
								why: Object.values(suppressed)[0] ?? "no-channel",
							});
							continue;
						}
						const body: Meta = {
							event,
							audience: r.audience,
							channels,
							brandName: settings.brandName,
							theme: settings.theme,
							timeZone: settings.timeZone,
							siteUrl: runtime.siteUrl,
							consoleUrl: runtime.consoleUrl,
							place: settings.place,
						};
						jobs.push({
							id: key,
							idempotencyKey: key,
							body: {
								workflow: workflowId(app, event, r.audience),
								to: target(app, r, prefs?.locale ?? r.locale),
								payload: { ...parsed.data, meta: body },
								overrides: {
									email: {
										integrationIdentifier: `plunk-${app}`,
										replyTo: settings.replyTo,
										senderName: settings.senderName,
									},
								},
							},
							app,
							event,
							attempts: 0,
							replays: 0,
							dueAt: now(),
						});
						await record(base, meta, { status: "queued", channels, suppressed });
					}
				}
				if (jobs.length === 0)
					return { status: "off", reason: reachable === 0 ? "no-recipient" : "no-channel" };
				for (const j of jobs) await outbox.add(j);
				return { status: "queued", jobs: jobs.length };
			} catch {
				log({ level: "error", msg: "notification could not be queued", app, event });
				return { status: "invalid", reason: "payload" };
			}
		},

		async drain() {
			let delivered = 0;
			for (const job of await outbox.due(now(), 50)) {
				const meta = {
					audience: audienceOf(job),
					to: shortHash(recipientOf(job)),
					ref: refOf(job.body.payload),
				};
				try {
					await http.trigger(
						job.body,
						job.replays === 0 ? job.idempotencyKey : `${job.idempotencyKey}:r${job.replays}`,
					);
					await outbox.remove(job.id);
					delivered++;
					await record({ ...job, attempts: job.attempts + 1 }, meta, { status: "sent" });
				} catch (error) {
					const retryable = error instanceof NovuRefused ? error.retryable : true;
					const attempts = job.attempts + 1;
					const status = error instanceof NovuRefused ? error.status : 0;
					if (!retryable || attempts >= maxAttempts) {
						await outbox.remove(job.id);
						log({
							level: "error",
							msg: "notification given up",
							app: job.app,
							event: job.event,
							key: shortHash(job.id),
							attempts,
							status,
						});
						await record({ ...job, attempts }, meta, { status: "given_up", httpStatus: status });
					} else {
						// Novu keeps a refusal under its Idempotency-Key for 24 h and answers a repeat from
						// it: the same key can never succeed, so the key walks on (`:r1`, `:r2`, …).
						const replays =
							error instanceof NovuRefused && error.replay ? job.replays + 1 : job.replays;
						await outbox.reschedule(
							job.id,
							attempts,
							now() + Math.min(backoff * 2 ** (attempts - 1), 3_600_000),
							replays,
						);
						log({
							level: "warn",
							msg: "notification will be retried",
							app: job.app,
							event: job.event,
							key: shortHash(job.id),
							attempts,
							status,
						});
						await record({ ...job, attempts }, meta, { status: "retrying", httpStatus: status });
					}
				}
			}
			return delivered;
		},

		start(everyMs = 5_000) {
			let running = false;
			const timer = setInterval(() => {
				if (running) return;
				running = true;
				this.drain()
					.catch(() => log({ level: "error", msg: "notification drain failed" }))
					.finally(() => {
						running = false;
					});
			}, everyMs);
			timer.unref();
			return () => clearInterval(timer);
		},

		async upsertSubscriber(app, r) {
			const t = target(app, r, r.locale);
			if ("topicKey" in t || t.fields === undefined) return;
			const fields: SubscriberFields = t.fields;
			await http.upsertSubscriber(fields);
		},

		async setTeam(app, team, add, remove) {
			const key = `${app}:${team}`;
			await http.addToTopic(key, add);
			await http.removeFromTopic(key, remove);
		},

		pending: () => outbox.size(),
	};
}

/** What a queued job says about who it was for, without keeping an address: the subscriber or topic id. */
function recipientOf(job: Job): string {
	return "topicKey" in job.body.to ? job.body.to.topicKey : job.body.to.subscriberId;
}

/** The audience a job was queued for, read back from the `meta` its payload carries. */
function audienceOf(job: Job): DeliveryEvent["audience"] {
	const meta = Reflect.get(job.body.payload, "meta");
	const audience =
		typeof meta === "object" && meta !== null ? Reflect.get(meta, "audience") : undefined;
	const parsed = AudienceSchema.safeParse(audience);
	return parsed.success ? parsed.data : "team";
}
