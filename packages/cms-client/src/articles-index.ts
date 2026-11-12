import { type Article, type ArticleSummary, buildIndex } from "@psi/content";
import { readCmsArticles } from "./articles";

/**
 * The estate's article index as a brand site holds it: the CMS's PUBLISHED articles merged over
 * the repository's catalogue (a CMS article wins on its slug), or the CMS alone once the
 * catalogue is retired (`fallback: false`). Pages read it synchronously; it starts as the
 * repository's index, is replaced only by a successful read, and refreshes in the background
 * after `ttlMs` or when the CMS's webhook says an article changed.
 */
export interface ArticleIndexOptions {
	/** The CMS origin; published articles need no key. */
	cmsUrl: string;
	/** The blog origin summaries link to. */
	blogOrigin: string;
	/** The repository's catalogue (@psi/content's ARTICLES). */
	repo: ReadonlyArray<Article>;
	/** Keep the repository's articles the CMS does not have (CMS_REPO_FALLBACK, default true). */
	fallback: boolean;
	/** Whether the repository's drafts may show here (staging); the CMS part is published only. */
	includeDrafts: boolean;
	ttlMs?: number;
	fetch?: typeof fetch;
	now?: () => number;
	onError?: (message: string) => void;
}

export interface ArticleIndex {
	/** Every summary this site may show, newest first (pass it to `latestFor`). */
	index(): ReadonlyArray<ArticleSummary>;
	/** Re-reads now; keeps the last good index on failure. Never throws. */
	refresh(): Promise<void>;
}

/** CMS articles win on their slug; the repository's others stay unless the fallback is retired. */
export function mergeOverRepo(
	cms: ReadonlyArray<Article>,
	repo: ReadonlyArray<Article>,
	fallback: boolean,
): Article[] {
	if (!fallback) return [...cms];
	const slugs = new Set(cms.map((a) => a.slug));
	return [...cms, ...repo.filter((a) => !slugs.has(a.slug))];
}

export function createArticleIndex(o: ArticleIndexOptions): ArticleIndex {
	const ttl = o.ttlMs ?? 300_000;
	const now = o.now ?? Date.now;
	const build = (articles: ReadonlyArray<Article>): ReadonlyArray<ArticleSummary> =>
		buildIndex(articles, { blogOrigin: o.blogOrigin, includeDrafts: o.includeDrafts });
	let current = build(o.repo);
	let fetchedAt = Number.NEGATIVE_INFINITY;
	let inflight: Promise<void> | null = null;

	async function load(): Promise<void> {
		try {
			const r = await readCmsArticles({ cmsUrl: o.cmsUrl, drafts: false, fetch: o.fetch });
			current = build(mergeOverRepo(r.articles, o.repo, o.fallback));
		} catch (err) {
			o.onError?.(`articles: ${err instanceof Error ? err.message : String(err)}`);
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
		index() {
			if (now() - fetchedAt >= ttl) void refresh();
			return current;
		},
		refresh,
	};
}
