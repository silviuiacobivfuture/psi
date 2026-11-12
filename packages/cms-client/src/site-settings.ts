import { z } from "zod";
import { type Site, SiteSchema } from "./ai-settings";

/**
 * Per-brand site settings the owners manage in the CMS (Payload global `site-settings`, one group
 * per site): contact phones, addresses, opening hours, social links, the hero's "years" figure and
 * three feature toggles. THE FALLBACK RULE: every field is per-field optional, and a missing or
 * blank one means "keep what the site does today". A toggle is three-valued (`inherit` | `on` |
 * `off`) so a fresh, empty global never switches anything off; no CMS at all is the same as every
 * field unset.
 */
export const TOGGLES = ["bookingInChat", "accountsSignIn", "installPrompt"] as const;
export type Toggle = (typeof TOGGLES)[number];
export const ToggleValue = z.enum(["inherit", "on", "off"]);
export type ToggleValue = z.infer<typeof ToggleValue>;

export const SOCIAL_NETWORKS = ["facebook", "instagram", "youtube", "linkedin", "tiktok"] as const;

/** Romanian mobile or landline as dialled (+40 and nine digits), or any E.164 number. */
const Tel = z.string().regex(/^\+[1-9]\d{7,14}$/);
const Text = z.string().trim().min(1).max(200);
const Both = z.object({ ro: Text, en: Text });
export type Both = z.infer<typeof Both>;

export const Phone = z.object({ tel: Tel, display: Text, label: Both.nullable() });
export type Phone = z.infer<typeof Phone>;
export const Address = z.object({
	label: Both.nullable(),
	street: Text,
	city: Text,
	country: z.string().length(2),
	mapUrl: z.string().url().nullable(),
});
export type Address = z.infer<typeof Address>;
export const OpeningHours = z.object({ days: Both, hours: Text });
export type OpeningHours = z.infer<typeof OpeningHours>;
export const SocialLink = z.object({ network: z.enum(SOCIAL_NETWORKS), url: z.string().url() });
export type SocialLink = z.infer<typeof SocialLink>;

/** One site's settings: `null` (or an empty list) = the site's own value. */
export const SiteSettings = z.object({
	phones: z.array(Phone).nullable(),
	addresses: z.array(Address).nullable(),
	openingHours: z.array(OpeningHours).nullable(),
	social: z.array(SocialLink).nullable(),
	heroYears: z.number().int().min(1).max(200).nullable(),
	toggles: z.object({
		bookingInChat: ToggleValue,
		accountsSignIn: ToggleValue,
		installPrompt: ToggleValue,
	}),
});
export type SiteSettings = z.infer<typeof SiteSettings>;

/** Nothing set: the site runs exactly as it does today. */
export const SITE_SETTINGS_UNSET: SiteSettings = {
	phones: null,
	addresses: null,
	openingHours: null,
	social: null,
	heroYears: null,
	toggles: { bookingInChat: "inherit", accountsSignIn: "inherit", installPrompt: "inherit" },
};

const Str = z.string().nullish();
const RawBoth = z.object({ ro: Str, en: Str }).partial().nullish();
const Rows = <T extends z.ZodTypeAny>(row: T) => z.array(row).nullish();
const RawGroup = z
	.object({
		phones: Rows(z.object({ tel: Str, display: Str, labelRo: Str, labelEn: Str }).passthrough()),
		addresses: Rows(
			z
				.object({
					labelRo: Str,
					labelEn: Str,
					street: Str,
					city: Str,
					country: Str,
					mapUrl: Str,
				})
				.passthrough(),
		),
		openingHours: Rows(z.object({ daysRo: Str, daysEn: Str, hours: Str }).passthrough()),
		social: Rows(z.object({ network: Str, url: Str }).passthrough()),
		heroYears: z.number().nullish(),
		bookingInChat: Str,
		accountsSignIn: Str,
		installPrompt: Str,
		label: RawBoth,
	})
	.passthrough();

function both(ro: string | null | undefined, en: string | null | undefined): Both | null {
	const p = Both.safeParse({ ro: ro ?? "", en: en ?? "" });
	return p.success ? p.data : null;
}

/** Keeps the rows that parse; an empty result is "unset" (the site's own value). */
function rows<R, T>(
	input: ReadonlyArray<R> | null | undefined,
	map: (r: R) => unknown,
	schema: z.ZodType<T>,
): T[] | null {
	const out: T[] = [];
	for (const r of input ?? []) {
		const p = schema.safeParse(map(r));
		if (p.success) out.push(p.data);
	}
	return out.length === 0 ? null : out;
}

function toggle(v: string | null | undefined): ToggleValue {
	const p = ToggleValue.safeParse(v);
	return p.success ? p.data : "inherit";
}

