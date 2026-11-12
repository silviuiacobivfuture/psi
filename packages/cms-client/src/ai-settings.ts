import { z } from "zod";
import {
	AiBehaviour,
	BEHAVIOUR_DEFAULTS,
	behaviourFrom,
	type CopyDefaults,
	copyWithDefaults,
	guideCopyFor,
} from "./ai-behaviour";

/**
 * Per-brand AI settings, kept in the shared CMS (Payload global `ai-settings`, one group per site)
 * and read by each site's guide. No secret lives here: the OpenRouter key stays in OpenBao and in
 * the site's environment. This schema IS the contract with the CMS and the engine.
 */
export const SITES = ["psizone", "eqsync", "hemisync", "blog"] as const;
export const SiteSchema = z.enum(SITES);
export type Site = z.infer<typeof SiteSchema>;

/** Embedding models a brand may choose; a change of model means a new vector space (re-index). */
export const EMBED_MODELS = [
	"openai/text-embedding-3-small",
	"openai/text-embedding-3-large",
] as const;
export const EmbedModelSchema = z.enum(EMBED_MODELS);

export const AiSettings = z.object({
	/** `openrouter` embeddings, or the offline `lexical` fallback. */
	embeddings: z.enum(["openrouter", "lexical"]),
	embedModel: EmbedModelSchema,
	deepSearch: z.boolean(),
	guideEnabled: z.boolean(),
	/**
	 * Questions one visitor may ask the guide within the window, counted separately per session,
	 * per browser and per fingerprint (the engine enforces it).
	 */
	exchangeLimit: z.number().int().min(1).max(200),
	/** The window `exchangeLimit` is counted over, in hours. */
	exchangeWindowHours: z.number().int().min(1).max(168),
	/**
	 * `standard`: word rules, personal-data redaction, crisis and scope rules (free). `strict`: also
	 * the two AI detectors for prompt injection and abusive content (two extra model calls a question).
	 */
	screeningLevel: z.enum(["standard", "strict"]),
	/**
	 * How the guide behaves (voice, copy, topics, model): the studio's settings, version 1.
	 * Read leniently, field by field (`behaviourFrom`): an older site ignores what it does not
	 * know, a newer field never turns the whole group unreadable.
	 */
	behaviour: AiBehaviour,
	/** Who last changed this brand's settings (their name), and when; read-only. */
	updatedBy: z.string().nullable(),
	updatedAt: z.string().datetime({ offset: true }).nullable(),
});
export type AiSettings = z.infer<typeof AiSettings>;

/** What a site runs with when the CMS has never answered. */
export const AI_SETTINGS_DEFAULTS: AiSettings = {
	embeddings: "openrouter",
	embedModel: "openai/text-embedding-3-small",
	deepSearch: false,
	guideEnabled: true,
	exchangeLimit: 20,
	exchangeWindowHours: 24,
	screeningLevel: "standard",
	behaviour: BEHAVIOUR_DEFAULTS,
	updatedBy: null,
	updatedAt: null,
};

/** One brand's group as Payload answers it: blank fields fall back to the defaults. */
const Group = z
	.object({
		embeddings: AiSettings.shape.embeddings.nullish(),
		embedModel: EmbedModelSchema.nullish(),
		deepSearch: z.boolean().nullish(),
		guideEnabled: z.boolean().nullish(),
		exchangeLimit: z.number().nullish(),
		exchangeWindowHours: z.number().nullish(),
		screeningLevel: z.enum(["standard", "strict"]).nullish(),
		behaviour: z.unknown(),
		updatedBy: z.string().nullish(),
		updatedAt: z.string().nullish(),
	})
	.passthrough();

/** GET /api/globals/ai-settings: a site's read-only key sees its own brand's group only. */
export const AiSettingsGlobal = z
	.object({
		psizone: Group.nullish(),
		eqsync: Group.nullish(),
		hemisync: Group.nullish(),
		blog: Group.nullish(),
	})
	.passthrough();

