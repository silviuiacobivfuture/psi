import { APP_DEFAULTS, type AppKey, createMemoryOutbox, createNotifier } from "@psi/notify";
import { createMemoryUsedLinks } from "@psi/notify/reminders";
import type { Hono } from "hono";
import type { Access } from "./authz/access";
import type { Config } from "./config";
import { createDeliveryLog, type DeliveryStep } from "./engagement/deliveries";
import { createPreferenceSource } from "./engagement/prefs";
import { createTeamResolver } from "./engagement/team-resolver";
import type { LogEvent } from "./http/context";
import { createInviteActions, mountInviteRoutes } from "./invite-routes";
import { createLoggingNotify, type NotifyPort } from "./ports/notify";
import { createNovuNotify, notifyApps } from "./ports/novu-notify";
import type { SsoPort } from "./ports/sso";
import { createReminderActions } from "./reminder-actions";
import { mountReminderRoutes } from "./reminder-routes";
import { createConvexOutbox, createConvexUsedLinks } from "./store/convex/notify";
import type { Rpc } from "./store/convex/rpc";
import type { StorePort } from "./store/types";

export interface NotifyWiring {
	notifier: NotifyPort;
	/** `/v1/public/reminders/...`, mounted when the links can be signed. */
	reminders: Hono | undefined;
	/** `/v1/public/invites/...`, mounted when the links can be signed. */
	invites: Hono | undefined;
	/** Stops the outbox drain. */
	stop: () => void;
	/** Delivers what is due now (the drain does this on a timer). */
	drain: () => Promise<number>;
}

const placeOf = (app: string): string =>
	app in APP_DEFAULTS ? APP_DEFAULTS[app as AppKey].place.address : "";

/**
 * The notifications: through the estate's Novu with a DURABLE outbox (Convex, so a restart or a second replica loses
 * nothing and the idempotency key keeps a retry from sending twice), the reminder and invitation links with their records
 * durable too. A team is resolved to people from the permission each message names; each person's choices (channel by kind,
 * quiet hours) are read before a message is queued; every step of a delivery is logged. Without `NOVU_*` /
 * `REMINDER_LINK_SECRET` (development only: production refuses to start) the notifications are logged by id and no link
 * is signed.
 */
export function wireNotify(input: {
	config: Config;
	store: StorePort;
	access: Access;
	sso: SsoPort | undefined;
	rpc: Rpc | undefined;
	clock: () => number;
	log: (event: LogEvent) => void;
	/** For tests: stands in for the network. */
	fetch?: typeof globalThis.fetch;
}): NotifyWiring {
	const { config, store, rpc, clock, log } = input;
	if (config.notify === undefined)
		return {
			notifier: createLoggingNotify(log),
			reminders: undefined,
			invites: undefined,
			stop: () => undefined,
			drain: () => Promise.resolve(0),
		};

	const durable = config.store.kind === "convex" && rpc !== undefined;
	const outbox = durable ? createConvexOutbox(rpc) : createMemoryOutbox();
	const used = durable ? createConvexUsedLinks(rpc) : createMemoryUsedLinks(clock);
	// The delivery log needs the port that tells owners of a failure, and the port needs the notifier the log feeds.
	const late: { port: NotifyPort | undefined } = { port: undefined };
	const onGivenUp = async (step: DeliveryStep): Promise<void> => {
		const port = late.port;
		if (port === undefined || step.event === "delivery.failed") return;
		const key = `given-up:${step.key}`;
		await port.notify({
			app: step.app,
			event: "delivery.failed",
			payload: { event: step.event, attempts: step.attempts, key: step.key },
			to: { kind: "team", permission: "app_settings_edit" },
			idempotencyKey: key,
		});
		if (
			(step.event === "reminder.day_before" || step.event === "reminder.two_hours") &&
			step.ref !== undefined
		)
			await port.notify({
				app: step.app,
				event: "reminder.failed",
				payload: { appointmentId: step.ref, reason: "gave_up" },
				to: { kind: "team", permission: "reminders_send" },
				idempotencyKey: `${key}:reminder`,
			});
	};
	const notifier = createNotifier({
		novu: {
			apiUrl: config.notify.novuApiUrl,
			secretKey: config.notify.novuSecretKey,
			...(input.fetch === undefined ? {} : { fetch: input.fetch }),
		},
		apps: notifyApps(config.notify.consoleUrl),
		outbox,
		team: createTeamResolver(store, input.access),
		preferences: createPreferenceSource(store.keyed),
		deliveries: createDeliveryLog({ keyed: store.keyed, onGivenUp }),
		now: clock,
		log: ({ level, msg, ...rest }) => log({ level, event: msg, requestId: "notify", ...rest }),
	});
	const port = createNovuNotify({
		notifier,
		store,
		log,
		clock,
		links: { publicOrigin: config.publicUrl, secret: config.notify.reminderLinkSecret },
	});
	late.port = port;
	return {
		drain: () => notifier.drain(),
		notifier: port,
		reminders: mountReminderRoutes({
			secret: config.notify.reminderLinkSecret,
			used,
			actions: createReminderActions(store, clock, placeOf),
			notifier,
			now: clock,
		}),
		invites: mountInviteRoutes({
			secret: config.notify.reminderLinkSecret,
			actions: createInviteActions(store, input.sso, clock),
			now: clock,
		}),
		stop: notifier.start(),
	};
}
