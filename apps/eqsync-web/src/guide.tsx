import type { GuideLabels } from "@psi/ui";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

/** The answer region's spacing under the guide section's and the compass's asking fields. */
export const ANSWER_CLASS = "mt-6 space-y-3";

/**
 * EQ-SYNC's words for the guide's answer region. A refusal points to the frequently asked
 * questions. The crisis copy is fixed and factual, never generated: 112.
 */
export function guideLabels(locale: Locale): GuideLabels {
	const o = at(locale);
	return {
		thinking: m.guide_thinking({}, o),
		footer: m.guide_footer({}, o),
		contact: { label: m.guide_source_faq({}, o), href: `${base(locale)}/#intrebari` },
		reviewedBy: (name, date) => m.guide_reviewed_by({ name, date }, o),
		refusals: {
			crisis: <p class="font-semibold">{m.guide_refusal_crisis({}, o)}</p>,
			out_of_scope: m.guide_refusal_out_of_scope({}, o),
			injection: m.guide_refusal_injection({}, o),
			abuse: m.guide_refusal_abuse({}, o),
			rate_limited: m.guide_refusal_rate_limited({}, o),
			no_content: m.guide_refusal_no_content({}, o),
			unavailable: m.guide_refusal_unavailable({}, o),
		},
	};
}
