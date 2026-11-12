/**
 * Which knowledge entries need a clinical approval before they are published. ONE rule, read by
 * the review gate (publishing) and by the ingest plan (what the guide may retrieve), so the two
 * cannot disagree.
 */
export function knowledgeReviewRequired(doc: Record<string, unknown>): boolean {
	return doc.kind === "clinical" || doc.brand === "psizone";
}
