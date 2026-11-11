import type { GuideLabels } from "@psi/ui";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

/** The answer region's spacing under the guide section's and the compass's asking fields. */
export const ANSWER_CLASS = "mt-6 space-y-3";

/**
 * Hemi-Sync România's words for the guide's answer region. A refusal points to the programmes.
 * The crisis copy is fixed and factual, never generated: 112.
 */
export function guideLabels(locale: Locale): GuideLabels {
	const o = at(locale);
	return {
		thinking: m.guide_thinking({}, o),
		footer: m.guide_footer({}, o),
		contact: { label: m.guide_source_programmes({}, o), href: `${base(locale)}/#programe` },
		reviewedBy: (name, date) => m.guide_reviewed_by({ name, date }, o),
		refusals: {
			crisis: <p class="font-semibold">{m.guide_refusal_crisis({}, o)}</p>,
			out_of_scope: m.guide_refusal_out_of_scope({}, o),
			no_content: m.guide_refusal_no_content({}, o),
			unavailable: m.guide_refusal_unavailable({}, o),
		},
	};
}
