import type { SiteSettings } from "@psi/cms-client";
import {
	type AccountLine,
	type BookingValues,
	chatBookingLabels,
	type GuideLabels,
	type Picker,
} from "@psi/ui";
import { bookingEnv } from "./booking-site";
import { bookingDeps } from "./booking-store";
import { guideCopy } from "./guide-copy";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";
import { bookingInChat } from "./site-settings";

/**
 * Hemi-Sync România's words for the guide's answer region. A refusal points to the programmes.
 * The crisis copy is fixed and factual, never generated: 112. A booking question gets Hemi-Sync's
 * own free times inside the conversation (its tenant only), or its callback form while the store
 * has none; `prefill` fills the form's contact fields for a signed-in visitor. With `bookingInChat`
 * off in the CMS, the answer points to the booking page instead.
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
	return {
		booking: chatBookingLabels({
			env: bookingEnv(locale),
			picker: opts.picker ?? bookingDeps.picker,
			inChat: bookingInChat(opts.settings),
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
			label: m.guide_source_programmes({}, o),
			href: `${base(locale)}/#programe`,
		},
		reviewedBy: (name, date) => m.guide_reviewed_by({ name, date }, o),
		refusals: {
			crisis: <p class="font-semibold">{m.guide_refusal_crisis({}, o)}</p>,
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
