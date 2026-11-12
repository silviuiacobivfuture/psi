import type { IngestReport, KnowledgeEntryInput } from "@psi/knowledge";
import type { SourceDoc, SourceStatus } from "./source-doc";
import { fingerprint, notIndexable, planSourceEntries, sourceEntryId } from "./source-plan";

/**
 * THE INGESTION CYCLE for one uploaded source, after extraction (the text is on the document):
 * gate → plan (one entry per section) → no-op check → index (embed + write, lexical fall-back)
 * → record. Idempotent: the same content, settings and space as the last run change nothing; a
 * changed file replaces its chunks (ids that disappear are removed); a source that is private,
 * not approved, rejected or taken out is removed from the index. Never throws: a failure is the
 * source's `failed` status, with the error.
 */
export interface IndexPort {
	primarySpace(): string;
	ingest(entries: ReadonlyArray<KnowledgeEntryInput>): Promise<{
		report: IngestReport;
		lexical: boolean;
		embedder: string;
		space: string;
		fallback: string | null;
	}>;
	remove(ids: ReadonlyArray<string>): Promise<void>;
}

export interface SourcePatch {
	status?: SourceStatus;
	error?: string | null;
	chunks?: number;
	sectionCount?: number;
	indexedIds?: string[];
	indexedFingerprint?: string | null;
	indexedAt?: string | null;
	embedder?: string | null;
}

export interface PipelinePorts {
	load(id: string): Promise<SourceDoc | null>;
	save(id: string, patch: SourcePatch): Promise<void>;
	/** The brand's index with its current AI settings. */
	index(doc: SourceDoc): Promise<IndexPort>;
	/** The CMS's public origin: links to public-downloadable files. */
	serverUrl: string;
	now(): Date;
}

export type RunOutcome =
	| { kind: "indexed"; lexical: boolean; chunks: number; entries: number }
	| { kind: "unchanged" }
	| { kind: "not_indexed"; status: SourceStatus }
	| { kind: "failed"; error: string }
	| { kind: "missing" };

const NOT_INDEXED: Readonly<Record<NonNullable<ReturnType<typeof notIndexable>>, SourceStatus>> = {
	private: "private",
	awaiting_approval: "awaiting_approval",
	rejected: "rejected",
	removed: "removed",
	no_text: "failed",
};

/** Every entry id the source may own: the recorded ones, and one per section (a lost record). */
export function ownedIds(doc: SourceDoc): string[] {
	const bySection = (doc.sections ?? []).map((_, n) => sourceEntryId(doc.id, n));
	return [...new Set([...(doc.indexedIds ?? []), ...bySection])];
}

function message(error: unknown): string {
	return (error instanceof Error ? `${error.name}: ${error.message}` : "unknown error").slice(
		0,
		500,
	);
}

export async function runSource(
	ports: PipelinePorts,
	id: string,
	opts: { force?: boolean } = {},
): Promise<RunOutcome> {
	const doc = await ports.load(id);
	if (doc === null) return { kind: "missing" };
	if (doc.status === "failed" && (doc.sections ?? []).length === 0) {
		// Extraction failed: nothing to index; the error is already recorded.
		return { kind: "failed", error: doc.error ?? "extraction failed" };
	}
	try {
		const blocked = notIndexable(doc);
		if (blocked !== null) {
			const index = await ports.index(doc);
			const owned = ownedIds(doc);
			if (owned.length > 0) await index.remove(owned);
			const status = NOT_INDEXED[blocked];
			await ports.save(id, {
				status,
				error: blocked === "no_text" ? "no text to index" : null,
				chunks: 0,
				indexedIds: [],
				indexedFingerprint: null,
			});
			return { kind: "not_indexed", status };
		}
		const entries = planSourceEntries(doc, ports.serverUrl);
		const index = await ports.index(doc);
		const fp = fingerprint(entries, index.primarySpace());
		const done = doc.status === "indexed" || doc.status === "indexed_lexical";
		if (!opts.force && done && fp === doc.indexedFingerprint) return { kind: "unchanged" };

		await ports.save(id, { status: "chunked", sectionCount: entries.length, error: null });
		const ids = entries.map((e) => String(e.id));
		const stale = ownedIds(doc).filter((x) => !ids.includes(x));
		await ports.save(id, { status: "embedding" });
		const out = await index.ingest(entries);
		if (out.report.skipped.length > 0) {
			// The knowledge rule refused part of it (a clinical source without a review stamp).
			await index.remove(ids);
			const reasons = [...new Set(out.report.skipped.map((s) => s.reason))].join(", ");
			const error = `not retrievable: ${reasons}`;
			await ports.save(id, {
				status: "failed",
				error,
				chunks: 0,
				indexedIds: [],
				indexedFingerprint: null,
			});
			return { kind: "failed", error };
		}
		if (stale.length > 0) await index.remove(stale);
		await ports.save(id, {
			status: out.lexical ? "indexed_lexical" : "indexed",
			error: out.fallback,
			chunks: out.report.chunks,
			indexedIds: ids,
			// A fall-back run never counts as done: the next save or re-index tries embeddings again.
			indexedFingerprint: out.space === index.primarySpace() ? fp : null,
			indexedAt: ports.now().toISOString(),
			embedder: out.embedder,
		});
		return {
			kind: "indexed",
			lexical: out.lexical,
			chunks: out.report.chunks,
			entries: ids.length,
		};
	} catch (error) {
		const e = message(error);
		await ports.save(id, { status: "failed", error: e }).catch(() => undefined);
		return { kind: "failed", error: e };
	}
}

/** Takes the source out of the index entirely (delete, or "Remove from index"). */
export async function unindexSource(
	index: Pick<IndexPort, "remove">,
	doc: SourceDoc,
): Promise<number> {
	const owned = ownedIds(doc);
	if (owned.length > 0) await index.remove(owned);
	return owned.length;
}

const chains = new Map<string, Promise<unknown>>();

/** Runs one source's work after any run already going for it (one process, one source at a time). */
export function serial<T>(id: string, work: () => Promise<T>): Promise<T> {
	const prev = chains.get(id) ?? Promise.resolve();
	const next = prev.then(work, work);
	const tail = next.catch(() => undefined);
	chains.set(id, tail);
	void tail.then(() => {
		if (chains.get(id) === tail) chains.delete(id);
	});
	return next;
}
