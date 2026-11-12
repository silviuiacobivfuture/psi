import { createHash } from "node:crypto";
import { CITE_ONLY_PREFIX, type KnowledgeEntryInput } from "@psi/knowledge";
import { stableStringify } from "../review/hash";
import { knowledgeReviewRequired } from "./rule";
import type { SourceDoc } from "./source-doc";

/**
 * A source's sections as @psi/knowledge entries: one entry per section (a heading, or a PDF page),
 * so every chunk the guide retrieves carries the source's id (`cms.ks.<doc>.<n>`), its title, the
 * section and a page or anchor to cite. The chunker splits each section further, with overlap.
 */
export const SOURCE_ID_PREFIX = "cms.ks.";

export function sourceEntryId(docId: string, n: number): string {
	return `${SOURCE_ID_PREFIX}${docId.toLowerCase()}.${String(n).padStart(3, "0")}`;
}

/** The source a knowledge id belongs to (the CMS document id), or null for another entry. */
export function sourceOfEntry(entryId: string): string | null {
	if (!entryId.startsWith(SOURCE_ID_PREFIX)) return null;
	const rest = entryId.slice(SOURCE_ID_PREFIX.length);
	const dot = rest.lastIndexOf(".");
	return dot <= 0 ? null : rest.slice(0, dot);
}

/** Why a source is not in the index, or null when it may be indexed. */
export type NotIndexable = "private" | "awaiting_approval" | "rejected" | "removed" | "no_text";

export function notIndexable(doc: SourceDoc): NotIndexable | null {
	// Only public sources are ever indexed, embedded or sent anywhere.
	if (doc.sensitivity !== "public") return "private";
	if (!doc.inIndex) return "removed";
	if (doc.approval?.state === "rejected") return "rejected";
	const approved =
		doc.approval?.state === "approved" &&
		doc.approval.hash !== null &&
		doc.approval.hash !== undefined &&
		doc.approval.hash === doc.contentHash;
	if (!approved) return "awaiting_approval";
	if ((doc.sections ?? []).every((s) => s.text.trim() === "")) return "no_text";
	return null;
}

/**
 * Where a citation points: the file (public-downloadable only), the fetched page, or nothing
 * (`cite:` — the guide names the title without a link).
 */
export function citationUrl(doc: SourceDoc, anchor: string, serverUrl: string): string {
	if (doc.downloadable === true) {
		if (doc.origin === "url" && doc.sourceUrl) return doc.sourceUrl;
		if (doc.url) {
			const base = doc.url.startsWith("http") ? doc.url : `${serverUrl}${doc.url}`;
			return anchor.startsWith("page=") ? `${base}#${anchor}` : base;
		}
	}
	return `${CITE_ONLY_PREFIX}ks-${doc.id}#${anchor}`;
}

export function planSourceEntries(doc: SourceDoc, serverUrl: string): KnowledgeEntryInput[] {
	const reviewed = knowledgeReviewRequired({ brand: doc.brand, kind: doc.kind });
	const stamp =
		reviewed && doc.approval?.state === "approved"
			? {
					reviewedBy: doc.approval.byName ?? null,
					// The citation shows the day of the review, as for knowledge entries.
					reviewedAt: doc.approval.at?.slice(0, 10) ?? null,
				}
			: { reviewedBy: null, reviewedAt: null };
	const topic = doc.topics?.find((t) => t.trim() !== "")?.trim();
	const audience = doc.audience?.trim();
	return (doc.sections ?? [])
		.filter((s) => s.text.trim() !== "")
		.map((s, n) => {
			const section = s.title.trim();
			return {
				id: sourceEntryId(doc.id, n),
				brand: doc.brand,
				locale: doc.language,
				kind: doc.kind,
				title: (section === "" || section === doc.title
					? doc.title
					: `${doc.title} — ${section}`
				).slice(0, 300),
				url: citationUrl(doc, s.anchor, serverUrl),
				body: section === "" ? s.text : `## ${section}\n\n${s.text}`,
				status: "published",
				...stamp,
				...(topic === undefined ? {} : { hub: topic }),
				...(audience === undefined || audience === "" ? {} : { audience }),
			};
		});
}

/**
 * What an index run would write, as one hash: the entries (text, titles, links, review stamp) and
 * the vector space. Equal to the last run's: re-indexing is a no-op.
 */
export function fingerprint(entries: ReadonlyArray<KnowledgeEntryInput>, space: string): string {
	return createHash("sha256").update(stableStringify({ entries, space })).digest("hex");
}
