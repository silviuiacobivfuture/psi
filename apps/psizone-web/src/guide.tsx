import type { GuideLabels } from "@psi/ui";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

/** The centre's public phone numbers, for the crisis line. */
const PHONES: ReadonlyArray<{ display: string; tel: string }> = [
	{ display: "0748 017 752", tel: "+40748017752" },
	{ display: "0752 466 792", tel: "+40752466792" },
];

/**
 * Psizone's words for the guide's answer region. The crisis copy is fixed and factual, never
 * generated: 112, then the centre's phones.
 */
export function guideLabels(locale: Locale): GuideLabels {
	const o = at(locale);
	return {
		thinking: m.guide_thinking({}, o),
		footer: m.guide_footer({}, o),
		contact: { label: m.guide_source_contact({}, o), href: `${base(locale)}/contact` },
		reviewedBy: (name, date) => m.guide_reviewed_by({ name, date }, o),
		refusals: {
			crisis: (
				<div class="space-y-2">
					<p class="font-semibold">{m.guide_refusal_crisis({}, o)}</p>
					<p>
						{`${m.guide_refusal_crisis_clinic({}, o)} `}
						{PHONES.map((p, i) => (
							<>
								{i > 0 ? " · " : ""}
								<a class="font-mono underline" href={`tel:${p.tel}`}>
									{p.display}
								</a>
							</>
						))}
					</p>
				</div>
			),
			out_of_scope: m.guide_refusal_out_of_scope({}, o),
			no_content: m.guide_refusal_no_content({}, o),
			unavailable: m.guide_refusal_unavailable({}, o),
		},
	};
}
