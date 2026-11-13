/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { createHash } from "node:crypto";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { PwaBrand } from "./brand";
import { CLIENT_JS, WORKER_JS } from "./bundles.generated";
import { PwaHead } from "./head";
import { buildManifest, ICON_BASE } from "./manifest";
import { OfflinePage } from "./offline-page";
import { type Identity, mountPushApi, PUSH_PATHS } from "./push/api";
import { type PushConfig, readPushConfig } from "./push/config";
import { createNotifier, type Notifier, startReminderClock } from "./push/notifier";
import type { PushStore } from "./push/store";
import { type PushTransport, webPushTransport } from "./push/transport";
import type { ArticleBrand, PushLocale, SubscriptionRecord, Topic } from "./push/types";
import { DeviceList } from "./ui/devices";
import { NotifyPanel } from "./ui/notify-panel";
import { PwaTools } from "./ui/tools";
import {
	deviceRows,
	devicesLabels,
	manifestText,
	offlineText,
	type PwaMessages,
	panelLabels,
	purposes,
	pushTexts,
	toolsLabels,
} from "./words";
import type { WorkerConfig } from "./worker-config";

export interface PwaSite {
	brand: PwaBrand;
	/** This site's canonical origin (writes are accepted only from it). */
	origin: string;
	/** Every estate origin: a notification may lead to one of them. */
	origins: ReadonlyArray<string>;
	/** Each locale's path prefix: `{ ro: "", en: "/en" }`. */
	prefixes: Readonly<Record<PushLocale, string>>;
	/** The theme the offline page wears. */
	theme: string;
	/** The app's Paraglide `m`: every word the PWA shows (messages/pwa/{locale}.json). */
	messages: PwaMessages;
	/** Each estate site's name in a locale (the estate's `siteNames`). */
	siteNames: (locale: PushLocale) => Readonly<Record<ArticleBrand | "blog", string>>;
	/** The purposes this site offers. */
	topics: ReadonlyArray<Topic>;
	identity: Identity;
	/** The notifications page per locale (it is noindex). */
	notificationsPath: (locale: PushLocale) => string;
	/** `mountPushApi`'s device-change hook: where `@psi/notify` keeps Novu's push tokens in step. */
	onDevicesChanged?: (subject: string) => Promise<void>;
}

export interface Pwa {
	/** Adds the routes to the site's app (call once, early: before the routes it observes). */
	mount(app: Hono): void;
	readonly config: PushConfig;
	readonly clientPath: string;
	store(): Promise<PushStore>;
	/** Null when push is off (no VAPID pair). */
	notifier(): Promise<Notifier | null>;
	/** The VAPID transport, for `@psi/notify`'s Novu push hook; null when push is off. */
	transport(): PushTransport | null;
	/** The `<head>` additions for a page in `locale`; `noindex` for the PWA's own pages. */
	head(locale: PushLocale, path?: string): JSX.Element;
	/** The Compass tools: install (when installable), the iOS note, and — push on — the notifications link. */
	tools(locale: PushLocale, options?: { install?: boolean; menu?: boolean }): JSX.Element;
	/** The notifications page's body: the per-purpose controls and, signed in, the devices. */
	notifications(props: NotificationsProps): JSX.Element;
	/** A signed-in person's devices on every site (for `notifications`). */
	devices(subject: string | null): Promise<ReadonlyArray<SubscriptionRecord>>;
	offlinePath(locale: PushLocale): string;
}

export interface NotificationsProps {
	locale: PushLocale;
	signedIn: boolean;
	/** Where "sign in to receive these" leads (back to this page). */
	signInHref: string;
	devices: ReadonlyArray<SubscriptionRecord>;
}

const hash = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 10);

const SW_HEADERS = {
	"content-type": "text/javascript; charset=utf-8",
	"cache-control": "no-cache",
	"service-worker-allowed": "/",
} as const;

/**
 * One site's PWA. `mount(app)` adds `/manifest.webmanifest` (and `/en/…`), `/sw.js` at the root
 * scope, the hashed client under /assets/pwa/, the offline pages and the push API; `head()` is
 * what the layout prints. Created at module load (the layout needs it), mounted by the server.
 */
