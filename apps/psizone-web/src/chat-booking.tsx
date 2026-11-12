import type { BookingOffer } from "@psi/guide";
import type { JSX } from "hono/jsx/jsx-runtime";
import { BookingForm, type BookingValues, slotDays } from "./booking";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

/**
 * Booking inside the guide's conversation: the free times the guide offered, as the booking
 * form's own time buttons, then its confirm step (name, contact, consent). Submitting it holds the
 * time, the next step confirms it and shows the reference, exactly as on the contact page. The
 * guide only offered the times; nothing is held until the person submits.
 *
 * `prefill` is the app's hook for a signed-in visitor: name, e-mail and phone from their profile,
 * shown in the form and editable. The request's owner (the account's subject) is the booking
 * route's to attach when the form is submitted; nothing here reads a session.
 */
export function ChatBooking({
	locale,
	offer,
	prefill = {},
	account,
}: {
	locale: Locale;
	offer: BookingOffer;
	prefill?: Pick<BookingValues, "name" | "email" | "phone">;
	/** The estate account's line: "filled from your profile", or a sign-in link back to this page. */
	account?: Parameters<typeof BookingForm>[0]["account"];
}): JSX.Element {
	const o = at(locale);
	const seen = new Set<string>();
	const unique = offer.slots.filter((slot) => {
		if (seen.has(slot.slotId)) return false;
		seen.add(slot.slotId);
		return true;
	});
	const days =
		offer.status === "ok" && offer.timeZone !== undefined
			? slotDays(
					unique.map((slot) => ({ id: slot.slotId, start: Date.parse(slot.startsAt) })),
					offer.timeZone,
					locale,
				)
			: [];
	if (days.length === 0) {
		return (
			<div class="space-y-3">
				<p>{m.guide_booking_none({}, o)}</p>
				<a class="underline" href={`${base(locale)}/contact`}>
					{m.guide_source_contact({}, o)}
				</a>
			</div>
		);
	}
	return (
		<div class="space-y-4">
			<p>{m.guide_booking_intro({}, o)}</p>
			<BookingForm
				id="chat-booking"
				locale={locale}
				slots={days}
				values={prefill}
				{...(account === undefined ? {} : { account })}
			/>
		</div>
	);
}