/** One site's settings from the global's REST answer; unreadable or absent = unset. */
export function siteSettingsFor(raw: unknown, site: Site): SiteSettings {
	const doc = z.record(z.unknown()).safeParse(raw);
	const g = RawGroup.safeParse(doc.success ? doc.data[site] : undefined);
	if (!g.success) return SITE_SETTINGS_UNSET;
	const d = g.data;
	const years = z.number().int().min(1).max(200).safeParse(d.heroYears);
	return {
		phones: rows(
			d.phones,
			(r) => ({
				tel: r.tel?.replace(/[\s.-]/g, ""),
				display: r.display ?? r.tel,
				label: both(r.labelRo, r.labelEn),
			}),
			Phone,
		),
		addresses: rows(
			d.addresses,
			(r) => ({
				label: both(r.labelRo, r.labelEn),
				street: r.street,
				city: r.city,
				country: r.country ?? "RO",
				mapUrl: r.mapUrl === "" ? null : (r.mapUrl ?? null),
			}),
			Address,
		),
		openingHours: rows(
			d.openingHours,
			(r) => ({
				days: both(r.daysRo, r.daysEn),
				hours: r.hours,
			}),
			OpeningHours,
		),
		social: rows(d.social, (r) => ({ network: r.network, url: r.url }), SocialLink),
		heroYears: years.success ? years.data : null,
		toggles: {
			bookingInChat: toggle(d.bookingInChat),
			accountsSignIn: toggle(d.accountsSignIn),
			installPrompt: toggle(d.installPrompt),
		},
	};
}

/** A toggle resolved against what the site does today. */
export function toggleOn(settings: SiteSettings, key: Toggle, today: boolean): boolean {
	const v = settings.toggles[key];
	return v === "inherit" ? today : v === "on";
}

/** A list setting, or the site's own value when the CMS has none. */
export function orToday<T>(
	value: ReadonlyArray<T> | null,
	today: ReadonlyArray<T>,
): ReadonlyArray<T> {
	return value === null || value.length === 0 ? today : value;
}

export interface SiteSettingsClientOptions {
	cmsUrl: string;
	/** The site's read-only Payload API key (its service user). */
	apiKey: string;
	site: Site;
	ttlMs?: number;
	fetch?: typeof fetch;
	now?: () => number;
	onError?: (message: string) => void;
}

export interface SiteSettingsClient {
	/** What is known now, without waiting (unset until the first answer). Never throws. */
	current(): SiteSettings;
	/** Re-reads when older than the ttl; on failure keeps the last known. Never throws. */
	refresh(): Promise<SiteSettings>;
	invalidate(): void;
}

export function createSiteSettingsClient(o: SiteSettingsClientOptions): SiteSettingsClient {
	SiteSchema.parse(o.site);
	const ttl = o.ttlMs ?? 60_000;
	const now = o.now ?? Date.now;
	const f = o.fetch ?? fetch;
	let known: SiteSettings = SITE_SETTINGS_UNSET;
	let fetchedAt = Number.NEGATIVE_INFINITY;
	let inflight: Promise<SiteSettings> | null = null;

	async function load(): Promise<SiteSettings> {
		try {
			const r = await f(`${o.cmsUrl}/api/globals/site-settings?depth=0`, {
				headers: { accept: "application/json", authorization: `users API-Key ${o.apiKey}` },
				signal: AbortSignal.timeout(5000),
			});
			if (!r.ok) throw new Error(`cms answered ${r.status}`);
			known = siteSettingsFor(await r.json(), o.site);
		} catch (err) {
			o.onError?.(`site-settings: ${err instanceof Error ? err.message : String(err)}`);
		}
		fetchedAt = now();
		return known;
	}

	return {
		current: () => known,
		async refresh() {
			if (now() - fetchedAt < ttl) return known;
			inflight ??= load().finally(() => {
				inflight = null;
			});
			return inflight;
		},
		invalidate() {
			fetchedAt = Number.NEGATIVE_INFINITY;
		},
	};
}

/** A site's client from `CMS_URL` and `CMS_API_KEY`; null without them (today's values, always). */
export function siteSettingsFromEnv(
	env: Readonly<Record<string, string | undefined>>,
	site: Site,
	onError: (message: string) => void = (m) => console.warn(m),
): SiteSettingsClient | null {
	const url = env.CMS_URL?.trim().replace(/\/+$/, "");
	const key = env.CMS_API_KEY?.trim();
	if (url === undefined || url === "" || key === undefined || key === "") return null;
	const client = createSiteSettingsClient({ cmsUrl: url, apiKey: key, site, onError });
	void client.refresh();
	// Keep it warm: pages read `current()` synchronously and never wait for the CMS.
	setInterval(() => void client.refresh(), 60_000).unref();
	return client;
}
