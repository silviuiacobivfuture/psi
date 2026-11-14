import type { SiteSettings } from "@psi/cms-client";
import {
	type AccountLine,
	type BookingValues,
	chatBookingLabels,
	type GuideLabels,
	type Picker,
} from "@psi/ui";
import { bookingEnv } from "./booking-site";
import { picker as sitePicker } from "./booking-store";
import { guideCopy } from "./guide-copy";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";
import { bookingInChat, phones } from "./site-settings";

/**
 * Psizone's words for the guide's answer region. The crisis copy is fixed and factual, never
 * generated: 112, then the centre's phones. A booking question gets the free times inside the
 * conversation (`ChatBooking`); `prefill` fills its contact fields for a signed-in visitor. With
 * `bookingInChat` off in the CMS, the answer points to the contact page instead.
 */
export function guideLabels(
	locale: Locale,
	opts: {
		prefill?: Pick<BookingValues, "name" | "email" | "phone">;
		/** The estate account's line in the in-chat form (signed in, or the way to sign in). */
		account?: AccountLine;
		/** The site settings to read (tests); by default what the CMS said last. */
		settings?: SiteSettings;
		/** Where the booking picker reads free times from (tests); by default the site's store. */
		picker?: Picker;
	} = {},
): GuideLabels {
	const o = at(locale);
	const copy = guideCopy(locale);
	const inChat = bookingInChat(opts.settings);
	return {
		booking: chatBookingLabels({
			env: bookingEnv(locale),
			envOf: bookingEnv,
			picker: opts.picker ?? sitePicker,
			inChat,
			...(opts.prefill === undefined ? {} : { prefill: opts.prefill }),
			...(opts.account === undefined ? {} : { account: opts.account }),
		}),
		thinking: m.guide_thinking({}, o),
		stages: {
			searching: m.guide_stage_searching({}, o),
			checking: m.guide_stage_checking({}, o),
		},
		retry: m.guide_retry({}, o),
		dropped: m.guide_dropped({}, o),
		unanswered: m.guide_unanswered({}, o),
		footer: m.guide_footer({}, o),
		contact: {
			label: m.guide_source_contact({}, o),
			href: `${base(locale)}/contact`,
		},
		reviewedBy: (name, date) => m.guide_reviewed_by({ name, date }, o),
		refusals: {
			crisis: (
				<div class="space-y-2">
					<p class="font-semibold">{m.guide_refusal_crisis({}, o)}</p>
					<p>
						{`${m.guide_refusal_crisis_clinic({}, o)} `}
						{phones().map((p, i) => (
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
			out_of_scope: copy.outOfScope,
			injection: m.guide_refusal_injection({}, o),
			abuse: m.guide_refusal_abuse({}, o),
			rate_limited: m.guide_refusal_rate_limited({}, o),
			exchange_limit: copy.exchangeLimit,
			no_content: m.guide_refusal_no_content({}, o),
			unavailable: m.guide_refusal_unavailable({}, o),
		},
	};
}
