import type { CollectionSlug } from "payload";
import { z } from "zod";

export const LOCALES = ["ro", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const LocaleValue = z.enum(LOCALES);

export const REVIEW_STATES = ["pending", "changes_requested", "approved"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

/** The editorial workflow of a document; publishing itself is Payload's `_status`. */
export const STAGES = ["draft", "in_review", "changes_requested", "approved"] as const;
export type Stage = (typeof STAGES)[number];

/** How one collection takes part in the review gate. */
export interface ReviewSpec {
	slug: CollectionSlug;
	/** Every field whose content the reviewer approves (localised text is read per locale). */
	reviewed: ReadonlyArray<string>;
	/**
	 * The reviewed fields that hold NO localised text: a change to one invalidates every locale.
	 * A field with localised text inside (blocks, arrays) is never shared: it is read per locale.
	 */
	shared: ReadonlyArray<string>;
	/**
	 * Reviewed fields added after documents were first approved: part of the approved content only
	 * once they hold something, so an approval given before the field existed stays valid.
	 */
	optional?: ReadonlyArray<string>;
	/** The localised field whose presence means "this locale exists". */
	titleField: string;
	/** Locales that must exist before publishing (the blog needs both). */
	requiredLocales: ReadonlyArray<Locale>;
	/** Whether publishing needs every existing locale approved. */
	required(doc: Record<string, unknown>): boolean;
	/** Whether the approval is clinical (`clinical_review`) rather than editorial (`publish`). */
	clinical(doc: Record<string, unknown>): boolean;
	/** Whether a clinical approval signs the document with the reviewer's People profile. */
	signsReviewer: boolean;
	/** Whether publishing sets `publishedAt` when it is empty (the first publication). */
	stampsPublishedAt: boolean;
	/** What the document still lacks before it may be published: field names. */
	missing(doc: Record<string, unknown>): string[];
}

const Review = z
	.object({ state: z.enum(REVIEW_STATES).nullish(), approvedHash: z.string().nullish() })
	.passthrough();
export type ReviewValue = z.infer<typeof Review>;

/** The review group of a single-locale document (or null when absent). */
export function reviewOf(doc: Record<string, unknown>): ReviewValue | null {
	const r = Review.safeParse(doc.review);
	return r.success ? r.data : null;
}

const LocaleMap = z
	.object({ ro: z.unknown(), en: z.unknown() })
	.partial()
	.strict()
	.refine((o) => Object.keys(o).length > 0);

/**
 * A `locale: "all"` value flattened to one locale, at every depth: an object whose only keys are
 * locale codes is a localised value (a field, or a block's text) and becomes that locale's value.
 */
export function flattenLocale(value: unknown, locale: Locale): unknown {
	if (Array.isArray(value)) return value.map((v) => flattenLocale(v, locale));
	if (value === null || typeof value !== "object") return value;
	const localized = LocaleMap.safeParse(value);
	if (localized.success) return flattenLocale(localized.data[locale] ?? null, locale);
	return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, flattenLocale(v, locale)]));
}

const Related = z.object({ id: z.union([z.string(), z.number()]) }).passthrough();

/** A relationship as its id, whether Payload handed over the id or the populated document. */
function idOf(v: unknown): unknown {
	const r = Related.safeParse(v);
	return r.success ? r.data.id : v;
}

/** The content a reviewer approves in one locale (a single-locale document). */
export function reviewedContent(
	spec: ReviewSpec,
	doc: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const k of spec.reviewed) {
		if (spec.optional?.includes(k) && isEmpty(doc[k])) continue;
		out[k] = k === "cover" ? idOf(doc[k] ?? null) : (doc[k] ?? null);
	}
	return out;
}

/** Nothing written: null, blank text, an empty list, or an object whose every value is empty. */
export function isEmpty(v: unknown): boolean {
	if (v === null || v === undefined) return true;
	if (typeof v === "string") return v.trim() === "";
	if (Array.isArray(v)) return v.every(isEmpty);
	if (typeof v === "object") return Object.entries(v).every(([k, x]) => k === "id" || isEmpty(x));
	return false;
}

/** A locale "exists" when its title is a non-blank string. */
export function hasLocale(spec: ReviewSpec, doc: Record<string, unknown>): boolean {
	const t = doc[spec.titleField];
	return typeof t === "string" && t.trim() !== "";
}
