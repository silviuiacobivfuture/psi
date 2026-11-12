import type { Field } from "payload";

/**
 * The collections the review queue reads: exactly those with a top-level `workflow` group holding
 * a `stage` select (the review gate's), each with the field its rows are titled by. A collection
 * without the workflow is skipped, so the queue never queries a path that does not exist.
 */
export interface QueueSource<S extends string> {
	slug: S;
	titleField: string;
}

/** The parts of a collection config the queue reads (sanitized or not). */
interface Collection<S extends string> {
	slug: S;
	fields: Field[];
	admin?: { useAsTitle?: string };
}

function hasStage(f: Field): boolean {
	return (
		f.type === "group" &&
		"name" in f &&
		f.name === "workflow" &&
		f.fields.some((s) => "name" in s && s.name === "stage" && s.type === "select")
	);
}

export function queueSources<S extends string>(
	collections: ReadonlyArray<Collection<S>>,
): QueueSource<S>[] {
	return collections
		.filter((c) => c.fields.some(hasStage))
		.map((c) => ({ slug: c.slug, titleField: c.admin?.useAsTitle ?? "id" }));
}
