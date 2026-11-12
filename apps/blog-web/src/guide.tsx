import type { AnswerTarget, GuideLabels } from "@psi/ui";
import { EDITORIAL_POLICY } from "./content/editorial-policy";
import { at, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";
import { routes } from "./routes";

/** The answer region's spacing: the ask bar's sits under the bar, the compass's fills its panel. */
export function answerClass(target: AnswerTarget): string {
	return target === "guide-answer" ? "mt-5 space-y-3" : "space-y-3";
}

/**
 * The Blog's words for the guide's answer region. A refusal points to how articles are written
 * and reviewed. The crisis copy is fixed and factual, never generated: 112.
 */
export function guideLabels(locale: Locale): GuideLabels {
	const o = at(locale);
	return {
		thinking: m.guide_thinking({}, o),
		footer: m.guide_footer({}, o),
		contact: {
			label: EDITORIAL_POLICY.title[locale],
			href: routes.article(locale, EDITORIAL_POLICY.slug),
		},
		reviewedBy: (name, date) => m.guide_reviewed_by({ name, date }, o),
		refusals: {
			crisis: <p class="font-semibold">{m.guide_refusal_crisis({}, o)}</p>,
			out_of_scope: m.guide_refusal_out_of_scope({}, o),
			injection: m.guide_refusal_injection({}, o),
			abuse: m.guide_refusal_abuse({}, o),
			rate_limited: m.guide_refusal_rate_limited({}, o),
			exchange_limit: m.guide_refusal_exchange_limit({}, o),
			no_content: m.guide_refusal_no_content({}, o),
			unavailable: m.guide_refusal_unavailable({}, o),
		},
	};
}
