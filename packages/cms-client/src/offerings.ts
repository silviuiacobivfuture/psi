import { BrandSchema, IsoDate, type Locale, Localized, Slug } from "@psi/content";
import { z } from "zod";

/**
 * Services, programmes and protocols with their prices, published from the CMS (`offerings`).
 * A price is a fact the owner enters; until one is published the sites keep their placeholder.
 * Scheduling never reads this: it owns practitioners, services, durations and availability.
 */
const Amount = z.number().positive().max(1_000_000);
export const Price = z
	.discriminatedUnion("mode", [
		z.object({ mode: z.literal("fixed"), amount: Amount, currency: z.literal("RON") }),
		z.object({ mode: z.literal("range"), from: Amount, to: Amount, currency: z.literal("RON") }),
		z.object({ mode: z.literal("from"), from: Amount, currency: z.literal("RON") }),
		z.object({ mode: z.literal("on_request") }),
	])
	.superRefine((p, ctx) => {
		if (p.mode === "range" && p.from >= p.to) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "from < to" });
		}
	});
export type Price = z.infer<typeof Price>;

export const OFFERING_KINDS = ["service", "programme", "protocol"] as const;

export const Offering = z.object({
	brand: BrandSchema,
	slug: Slug,
	kind: z.enum(OFFERING_KINDS),
	title: Localized,
	summary: Localized.nullable(),
	price: Price,
	priceNote: Localized.nullable(),
	validFrom: IsoDate.nullable(),
	sortOrder: z.number().int(),
	/** A demonstration entry (local seed): never a real price, never shown in production. */
	demo: z.boolean(),
});
export type Offering = z.infer<typeof Offering>;

/** One offering in one locale, as a page shows it. */
export interface LocalizedOffering {
	slug: string;
	kind: Offering["kind"];
	title: string;
	summary: string | null;
	price: Price;
	priceNote: string | null;
	demo: boolean;
}

const Loc = z.object({ ro: z.string().nullish(), en: z.string().nullish() }).partial().nullish();
const PayloadOffering = z.object({
	brand: z.string(),
	slug: z.string(),
	kind: z.string(),
	title: Loc,
	summary: Loc,
	price: z
		.object({
			mode: z.string().nullish(),
			amount: z.number().nullish(),
			from: z.number().nullish(),
			to: z.number().nullish(),
			currency: z.string().nullish(),
		})
		.nullish(),
	priceNote: Loc,
	validFrom: z.string().nullish(),
	sortOrder: z.number().nullish(),
	demo: z.boolean().nullish(),
});

function both(l: z.infer<typeof Loc>): { ro: string; en: string } | null {
	const ro = l?.ro?.trim();
	const en = l?.en?.trim();
	return ro && en ? { ro, en } : null;
}

/** A Payload REST document (`locale=all`) to an `Offering`, or null when it breaks the contract. */
export function offeringFromPayload(raw: unknown): Offering | null {
	const d = PayloadOffering.safeParse(raw);
	if (!d.success) return null;
	const p = d.data.price ?? {};
	const o = Offering.safeParse({
		brand: d.data.brand,
		slug: d.data.slug,
		kind: d.data.kind,
		title: both(d.data.title),
		summary: both(d.data.summary),
		price: {
			mode: p.mode,
			amount: p.amount,
			from: p.from,
			to: p.to,
			currency: p.currency ?? "RON",
		},
		priceNote: both(d.data.priceNote),
		validFrom: d.data.validFrom?.slice(0, 10) ?? null,
		sortOrder: d.data.sortOrder ?? 0,
		demo: d.data.demo ?? false,
	});
	return o.success ? o.data : null;
}

/** The site's own words for a price (its i18n); numbers are formatted here, per locale. */
export interface PriceLabels {
	fixed(amount: string): string;
	range(from: string, to: string): string;
	from(amount: string): string;
	onRequest: string;
}

const NUMBER: Readonly<Record<Locale, Intl.NumberFormat>> = {
	ro: new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }),
	en: new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }),
};

export function formatPrice(price: Price, locale: Locale, labels: PriceLabels): string {
	const n = (x: number): string => NUMBER[locale].format(x);
	switch (price.mode) {
		case "fixed":
			return labels.fixed(n(price.amount));
		case "range":
			return labels.range(n(price.from), n(price.to));
		case "from":
			return labels.from(n(price.from));
		case "on_request":
			return labels.onRequest;
	}
}

export interface OfferingsClientOptions {
	/** The CMS origin; offerings are public (published only), no key is needed. */
	cmsUrl: string;
	/** Show demonstration entries (local and staging only, never production). */
	includeDemo: boolean;
	ttlMs?: number;
	fetch?: typeof fetch;
	now?: () => number;
	onError?: (message: string) => void;
}

export interface OfferingsClient {
	/**
	 * A brand's published offerings in one locale, by `sortOrder`, from memory (never waits; a
	 * stale cache starts a background refresh). Empty until the CMS has answered once.
	 */
	offeringsFor(brand: Offering["brand"], locale: Locale): ReadonlyArray<LocalizedOffering>;
	/** Re-reads now; keeps the last good list on failure. Never throws. */
	refresh(): Promise<void>;
}

const Page = z.object({ docs: z.array(z.unknown()) });

export function createOfferingsClient(o: OfferingsClientOptions): OfferingsClient {
	const ttl = o.ttlMs ?? 60_000;
	const now = o.now ?? Date.now;
	const f = o.fetch ?? fetch;
	let list: ReadonlyArray<Offering> = [];
	let fetchedAt = Number.NEGATIVE_INFINITY;
	let inflight: Promise<void> | null = null;

	async function load(): Promise<void> {
		try {
			const q = new URLSearchParams({
				locale: "all",
				depth: "0",
				limit: "500",
				"where[_status][equals]": "published",
			});
			const r = await f(`${o.cmsUrl}/api/offerings?${q}`, {
				headers: { accept: "application/json" },
				signal: AbortSignal.timeout(5000),
			});
			if (!r.ok) throw new Error(`cms answered ${r.status}`);
			list = Page.parse(await r.json())
				.docs.map(offeringFromPayload)
				.filter((x): x is Offering => x !== null && (o.includeDemo || !x.demo));
		} catch (err) {
			o.onError?.(`offerings: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			fetchedAt = now();
		}
	}

	function refresh(): Promise<void> {
		inflight ??= load().finally(() => {
			inflight = null;
		});
		return inflight;
	}

	return {
		offeringsFor(brand, locale) {
			if (now() - fetchedAt >= ttl) void refresh();
			return list
				.filter((x) => x.brand === brand)
				.sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug))
				.map((x) => ({
					slug: x.slug,
					kind: x.kind,
					title: x.title[locale],
					summary: x.summary?.[locale] ?? null,
					price: x.price,
					priceNote: x.priceNote?.[locale] ?? null,
					demo: x.demo,
				}));
		},
		refresh,
	};
}

/** What a page renders for each offering (the shape of @psi/ui's OfferingPrices items). */
export interface PriceItem {
	slug: string;
	title: string;
	price: string;
	summary: string | null;
	note: string | null;
	demoLabel: string | null;
}

/** Offerings worded for a page, in the site's language. */
export function priceItems(
	offerings: ReadonlyArray<LocalizedOffering>,
	locale: Locale,
	labels: PriceLabels & { demo: string },
): PriceItem[] {
	return offerings.map((o) => ({
		slug: o.slug,
		title: o.title,
		price: formatPrice(o.price, locale, labels),
		summary: o.summary,
		note: o.priceNote,
		demoLabel: o.demo ? labels.demo : null,
	}));
}
