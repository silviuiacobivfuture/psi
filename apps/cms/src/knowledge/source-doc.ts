import { z } from "zod";
import { BRANDS } from "../authz/types";

/**
 * A knowledge source as the CMS stores it (collection `knowledge-sources`), parsed at every
 * boundary: hooks, the pipeline, the endpoints and the admin panel read it through this schema.
 */
export const SOURCE_STATUSES = [
	"uploaded",
	"awaiting_approval",
	"extracting",
	"chunked",
	"embedding",
	"indexed",
	"indexed_lexical",
	"private",
	"rejected",
	"removed",
	"failed",
] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const SENSITIVITIES = ["public", "internal", "confidential"] as const;
export const SOURCE_KINDS = ["operational", "programme", "editorial", "clinical"] as const;
export const SOURCE_LANGUAGES = ["ro", "en"] as const;
export const ORIGINS = ["file", "url"] as const;
export const APPROVAL_STATES = ["pending", "approved", "rejected"] as const;

export const SectionSchema = z.object({
	title: z.string(),
	anchor: z.string().min(1),
	page: z.number().int().positive().nullish(),
	text: z.string(),
});

const Approval = z.object({
	state: z.enum(APPROVAL_STATES).nullish(),
	by: z.string().nullish(),
	byName: z.string().nullish(),
	at: z.string().nullish(),
	/** The content hash approved: a new file (another hash) goes back to pending. */
	hash: z.string().nullish(),
});

export const SourceDocSchema = z.object({
	id: z.union([z.string(), z.number()]).transform(String),
	brand: z.enum(BRANDS),
	title: z.string().trim().min(1),
	language: z.enum(SOURCE_LANGUAGES),
	kind: z
		.enum(SOURCE_KINDS)
		.nullish()
		.transform((k) => k ?? "operational"),
	topics: z.array(z.string()).nullish(),
	audience: z.string().nullish(),
	sensitivity: z.enum(SENSITIVITIES),
	downloadable: z.boolean().nullish(),
	inIndex: z
		.boolean()
		.nullish()
		.transform((v) => v ?? true),
	origin: z
		.enum(ORIGINS)
		.nullish()
		.transform((o) => o ?? "file"),
	sourceUrl: z.string().nullish(),
	filename: z.string().nullish(),
	url: z.string().nullish(),
	mimeType: z.string().nullish(),
	sections: z.array(SectionSchema).nullish(),
	chars: z.number().nullish(),
	chunks: z.number().nullish(),
	sectionCount: z.number().nullish(),
	indexedAt: z.string().nullish(),
	embedder: z.string().nullish(),
	contentHash: z.string().nullish(),
	status: z.enum(SOURCE_STATUSES).nullish(),
	error: z.string().nullish(),
	indexedIds: z.array(z.string()).nullish(),
	indexedFingerprint: z.string().nullish(),
	approval: Approval.nullish(),
	updatedAt: z.string().nullish(),
});
export type SourceDoc = z.infer<typeof SourceDocSchema>;
