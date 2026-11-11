import type { KnowledgeEntryInput } from "../entry";

/** A published, non-clinical Psizone entry in Romanian; override what a test is about. */
export function entry(over: Partial<KnowledgeEntryInput> & { id: string }): KnowledgeEntryInput {
	return {
		brand: "psizone",
		locale: "ro",
		kind: "operational",
		title: "Titlu",
		url: "/pagina",
		body: "Un text simplu despre program.",
		status: "published",
		reviewedBy: null,
		reviewedAt: null,
		...over,
	};
}
