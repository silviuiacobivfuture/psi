/**
 * The repository's articles (@psi/content) into the CMS as drafts, shared by the CLI
 * (`pnpm import:articles`, src/scripts/import-repo-articles.ts) and the server's boot import
 * (`PSI_IMPORT_REPO_ARTICLES=true`, see `importOnBoot`).
 *
 * - An article the CMS does not have is created as a draft.
 * - One it has, that nobody touched since the import (still a draft, no review events, no review
 *   state, not written in the admin, not edited since), is refreshed when the repository changed.
 * - Anything a person touched is left alone, and said so.
 *
 * Writes no review, approval or publication: the imported drafts go through the workflow.
 */
import { ARTICLES } from "@psi/content";
import type { Payload } from "payload";
import { z } from "zod";
import { contentHash } from "../review/hash";
import { LOCAL_DRAFT } from "../review/live";
import { type Decision, decide, type Existing, Marker } from "./refresh";
import { createData, englishData, toImport } from "./repo-articles";

export interface ImportCounts {
	create: number;
	update: number;
	unchanged: number;
	edited: number;
	failed: number;
}

const markerKey = (slug: string): string => `import-articles:${slug}`;

const Doc = z.object({
	id: z.union([z.string(), z.number()]),
	_status: z.string().nullish(),
	authorUser: z.unknown().optional(),
	workflow: z.object({ stage: z.string().nullish() }).partial().nullish(),
	review: z.record(z.object({ state: z.string().nullish() }).partial().nullish()).nullish(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

/** The latest version's `updatedAt` of a document, or null when it has none. */
async function latestVersionAt(payload: Payload, id: string | number): Promise<string | null> {
	const v = await payload.findVersions({
		collection: "articles",
		where: { parent: { equals: id } },
		sort: "-updatedAt",
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	return v.docs[0]?.updatedAt ?? null;
}

/** The facts about the document with this slug: its live row (a published one is never refreshed). */
async function existing(
	payload: Payload,
	slug: string,
): Promise<{ id: string | number; facts: Existing } | null> {
	const found = await payload.find({
		collection: "articles",
		where: { slug: { equals: slug } },
		locale: "all",
		draft: false,
		depth: 0,
		limit: 1,
		overrideAccess: true,
	});
	if (found.docs[0] === undefined) return null;
	const doc = Doc.parse(found.docs[0]);
	const events = await payload.count({
		collection: "review-events",
		where: {
			and: [{ collectionSlug: { equals: "articles" } }, { documentId: { equals: String(doc.id) } }],
		},
		overrideAccess: true,
	});
	const marker = Marker.safeParse(await payload.kv.get<Record<string, unknown>>(markerKey(slug)));
	const facts: Existing = {
		status: doc._status ?? null,
		stage: doc.workflow?.stage ?? null,
		authorUser: doc.authorUser ?? null,
		reviewStates: Object.values(doc.review ?? {}).map((r) => r?.state ?? null),
		reviewEvents: events.totalDocs,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
		versionAt: await latestVersionAt(payload, doc.id),
		marker: marker.success ? marker.data : null,
	};
	return { id: doc.id, facts };
}

/** Writes the Romanian create/update and then the English texts onto the rows it made. */
async function write(
	payload: Payload,
	a: (typeof ARTICLES)[number],
	id: string | number | null,
): Promise<void> {
	const context = { [LOCAL_DRAFT]: true };
	const common = { collection: "articles", draft: true, overrideAccess: true, context } as const;
	const ro =
		id === null
			? await payload.create({ ...common, locale: "ro", data: createData(a) })
			: await payload.update({ ...common, id, locale: "ro", data: createData(a, true) });
	await payload.update({
		...common,
		id: ro.id,
		locale: "en",
		data: englishData(a, ro, id !== null),
	});
}

/** Records what the import just wrote, read the way the next run reads it. */
async function remember(payload: Payload, slug: string, hash: string): Promise<void> {
	const now = await existing(payload, slug);
	if (now === null) throw new Error(`import ${slug}: not found after its write`);
	await payload.kv.set(markerKey(slug), {
		hash,
		docAt: now.facts.updatedAt,
		versionAt: now.facts.versionAt,
	});
}

/** Runs the import over every repository article; never throws for one article's failure. */
export async function importRepoArticles(
	payload: Payload,
	opts: { dryRun: boolean },
): Promise<ImportCounts> {
	const { dryRun } = opts;
	const counts: ImportCounts = { create: 0, update: 0, unchanged: 0, edited: 0, failed: 0 };
	const verb = (d: Decision): string => (d.action === "skip" ? `skip (${d.reason})` : d.action);
	for (const a of toImport(ARTICLES)) {
		const hash = contentHash({ article: a });
		try {
			const found = await existing(payload, a.slug);
			const d = decide(hash, found?.facts ?? null);
			const tail = d.action === "skip" && d.why.length > 0 ? `: ${d.why.join("; ")}` : "";
			payload.logger.info(`import${dryRun ? " [dry run]" : ""}: ${a.slug} → ${verb(d)}${tail}`);
			if (d.action === "skip") counts[d.reason]++;
			else counts[d.action]++;
			if (dryRun || d.action === "skip") continue;
			await write(payload, a, found?.id ?? null);
			await remember(payload, a.slug, hash);
		} catch (err) {
			counts.failed++;
			payload.logger.error({ err }, `import: ${a.slug} failed`);
		}
	}
	payload.logger.info(
		`import${dryRun ? " [dry run, nothing written]" : ""}: ${counts.create} created, ${counts.update} refreshed, ${counts.unchanged} unchanged, ${counts.edited} left alone (edited), ${counts.failed} failed`,
	);
	return counts;
}

const LOCK = "import-articles:lock";
const LOCK_MS = 15 * 60 * 1000;

/**
 * The boot import: when `PSI_IMPORT_REPO_ARTICLES=true`, a few seconds after the server starts
 * (so it never delays readiness), the repository's articles are brought in. Several replicas
 * starting together run it once: a lock in Payload's key-value store, held for at most 15 min.
 */
export function importOnBoot(payload: Payload, enabled: boolean, delayMs = 10_000): void {
	if (!enabled) return;
	setTimeout(() => {
		void (async () => {
			try {
				const held = z
					.object({ at: z.number() })
					.safeParse(await payload.kv.get<Record<string, unknown>>(LOCK));
				if (held.success && Date.now() - held.data.at < LOCK_MS) {
					payload.logger.info("import: another instance is importing, skipped");
					return;
				}
				await payload.kv.set(LOCK, { at: Date.now() });
				await importRepoArticles(payload, { dryRun: false });
				await payload.kv.delete(LOCK);
			} catch (err) {
				payload.logger.error({ err }, "import: boot import failed");
			}
		})();
	}, delayMs).unref();
}
