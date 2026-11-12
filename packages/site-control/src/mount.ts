import type { Account, ReservationsPort } from "@psi/account";
import {
	type AiSettingsClient,
	type ControlPorts,
	type CopyDefaults,
	handleControl,
	type KnowledgeStatus,
	type PartState,
	type Site,
	type SiteStatus,
} from "@psi/cms-client";
import type { Guide } from "@psi/guide";
import type { Pwa } from "@psi/pwa";
import type { Hono } from "hono";
import { accountsPort } from "./accounts-port";
import { readSiteControlEnv } from "./env";
import { countingScope } from "./guide-counts";
import { type GuideCounters, guidePort } from "./guide-port";
import { pushPort } from "./push-port";
import { type StaffCheck, staffCheck } from "./staff";
import { STAFF_LINK_PATH, type StaffLinkWords, staffLinkHtml } from "./staff-link";

export interface SiteControlOptions {
	brand: Site;
	env?: Readonly<Record<string, string | undefined>>;
	/** The guide visitors use (wrapped with `countingGuide` for today's counts). */
	guide?: Guide & Partial<GuideCounters>;
	aiSettings?: AiSettingsClient | null;
	account?: Account;
	/** The scheduling store's reservations (Psizone), for the person view, export and erasure. */
	reservations?: ReservationsPort;
	pwa?: Pwa;
	/** Whether this site's scheduling is configured (readSchedulingEnv), never a key. */
	scheduling: { state: PartState; reason?: string };
	/** The Compass link's words, from the site's own messages. */
	staffLink: (locale: "ro" | "en") => StaffLinkWords;
	/**
	 * The guide's built-in copy, from the site's own messages (greeting, chips, redirect, "not on
	 * our site", exchange limit): the CMS studio shows it as each field's placeholder.
	 */
	guideCopy?: (locale: "ro" | "en") => CopyDefaults;
	now?: () => number;
	fetch?: typeof fetch;
}

export interface SiteControl {
	/** The ports `/__control/*` answers with (exposed for the site's tests). */
	readonly ports: ControlPorts;
	readonly staff: StaffCheck;
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Mounts the control plane's routes on a site: `/__control/*` (signed, never public), `/admin` and
 * `/en/admin` (302 to the control plane with this brand chosen), and the Compass's staff link
 * (`/__admin/compass`, read only by a signed-in browser; answers nothing to anyone else).
 */
export function mountSiteControl(app: Hono, o: SiteControlOptions): SiteControl {
	const env = readSiteControlEnv(o.env ?? process.env);
	const now = o.now ?? Date.now;
	const startedAt = new Date(now()).toISOString();
	const settings = async () =>
		o.aiSettings === null || o.aiSettings === undefined ? null : o.aiSettings.get();
	const guide =
		o.guide === undefined
			? null
			: guidePort({
					brand: o.brand,
					guide: o.guide,
					now,
					screeningLevel: async () => (await settings())?.screeningLevel ?? "standard",
					...(o.guideCopy === undefined ? {} : { copyDefaults: o.guideCopy }),
				});

	async function knowledge(): Promise<KnowledgeStatus> {
		const k = o.guide?.operations?.knowledge ?? null;
		if (k === null) {
			return {
				state: "not_configured",
				store: null,
				embedder: null,
				indexes: [],
				lastIngest: null,
			};
		}
		const base = { store: k.store, embedder: k.embedder, lastIngest: guide?.lastIngest() ?? null };
		try {
			const indexes = (await k.indexStats()).map((i) => ({ ...i, dimension: i.dimension }));
			return { state: "on", indexes, ...base };
		} catch (err) {
			return { state: "error", indexes: [], error: message(err).slice(0, 200), ...base };
		}
	}

	async function status(): Promise<SiteStatus> {
		const s = await settings().catch(() => null);
		const g = o.guide;
		return {
			brand: o.brand,
			startedAt,
			guide:
				g === undefined
					? {
							state: "not_configured",
							model: null,
							hasKey: false,
							screeningLevel: null,
							today: { asked: 0, unanswered: 0 },
						}
					: {
							state: s === null || s.guideEnabled ? "on" : "off",
							model: g.model,
							hasKey: (await g.operations?.agent().catch(() => null))?.hasKey ?? false,
							screeningLevel: s?.screeningLevel ?? "standard",
							today: g.today?.() ?? { asked: 0, unanswered: 0 },
						},
			knowledge: await knowledge(),
			scheduling: o.scheduling,
			accounts:
				o.account === undefined
					? { state: "not_configured", storage: null, missing: [] }
					: {
							state: o.account.enabled ? "on" : "off",
							storage: o.account.status.storage,
							missing: [...o.account.status.missing],
						},
			push:
				o.pwa === undefined
					? { state: "not_configured", storage: null }
					: {
							state: o.pwa.config.vapid === null ? "off" : "on",
							storage: o.pwa.config.storage,
							...(o.pwa.config.off === null ? {} : { reason: o.pwa.config.off }),
						},
		};
	}

	const ports: ControlPorts = {
		brand: o.brand,
		status,
		...(guide === null ? {} : { guide: guide.port }),
		...(o.pwa === undefined ? {} : { push: pushPort(o.pwa, o.brand) }),
		...(o.account === undefined || !o.account.enabled
			? {}
			: { accounts: accountsPort(o.account, o.reservations) }),
		onAudit: (e) => console.info(`control: ${e.route} by cms user ${e.actor} → ${e.status}`),
	};
	app.all("/__control/*", (c) => handleControl(c.req.raw, env.secret, ports, now));
	// Every later route: may this request move the guide's counters (DNT, GPC, crawlers)?
	app.use("*", countingScope());

	const target = `${env.adminUrl}/admin/platform?brand=${o.brand}`;
	for (const path of ["/admin", "/admin/", "/en/admin", "/en/admin/"]) {
		app.get(path, (c) => c.redirect(target, 302));
	}

	const staff = staffCheck({
		cmsUrl: env.cmsUrl,
		secret: env.secret,
		brand: o.brand,
		now,
		...(o.fetch === undefined ? {} : { fetch: o.fetch }),
	});
	app.get(STAFF_LINK_PATH, async (c) => {
		const locale = c.req.query("l") === "en" ? "en" : "ro";
		const none = () => c.body(null, 204, { "cache-control": "private, no-store" });
		if (o.account === undefined || !o.account.enabled) return none();
		const person = await o.account.person(c).catch(() => null);
		if (person === null || !(await staff.isStaff(person.subject, person.email))) return none();
		const href = locale === "en" ? "/en/admin" : "/admin";
		return c.html(staffLinkHtml(o.staffLink(locale), href), 200, {
			"cache-control": "private, no-store",
		});
	});
	return { ports, staff };
}
