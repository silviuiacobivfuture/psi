import type { GuideLabels } from "@psi/ui";
import type { BookingValues } from "./booking";
import { ChatBooking } from "./chat-booking";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

/** The centre's public phone numbers, for the crisis line. */
const PHONES: ReadonlyArray<{ display: string; tel: string }> = [
	{ display: "0748 017 752", tel: "+40748017752" },
	{ display: "0752 466 792", tel: "+40752466792" },
];

/**
 * Psizone's words for the guide's answer region. The crisis copy is fixed and factual, never
 * generated: 112, then the centre's phones. A booking question gets the free times inside the
 * conversation (`ChatBooking`); `prefill` fills its contact fields for a signed-in visitor.
 */
export function guideLabels(
	locale: Locale,
	opts: {
		prefill?: Pick<BookingValues, "name" | "email" | "phone">;
		/** The estate account's line in the in-chat form (signed in, or the way to sign in). */
		account?: Parameters<typeof ChatBooking>[0]["account"];
	} = {},
): GuideLabels {
	const o = at(locale);
	return {
		booking: {
			render: (offer) => (
				<ChatBooking
					locale={locale}
					offer={offer}
					{...(opts.prefill === undefined ? {} : { prefill: opts.prefill })}
					{...(opts.account === undefined ? {} : { account: opts.account })}
				/>
			),
			summary: m.guide_booking_summary({}, o),
		},
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
			injection: m.guide_refusal_injection({}, o),
			abuse: m.guide_refusal_abuse({}, o),
			rate_limited: m.guide_refusal_rate_limited({}, o),
			exchange_limit: m.guide_refusal_exchange_limit({}, o),
			no_content: m.guide_refusal_no_content({}, o),
			unavailable: m.guide_refusal_unavailable({}, o),
		},
	};
}
