import { createHash } from "node:crypto";
import { type AppKey, type AppSettings, type EventId, inQuietHours } from "./apps";
import { type Audience, type Channel, entryFor, PAYLOADS, workflowId } from "./catalogue";
import { clientSubscriberId, type TeamAudience, topicKey } from "./identity";
import {
	createNovuHttp,
	type NovuHttp,
	NovuRefused,
	type SubscriberFields,
	type Target,
} from "./novu-http";
import { createMemoryOutbox, type Job, type Outbox } from "./outbox";
import type { Meta } from "./render";

/** Who a notification goes to: a person of the app, or one of its teams (a Novu topic). */
export type Recipient =
	| {
			audience: "client";
			clientId: string;
			email?: string;
			phone?: string;
			name?: string;
			locale?: "ro" | "en";
	  }
	| {
			audience: "practitioner" | "requester" | "actor";
			/** The estate sign-in subject. */
			subject: string;
			email?: string;
			name?: string;
			locale?: "ro" | "en";
	  }
	| { audience: "team" | "reception" | "owners" };

export type TeamRecipient = Extract<Recipient, { audience: TeamAudience }>;
export type PersonRecipient = Exclude<Recipient, TeamRecipient>;
const isTeam = (r: Recipient): r is TeamRecipient =>
	r.audience === "team" || r.audience === "reception" || r.audience === "owners";

export type NotifyOutcome =
	| { status: "queued"; jobs: number }
	| { status: "off"; reason: "event-off" | "receipts-off" | "no-channel" }
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

export interface NotifyOptions {
	novu: { apiUrl: string; secretKey: string; fetch?: typeof globalThis.fetch };
	apps: Readonly<Partial<Record<AppKey, AppRuntime>>>;
	outbox?: Outbox;
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

const DOMAIN_FIELDS = [
	"requestId",
	"appointmentId",
	"packageId",
	"leaveId",
	"paymentId",
	"actionId",
] as const;

function domainKey(payload: Record<string, unknown>): string {
	for (const f of DOMAIN_FIELDS) {
		const v = payload[f];
		if (typeof v === "string") return v;
	}
	return "";
}

function recipientKey(app: AppKey, r: Recipient): string {
	switch (r.audience) {
		case "client":
			return clientSubscriberId(app, r.clientId);
		case "practitioner":
		case "requester":
		case "actor":
			return r.subject;
		case "team":
		case "reception":
		case "owners":
			return topicKey(app, r.audience);
		default: {
			const never: never = r;
			return never;
		}
	}
}

function shortHash(text: string): string {
	return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/** The idempotency key of one delivery: the same event, object, time and recipient is sent once. */
export function idempotencyKey(
	app: AppKey,
	event: EventId,
	audience: Audience,
	payload: Record<string, unknown>,
	recipient: string,
	occurrence = "",
): string {
	const startsAt = typeof payload.startsAt === "string" ? payload.startsAt : "";
	const raw = [app, event, audience, domainKey(payload), startsAt, occurrence, recipient].join("|");
	return `${app}:${event}:${shortHash(raw)}${shortHash(`${raw}#`)}`;
}

function effectiveChannels(channels: ReadonlyArray<Channel>, quiet: boolean): Meta["channels"] {
	return {
		in_app: channels.includes("in_app"),
		push: !quiet && channels.includes("push"),
		email: channels.includes("email"),
	};
}

export function createNotifier(options: NotifyOptions): Notifier {
	const http: NovuHttp = createNovuHttp(options.novu);
	const outbox = options.outbox ?? createMemoryOutbox();
	const now = options.now ?? Date.now;
	const maxAttempts = options.maxAttempts ?? 8;
	const backoff = options.backoffMs ?? 5_000;
	const log: Logger = options.log ?? ((line) => console.log(JSON.stringify(line)));

	function target(app: AppKey, r: Recipient): Target {
		if (isTeam(r)) return { topicKey: topicKey(app, r.audience) };
		const fields: SubscriberFields = { subscriberId: recipientKey(app, r) };
		if (r.email !== undefined) fields.email = r.email;
		if (r.name !== undefined) fields.firstName = r.name;
		if (r.locale !== undefined) fields.locale = r.locale;
		if (r.audience === "client" && r.phone !== undefined) fields.phone = r.phone;
		return { subscriberId: fields.subscriberId, fields };
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
				const quiet = inQuietHours(settings.quietHours, now());
				const jobs: Job[] = [];
				for (const r of to) {
					const entry = entryFor(event, r.audience);
					if (entry === undefined) return { status: "invalid", reason: "recipient" };
					const channels = effectiveChannels(entry.channels, quiet);
					if (!channels.in_app && !channels.push && !channels.email) continue;
					const meta: Meta = {
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
					const key = idempotencyKey(
						app,
						event,
						r.audience,
						parsed.data,
						recipientKey(app, r),
						occurrence,
					);
					const integration = `plunk-${app}`;
					jobs.push({
						id: key,
						idempotencyKey: key,
						body: {
							workflow: workflowId(app, event, r.audience),
							to: target(app, r),
							payload: { ...parsed.data, meta },
							overrides: {
								email: {
									integrationIdentifier: integration,
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
				}
				if (jobs.length === 0) return { status: "off", reason: "no-channel" };
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
				try {
					await http.trigger(
						job.body,
						job.replays === 0 ? job.idempotencyKey : `${job.idempotencyKey}:r${job.replays}`,
					);
					await outbox.remove(job.id);
					delivered++;
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
			const t = target(app, r);
			if ("topicKey" in t || t.fields === undefined) return;
			await http.upsertSubscriber(t.fields);
		},

		async setTeam(app, team, add, remove) {
			const key = topicKey(app, team);
			await http.ensureTopic(key, key);
			await http.addToTopic(key, add);
			await http.removeFromTopic(key, remove);
		},

		pending: () => outbox.size(),
	};
}