/** One site's settings from the global; null when the group is absent (not readable, or unset). */
export function settingsFor(raw: unknown, site: Site): AiSettings | null {
	const g = AiSettingsGlobal.safeParse(raw);
	const group = g.success ? g.data[site] : null;
	if (group === null || group === undefined) return null;
	const d = AI_SETTINGS_DEFAULTS;
	const parsed = AiSettings.safeParse({
		embeddings: group.embeddings ?? d.embeddings,
		embedModel: group.embedModel ?? d.embedModel,
		deepSearch: group.deepSearch ?? d.deepSearch,
		guideEnabled: group.guideEnabled ?? d.guideEnabled,
		exchangeLimit: group.exchangeLimit ?? d.exchangeLimit,
		exchangeWindowHours: group.exchangeWindowHours ?? d.exchangeWindowHours,
		screeningLevel: group.screeningLevel ?? d.screeningLevel,
		behaviour: behaviourFrom(group.behaviour),
		updatedBy: group.updatedBy ?? null,
		updatedAt: group.updatedAt ?? null,
	});
	return parsed.success ? parsed.data : null;
}

export interface AiSettingsClientOptions {
	/** The CMS origin, no trailing slash. */
	cmsUrl: string;
	/** This site's read-only Payload API key (its service user). */
	apiKey: string;
	site: Site;
	/** How long an answer is trusted; 60 s by default. */
	ttlMs?: number;
	fetch?: typeof fetch;
	now?: () => number;
	onError?: (message: string) => void;
}

export interface AiSettingsClient {
	/** Fresh settings (≤ ttl old); on any failure the last known, else the defaults. Never throws. */
	get(): Promise<AiSettings>;
	/** What `get` would answer from memory, without a request. */
	current(): AiSettings;
	/** Forget the cached answer. */
	invalidate(): void;
	/**
	 * What the revalidation webhook calls: re-read now, and once more a moment later. The CMS
	 * announces a change from inside its save, before its transaction commits, so the first read
	 * can still see the old row; the second one cannot.
	 */
	refreshAfterAnnounce(): Promise<void>;
}

/** How long after an announcement the second read goes out. */
export const ANNOUNCE_REREAD_MS = 1500;

export function createAiSettingsClient(o: AiSettingsClientOptions): AiSettingsClient {
	const ttl = o.ttlMs ?? 60_000;
	const now = o.now ?? Date.now;
	const f = o.fetch ?? fetch;
	let known: AiSettings | null = null;
	let fetchedAt = Number.NEGATIVE_INFINITY;
	let inflight: Promise<AiSettings> | null = null;

	async function load(): Promise<AiSettings> {
		try {
			const r = await f(`${o.cmsUrl}/api/globals/ai-settings?depth=0`, {
				headers: { accept: "application/json", authorization: `users API-Key ${o.apiKey}` },
				signal: AbortSignal.timeout(5000),
			});
			if (!r.ok) throw new Error(`cms answered ${r.status}`);
			const s = settingsFor(await r.json(), o.site);
			if (s === null) throw new Error(`no readable ai-settings for ${o.site}`);
			known = s;
			fetchedAt = now();
			return s;
		} catch (err) {
			o.onError?.(`ai-settings: ${err instanceof Error ? err.message : String(err)}`);
			// Fail safe: keep serving what was known; retry after the ttl, not on every call.
			fetchedAt = now();
			return known ?? AI_SETTINGS_DEFAULTS;
		}
	}

	async function get(): Promise<AiSettings> {
		if (now() - fetchedAt < ttl) return known ?? AI_SETTINGS_DEFAULTS;
		inflight ??= load().finally(() => {
			inflight = null;
		});
		return inflight;
	}

	return {
		get,
		current: () => known ?? AI_SETTINGS_DEFAULTS,
		invalidate() {
			fetchedAt = Number.NEGATIVE_INFINITY;
		},
		async refreshAfterAnnounce() {
			fetchedAt = Number.NEGATIVE_INFINITY;
			await get();
			setTimeout(() => {
				fetchedAt = Number.NEGATIVE_INFINITY;
				void get();
			}, ANNOUNCE_REREAD_MS).unref?.();
		},
	};
}

/**
 * The guide's copy a page renders right now: what the studio published (the last known settings,
 * never waiting for the CMS), else the site's built-in line. A stale cache is refreshed in the
 * background, so a change shows on a later render within the cache's lifetime, or at once after
 * the CMS's webhook.
 */
export function liveGuideCopy(
	client: AiSettingsClient | null,
	locale: "ro" | "en",
	defaults: CopyDefaults,
): CopyDefaults {
	if (client === null) return defaults;
	void client.get();
	return copyWithDefaults(guideCopyFor(client.current().behaviour, locale), defaults);
}