export function createPwa(site: PwaSite, config: PushConfig = readPushConfig()): Pwa {
	const pushOn = config.vapid !== null;
	if (config.off !== null) {
		console.log(
			`[pwa:${site.brand}] push notifications off: ${config.off}; install and offline still work`,
		);
	}
	const clientPath = `${ICON_BASE}/client.${hash(CLIENT_JS)}.js`;
	const locales = Object.keys(site.prefixes).filter(
		(l): l is PushLocale => l === "ro" || l === "en",
	);
	const manifestPath = (l: PushLocale) => `${site.prefixes[l]}/manifest.webmanifest`;
	const offlinePath = (l: PushLocale) => `${site.prefixes[l]}/offline`;
	const home = (l: PushLocale) => site.prefixes[l] || "/";

	let notifier: Promise<Notifier | null> | null = null;
	const getNotifier = (): Promise<Notifier | null> => {
		const vapid = config.vapid;
		if (vapid === null) return Promise.resolve(null);
		if (notifier === null) {
			notifier = config.store().then((store) => {
				const n = createNotifier({ store, transport: webPushTransport(vapid) });
				startReminderClock(n);
				return n;
			});
			notifier.catch(() => {
				notifier = null;
			});
		}
		return notifier;
	};

	const workerConfig = (): WorkerConfig => {
		const body: Omit<WorkerConfig, "version"> = {
			site: site.brand,
			shell: [
				"/assets/app.css",
				"/assets/datastar.js",
				clientPath,
				`${ICON_BASE}/icon-192.png`,
				`${ICON_BASE}/badge-96.png`,
			],
			offline: { ro: offlinePath("ro"), en: offlinePath("en") },
			texts: { ro: pushTexts(site.messages, "ro"), en: pushTexts(site.messages, "en") },
			brandNames: { ro: site.siteNames("ro"), en: site.siteNames("en") },
			names: {
				ro: manifestText(site.messages, "ro").shortName,
				en: manifestText(site.messages, "en").shortName,
			},
			icon: `${ICON_BASE}/icon-192.png`,
			badge: `${ICON_BASE}/badge-96.png`,
			origins: [...site.origins],
		};
		return { ...body, version: hash(JSON.stringify(body) + WORKER_JS) };
	};
	const worker = (() => {
		let cached: string | null = null;
		return () => {
			cached ??= `self.__PSI_PWA__=${JSON.stringify(workerConfig())};\n${WORKER_JS}\n`;
			return cached;
		};
	})();

	const quiet = new Set(locales.flatMap((l) => [site.notificationsPath(l), offlinePath(l)]));
	return {
		mount(app) {
			// A page rendered for a signed-in person is never kept by the worker or any cache: when the
			// route said nothing about caching, say "private, no-store" (the worker's `storable` reads it).
			app.use(async (c, next) => {
				await next();
				if (
					c.req.method === "GET" &&
					site.identity.current(c) !== null &&
					(c.res.headers.get("content-type") ?? "").startsWith("text/html") &&
					!c.res.headers.has("cache-control")
				) {
					c.res.headers.set("cache-control", "private, no-store");
				}
			});
			// A site that takes bookings starts its reminder clock now, not on its first push.
			if (site.topics.includes("booking")) {
				getNotifier().catch((err: unknown) => console.warn(`[pwa:${site.brand}] ${String(err)}`));
			}
			app.get("/sw.js", (c) => c.body(worker(), 200, SW_HEADERS));
			app.get(clientPath, (c) =>
				c.body(CLIENT_JS, 200, {
					"content-type": "text/javascript; charset=utf-8",
					"cache-control": "public, max-age=31536000, immutable",
				}),
			);
			for (const l of locales) {
				app.get(manifestPath(l), (c) =>
					c.body(
						JSON.stringify(
							buildManifest({
								brand: site.brand,
								lang: l,
								startUrl: home(l),
								text: manifestText(site.messages, l),
							}),
						),
						200,
						{
							"content-type": "application/manifest+json; charset=utf-8",
							"cache-control": "public, max-age=3600",
						},
					),
				);
				app.get(offlinePath(l), (c) =>
					c.html(
						<OfflinePage
							lang={l}
							theme={site.theme}
							text={offlineText(site.messages, l)}
							homeHref={home(l)}
							stylesheet="/assets/app.css"
							appTitle={manifestText(site.messages, l).shortName}
						/>,
						200,
						{ "cache-control": "no-cache" },
					),
				);
			}

			mountPushApi(app, {
				enabled: pushOn,
				site: site.brand,
				origin: site.origin,
				topics: site.topics,
				store: config.store,
				notifier: getNotifier,
				identity: site.identity,
				notifySecret: config.notifySecret,
				returnTo: site.notificationsPath,
				...(site.onDevicesChanged ? { onDevicesChanged: site.onDevicesChanged } : {}),
			});
		},
		config,
		clientPath,
		store: config.store,
		notifier: getNotifier,
		transport: () => (config.vapid === null ? null : webPushTransport(config.vapid)),
		head(locale, path) {
			return (
				<PwaHead
					manifest={manifestPath(locale)}
					appTitle={manifestText(site.messages, locale).shortName}
					client={clientPath}
					vapidPublicKey={config.vapid?.publicKey ?? null}
					noindex={path !== undefined && quiet.has(path)}
				/>
			);
		},
		offlinePath,
		tools(locale, options) {
			return (
				<PwaTools
					labels={toolsLabels(site.messages, locale)}
					install={options?.install ?? true}
					menu={options?.menu ?? false}
					{...(pushOn ? { notificationsHref: site.notificationsPath(locale) } : {})}
				/>
			);
		},
		notifications({ locale, signedIn, signInHref, devices }) {
			// Push off: no control to press, only the plain statement that it is unavailable.
			if (!pushOn)
				return <p class="text-body text-ink-muted">{panelLabels(site.messages, locale).off}</p>;
			return (
				<div class="flex flex-col gap-10">
					<NotifyPanel
						purposes={purposes(site.messages, locale, site.topics)}
						labels={panelLabels(site.messages, locale)}
						signedIn={signedIn}
						signInHref={signInHref}
					/>
					{signedIn ? (
						<DeviceList
							locale={locale}
							labels={devicesLabels(site.messages, locale)}
							rows={deviceRows(site.messages, locale, devices, (s) =>
								s === "clinic"
									? manifestText(site.messages, locale).shortName
									: site.siteNames(locale)[s],
							)}
						/>
					) : null}
				</div>
			);
		},
		async devices(subject) {
			return subject === null || !pushOn ? [] : (await config.store()).forSubject(subject);
		},
	};
}

export { PUSH_PATHS };
