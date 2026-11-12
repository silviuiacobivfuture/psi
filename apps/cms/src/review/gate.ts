import { APIError, type CollectionBeforeChangeHook, Forbidden } from "payload";
import { z } from "zod";
import { can, subjectOf } from "../authz/access";
import { BRANDS } from "../authz/types";
import { say } from "../labels";
import { allApproved, describeRefusal, publishRefusals, staleApproval } from "./decide";
import { DRAFT_SAVE, isDraftSave, isLive, WAS_LIVE } from "./live";
import { keepingLocale } from "./locale-safe";
import {
	flattenLocale,
	LOCALES,
	type Locale,
	LocaleValue,
	type ReviewSpec,
	reviewOf,
	STAGES,
} from "./spec";

const Obj = z.record(z.unknown());
const Brand = z.enum(BRANDS);
const Workflow = z
	.object({ stage: z.enum(STAGES).nullish() })
	.passthrough()
	.nullish();

/** Set by the review endpoints so their own write is not treated as an edit. */
export const REVIEW_ACTION = "psiReviewAction";

/** The stored document's latest draft in every locale (null before its first save). */
async function latestDraft(
	spec: ReviewSpec,
	id: string | number | undefined,
	req: Parameters<CollectionBeforeChangeHook>[0]["req"],
): Promise<Record<string, unknown> | null> {
	if (id === undefined) return null;
	return Obj.parse(
		await keepingLocale(req, () =>
			req.payload.findByID({
				collection: spec.slug,
				id,
				locale: "all",
				draft: true,
				depth: 0,
				overrideAccess: true,
				req,
			}),
		),
	);
}

/**
 * Every locale as it will be after this save: the edited one is `merged`; another is judged on
 * its stored text with THIS save's shared fields, so a shared change invalidates every locale's
 * approval, not only the one being edited.
 */
function byLocale(
	spec: ReviewSpec,
	merged: Record<string, unknown>,
	locale: Locale,
	all: Record<string, unknown> | null,
): Array<{ locale: Locale; doc: Record<string, unknown> }> {
	const sharedNow = Object.fromEntries(spec.shared.map((k) => [k, merged[k]]));
	return LOCALES.map((l) => ({
		locale: l,
		doc:
			l === locale
				? merged
				: all === null
					? {}
					: { ...Obj.parse(flattenLocale(all, l)), ...sharedNow },
	}));
}

/**
 * beforeChange for every reviewed collection (ported from the stopped CMS slice; the workflow
 * stage is new):
 *  1. on create, records the author and starts the workflow at `draft`;
 *  2. a write in any shape other than one locale (`?locale=all`, an unknown code) is refused;
 *  3. an edit to an approved locale sends that locale back to `pending`, and an approved text
 *     back to `in_review`;
 *  4. publishing needs `publish` on the brand, a complete document, both locales, and (when
 *     review is required) every locale approved with a matching hash. Each refusal is named.
 */
export function reviewGate(spec: ReviewSpec): CollectionBeforeChangeHook {
	return async ({ data, originalDoc, req, operation }) => {
		const lang = req.i18n.language;
		const out = Obj.parse(data);
		const subject = subjectOf(req.user);
		if (operation === "create") {
			if (subject !== null) out.authorUser = Number(subject.userId);
			out.workflow = { stage: "draft" };
		}
		const locale = LocaleValue.safeParse(req.locale);
		if (!locale.success) throw new APIError(say("oneLocale", lang), 400);

		const original = Obj.parse(originalDoc ?? {});
		const id = z.union([z.string(), z.number()]).safeParse(original.id);
		// The base is the LATEST DRAFT: with drafts, `originalDoc` is the live row, which can be
		// several saves (and the reviewer's approval) behind.
		const all = await latestDraft(spec, id.success ? id.data : undefined, req);
		const current = all === null ? original : Obj.parse(flattenLocale(all, locale.data));
		const merged = { ...current, ...out };
		const fromReview = req.context[REVIEW_ACTION] === true;
		const locales = byLocale(spec, merged, locale.data, all);

		if (!fromReview && staleApproval(spec, merged)) {
			out.review = { ...reviewOf(merged), state: "pending" };
			merged.review = out.review;
		}
		const stage = Workflow.parse(merged.workflow)?.stage ?? "draft";
		if (!fromReview && stage === "approved" && !allApproved(spec, locales)) {
			out.workflow = { ...Obj.parse(merged.workflow ?? {}), stage: "in_review" };
			merged.workflow = out.workflow;
		}
		// What this save does to the LIVE row: a draft save leaves it; any other write replaces it
		// with `merged` (Payload bases it on the latest draft), so it publishes or withdraws.
		const draftSave = isDraftSave(req, out._status, fromReview);
		const wasLive = id.success ? await isLive(req, spec.slug, id.data) : false;
		req.context[WAS_LIVE] = wasLive;
		req.context[DRAFT_SAVE] = draftSave;
		const brand = Brand.safeParse(merged.brand);
		if (draftSave) return out;
		if (merged._status !== "published") {
			// A write that takes a live text down is a withdrawal: a publisher's decision.
			if (wasLive && !fromReview && !(brand.success && (await can(req, "publish", brand.data)))) {
				throw new Forbidden(req.t);
			}
			return out;
		}

		if (!brand.success) throw new APIError(say("needsBrand", lang), 400);
		if (!fromReview && !(await can(req, "publish", brand.data))) throw new Forbidden(req.t);

		const missing = spec.missing(merged);
		const refusals = publishRefusals(spec, locales);
		if (missing.length > 0 || refusals.length > 0) {
			const clinical = spec.clinical(merged);
			const parts = [
				...missing.map((f) => `${f}: ${say("missing", lang)}`),
				...refusals.map((r) => describeRefusal(r, lang, clinical)),
			];
			throw new APIError(`${say("cannotPublish", lang)}: ${parts.join("; ")}`, 400, {
				missing,
				refusals,
			});
		}
		if (spec.stampsPublishedAt && !merged.publishedAt) {
			out.publishedAt = new Date().toISOString();
		}
		return out;
	};
}
