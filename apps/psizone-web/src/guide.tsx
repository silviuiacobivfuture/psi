import type { SiteSettings } from "@psi/cms-client";
import type { GuideLabels } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { BookingValues } from "./booking";
import { bookingSummary, ChatBooking } from "./chat-booking";
import { guideCopy } from "./guide-copy";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";
import { bookingInChat, phones } from "./site-settings";

/** With in-chat booking switched off in the CMS: the way to the contact page, no free times. */
function BookingElsewhere({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<div class="space-y-3">
			<p>{m.guide_booking_elsewhere({}, o)}</p>
			<p>
				<a class="font-semibold underline" href={`${base(locale)}/contact`}>
					{m.cta_book({}, o)}
				</a>
			</p>
		</div>
	);
}

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
		account?: Parameters<typeof ChatBooking>[0]["account"];
		/** The site settings to read (tests); by default what the CMS said last. */
		settings?: SiteSettings;
	} = {},
): GuideLabels {
	const o = at(locale);
	const copy = guideCopy(locale);
	const inChat = bookingInChat(opts.settings);
	return {
		booking: {
			render: (offer) =>
				inChat ? (
					<ChatBooking
						locale={locale}
						offer={offer}
						{...(opts.prefill === undefined ? {} : { prefill: opts.prefill })}
						{...(opts.account === undefined ? {} : { account: opts.account })}
					/>
				) : (
					<BookingElsewhere locale={locale} />
				),
			summary: (offer) =>
				inChat ? bookingSummary(offer, locale) : m.guide_booking_elsewhere({}, o),
		},
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
