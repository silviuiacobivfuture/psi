import { z } from "zod";
import { BrandSchema, LocaleSchema } from "./contract";

export const KINDS = ["clinical", "programme", "operational", "editorial"] as const;
export const STATUSES = ["draft", "published"] as const;

export const KindSchema = z.enum(KINDS);
export const StatusSchema = z.enum(STATUSES);

export type Kind = z.infer<typeof KindSchema>;
export type Status = z.infer<typeof StatusSchema>;

/** A blank reviewer is no reviewer: "" and whitespace become null. */
const Reviewer = z
	.string()
	.nullable()
	.transform((v) => {
		const t = v?.trim() ?? "";
		return t === "" ? null : t;
	});

/** An ISO date (`2026-11-11`) or ISO date-time with offset; null when not reviewed. */
const ReviewDate = z.union([z.string().date(), z.string().datetime({ offset: true })]).nullable();

/**
 * A source the guide cites by title without a link (an uploaded document that is not
 * public-downloadable): `cite:<anything>`. Renderers show the title only.
 */
export const CITE_ONLY_PREFIX = "cite:";

/** True when the source must be cited without a link. */
export function isCiteOnly(url: string): boolean {
	return url.startsWith(CITE_ONLY_PREFIX);
}

/**
 * The page an entry comes from: an absolute http(s) URL, a site-relative path (`/contact`), or
 * `cite:<id>` for a source cited without a link.
 */
const SourceUrl = z
	.string()
	.trim()
	.min(1)
	.refine(
		(u) =>
			(u.startsWith("/") && !u.startsWith("//")) ||
			/^https?:\/\/[^\s]+$/.test(u) ||
			/^cite:[^\s]+$/.test(u),
		{ message: "url must be a site-relative path (/…), an http(s) URL or cite:<id>" },
	);

/** Ids end up in vector ids and SQL filter values: keep them to a safe, readable alphabet. */
const EntryId = z
	.string()
	.trim()
	.regex(/^[a-z0-9][a-z0-9._-]{0,127}$/, "id: lowercase letters, digits, '.', '_', '-' (≤128)");

/**
 * One knowledge entry, as the CMS (or the seed) hands it over. Field names follow
 * docs/plans/blog-and-content.md (`audience`, `hub`, `method`, `reviewedBy`, `reviewedAt`).
 * Length (80–250 words for a KnowledgeEntry) is the CMS's validation, not enforced here: hubs,
 * methods and pages are indexed too and are longer.
 */
export const KnowledgeEntrySchema = z.object({
	id: EntryId,
	brand: BrandSchema,
	locale: LocaleSchema,
	kind: KindSchema,
	title: z.string().trim().min(1).max(300),
	url: SourceUrl,
	body: z
		.string()
		.min(1)
		.refine((b) => b.trim() !== "", { message: "body must not be blank" }),
	audience: z.string().trim().min(1).optional(),
	hub: z.string().trim().min(1).optional(),
	method: z.string().trim().min(1).optional(),
	status: StatusSchema,
	reviewedBy: Reviewer,
	reviewedAt: ReviewDate,
});

/** The entry after parsing (reviewer normalised). */
export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>;
/** What callers may pass in (before normalisation). */
export type KnowledgeEntryInput = z.input<typeof KnowledgeEntrySchema>;

/** The fields the retrievability rule reads. */
export interface ReviewState {
	kind: Kind;
	status: Status;
	reviewedBy: string | null;
	reviewedAt: string | null;
}

export type Retrievability =
	| { retrievable: true }
	| { retrievable: false; reason: "draft" | "clinical-unreviewed" };

/**
 * THE RULE: an entry is retrievable only if it is published AND, when clinical, both its
 * reviewer and its review date are set. Drafts are never retrievable.
 */
export function retrievability(e: ReviewState): Retrievability {
	if (e.status !== "published") return { retrievable: false, reason: "draft" };
	if (e.kind === "clinical") {
		const reviewer = e.reviewedBy?.trim() ?? "";
		const date = e.reviewedAt?.trim() ?? "";
		if (reviewer === "" || date === "") {
			return { retrievable: false, reason: "clinical-unreviewed" };
		}
	}
	return { retrievable: true };
}

export function isRetrievable(e: ReviewState): boolean {
	return retrievability(e).retrievable;
}
