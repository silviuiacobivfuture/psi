import { APP_DEFAULTS, type AppKey, createMemoryOutbox, createNotifier } from "@psi/notify";
import { createMemoryUsedLinks } from "@psi/notify/reminders";
import type { Hono } from "hono";
import type { Config } from "./config";
import type { LogEvent } from "./http/context";
import { createLoggingNotify, type NotifyPort } from "./ports/notify";
import { createNovuNotify, NOTIFY_APPS } from "./ports/novu-notify";
import { createReminderActions } from "./reminder-actions";
import { mountReminderRoutes } from "./reminder-routes";
import { createConvexOutbox, createConvexUsedLinks } from "./store/convex/notify";
import type { Rpc } from "./store/convex/rpc";
import type { StorePort } from "./store/types";

export interface NotifyWiring {
	notifier: NotifyPort;
	/** `/v1/public/reminders/...`, mounted when the links can be signed. */
	reminders: Hono | undefined;
	/** Stops the outbox drain. */
	stop: () => void;
	/** Delivers what is due now (the drain does this on a timer). */
	drain: () => Promise<number>;
}

const placeOf = (app: string): string =>
	app in APP_DEFAULTS ? APP_DEFAULTS[app as AppKey].place.address : "";

/**
 * The notifications: through the estate's Novu with a DURABLE outbox (Convex, so a restart or a second replica loses
 * nothing and the idempotency key keeps a retry from sending twice), and the reminder links with their single-use record
 * durable too. Without `NOVU_*` / `REMINDER_LINK_SECRET` (development only: production refuses to start) the
 * notifications are logged by id and no link is signed.
 */
export function wireNotify(input: {
	config: Config;
	store: StorePort;
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
			stop: () => undefined,
			drain: () => Promise.resolve(0),
		};

	const durable = config.store.kind === "convex" && rpc !== undefined;
	const outbox = durable ? createConvexOutbox(rpc) : createMemoryOutbox();
	const used = durable ? createConvexUsedLinks(rpc) : createMemoryUsedLinks(clock);
	const notifier = createNotifier({
		novu: {
			apiUrl: config.notify.novuApiUrl,
			secretKey: config.notify.novuSecretKey,
			...(input.fetch === undefined ? {} : { fetch: input.fetch }),
		},
		apps: NOTIFY_APPS,
		outbox,
		now: clock,
		log: ({ level, msg, ...rest }) => log({ level, event: msg, requestId: "notify", ...rest }),
	});
	return {
		drain: () => notifier.drain(),
		notifier: createNovuNotify({
			notifier,
			store,
			log,
			clock,
			links: { publicOrigin: config.publicUrl, secret: config.notify.reminderLinkSecret },
		}),
		reminders: mountReminderRoutes({
			secret: config.notify.reminderLinkSecret,
			used,
			actions: createReminderActions(store, clock, placeOf),
			notifier,
			now: clock,
		}),
		stop: notifier.start(),
	};
}
