import { GUIDE_MODELS, type GuideModel, type Site } from "@psi/cms-client";
import { SEED } from "@psi/knowledge";
import type { PayloadRequest } from "payload";
import { z } from "zod";

/**
 * What the studio offers to choose from: the allowed models with their OpenRouter price (the
 * public model list, no key, cached six hours; without it, no price), and topic suggestions from
 * the brand's knowledge base (the repository's seed and the CMS's own entries), by title.
 */
export interface ModelChoice {
	id: GuideModel;
	name: string;
	/** US dollars per million tokens, or null when OpenRouter did not answer. */
	input: number | null;
	output: number | null;
	context: number | null;
}

const OpenRouterModels = z.object({
	data: z.array(
		z
			.object({
				id: z.string(),
				name: z.string().optional(),
				context_length: z.number().nullish(),
				pricing: z.object({ prompt: z.string(), completion: z.string() }).partial().optional(),
			})
			.passthrough(),
	),
});

const PRICES_TTL_MS = 6 * 3_600_000;
let prices: { at: number; models: ReadonlyArray<ModelChoice> } | null = null;

const perMillion = (raw: string | undefined): number | null => {
	const n = Number(raw);
	return raw === undefined || !Number.isFinite(n) ? null : Math.round(n * 1e8) / 100;
};

function bare(): ReadonlyArray<ModelChoice> {
	return GUIDE_MODELS.map((id) => ({ id, name: id, input: null, output: null, context: null }));
}

/** The allowed models, priced when OpenRouter answered within three seconds. Never throws. */
export async function modelChoices(
	fetcher: typeof fetch = fetch,
): Promise<ReadonlyArray<ModelChoice>> {
	if (prices !== null && Date.now() - prices.at < PRICES_TTL_MS) return prices.models;
	try {
		const r = await fetcher("https://openrouter.ai/api/v1/models", {
			headers: { accept: "application/json" },
			signal: AbortSignal.timeout(3000),
		});
		if (!r.ok) throw new Error(`openrouter answered ${r.status}`);
		const list = OpenRouterModels.parse(await r.json());
		const models = GUIDE_MODELS.map((id): ModelChoice => {
			const m = list.data.find((x) => x.id === id);
			return {
				id,
				name: m?.name ?? id,
				input: perMillion(m?.pricing?.prompt),
				output: perMillion(m?.pricing?.completion),
				context: m?.context_length ?? null,
			};
		});
		prices = { at: Date.now(), models };
		return models;
	} catch {
		return prices?.models ?? bare();
	}
}

const Entries = z.object({
	docs: z.array(z.object({ question: z.string().nullish() }).passthrough()),
});

/** Up to 24 topic suggestions for the brand: its knowledge entries' titles, in Romanian. */
export async function topicSuggestions(req: PayloadRequest, brand: Site): Promise<string[]> {
	const seed = SEED.filter((e) => e.brand === brand && e.locale === "ro").map((e) => e.title);
	const own = await req.payload
		.find({
			collection: "knowledge-entries",
			where: { brand: { equals: brand } },
			locale: "ro",
			depth: 0,
			limit: 60,
			overrideAccess: false,
			user: req.user,
			req,
		})
		.then((p) => Entries.parse(p).docs.flatMap((d) => (d.question ? [d.question] : [])))
		.catch((): string[] => []);
	const seen = new Map<string, string>();
	for (const t of [...seed, ...own]) {
		const title = t.trim();
		if (title !== "" && title.length <= 60 && !seen.has(title.toLowerCase())) {
			seen.set(title.toLowerCase(), title);
		}
	}
	return [...seen.values()].slice(0, 24);
}
