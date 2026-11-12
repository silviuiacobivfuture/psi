import { say } from "../labels";
import { contentHash } from "./hash";
import { hasLocale, type Locale, type ReviewSpec, reviewedContent, reviewOf } from "./spec";

/**
 * The gate's decisions as pure functions over single-locale documents, so each refusal reason is
 * its own test (ported from the stopped CMS slice; `missing-locale` is new: the blog needs both).
 */
export type Refusal =
	| { locale: Locale; reason: "not-approved" }
	| { locale: Locale; reason: "changed-since-approval" }
	| { locale: Locale; reason: "missing-locale" }
	| { locale: null; reason: "no-locale" };

/** One refusal in the editor's admin language, e.g. `ro: not approved by a clinical reviewer`. */
export function describeRefusal(r: Refusal, language: string, clinical: boolean): string {
	switch (r.reason) {
		case "not-approved":
			return `${r.locale}: ${say(clinical ? "notApprovedClinical" : "notApproved", language)}`;
		case "changed-since-approval":
			return `${r.locale}: ${say("changedSinceApproval", language)}`;
		case "missing-locale":
			return `${r.locale}: ${say("bothLocales", language)}`;
		case "no-locale":
			return say("noLocale", language);
	}
}

/** Whether one locale's approval still matches its content. */
export function freshlyApproved(spec: ReviewSpec, doc: Record<string, unknown>): boolean {
	const review = reviewOf(doc);
	return (
		review?.state === "approved" && review.approvedHash === contentHash(reviewedContent(spec, doc))
	);
}

/** Every reason the given locales cannot be published (empty = may publish). */
export function publishRefusals(
	spec: ReviewSpec,
	byLocale: ReadonlyArray<{ locale: Locale; doc: Record<string, unknown> }>,
): Refusal[] {
	const present = byLocale.filter((l) => hasLocale(spec, l.doc));
	if (present.length === 0) return [{ locale: null, reason: "no-locale" }];
	const refusals: Refusal[] = spec.requiredLocales
		.filter((l) => !present.some((p) => p.locale === l))
		.map((locale) => ({ locale, reason: "missing-locale" as const }));
	if (!spec.required(present[0]?.doc ?? {})) return refusals;
	for (const { locale, doc } of present) {
		const review = reviewOf(doc);
		if (review?.state !== "approved") refusals.push({ locale, reason: "not-approved" });
		else if (!freshlyApproved(spec, doc)) {
			refusals.push({ locale, reason: "changed-since-approval" });
		}
	}
	return refusals;
}

/** True when an approved locale's content no longer matches its approval (back to pending). */
export function staleApproval(spec: ReviewSpec, doc: Record<string, unknown>): boolean {
	return reviewOf(doc)?.state === "approved" && !freshlyApproved(spec, doc);
}

/** Every required locale exists and is approved with matching content: the text is approved. */
export function allApproved(
	spec: ReviewSpec,
	byLocale: ReadonlyArray<{ locale: Locale; doc: Record<string, unknown> }>,
): boolean {
	return spec.requiredLocales.every((l) => {
		const d = byLocale.find((b) => b.locale === l)?.doc;
		return d !== undefined && hasLocale(spec, d) && freshlyApproved(spec, d);
	});
}
