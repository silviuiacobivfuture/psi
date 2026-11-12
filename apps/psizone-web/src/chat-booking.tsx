import { randomBytes } from "node:crypto";
import type { BookingOffer } from "@psi/guide";
import type { JSX } from "hono/jsx/jsx-runtime";
import { BookingForm, type BookingValues, type SlotDay, slotDays } from "./booking";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

/**
 * Booking inside the guide's conversation. Each booking turn is rendered from what the engine sent:
 * the free times as the booking form's own time buttons (a refinement says what it did), a time the
 * visitor named and the guide found free as the same form with that time chosen, the request for a
 * reference and cancel code, the result of a cancellation, the services. Submitting the form holds
 * the time, the next step confirms it and shows the reference and cancel code, exactly as on the
 * contact page: the guide only offers and checks; nothing is held until the person submits, and the
 * contact never passes through the model.
 *
 * `prefill` is the app's hook for a signed-in visitor: name, e-mail and phone from their profile,
 * shown in the form and editable. The request's owner (the account's subject) is the booking
 * route's to attach when the form is submitted; nothing here reads a session.
 */

type Prefill = Pick<BookingValues, "name" | "email" | "phone">;
type FormAccount = Parameters<typeof BookingForm>[0]["account"];

/** A form id no other form in the page shares: every offer is its own form. */
export function chatFormId(): string {
	return `chat-booking-${randomBytes(3).toString("hex")}`;
}

/** "vineri, 20 noiembrie", from the local date a slot carries (no zone arithmetic needed). */
function dayOf(date: string, locale: Locale): string {
	return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
		timeZone: "UTC",
		weekday: "long",
		day: "numeric",
		month: "long",
	}).format(Date.parse(`${date}T12:00:00Z`));
}

function Contact({ locale }: { locale: Locale }): JSX.Element {
	return (
		<a class="underline" href={`${base(locale)}/contact`}>
			{m.guide_source_contact({}, at(locale))}
		</a>
	);
}

const NOTICE = {
	refined: (o: { locale: Locale }) => m.guide_booking_refined({}, o),
	relaxed: (o: { locale: Locale }) => m.guide_booking_relaxed({}, o),
	taken: (o: { locale: Locale }) => m.guide_booking_taken({}, o),
	not_free: (o: { locale: Locale }) => m.guide_booking_not_free({}, o),
	ambiguous: (o: { locale: Locale }) => m.guide_booking_ambiguous({}, o),
} as const;

function serviceName(slug: string, locale: Locale): string {
	const o = at(locale);
	return slug === "evaluation" ? m.guide_booking_service_evaluation({}, o) : slug;
}

function cancelText(status: NonNullable<BookingOffer["cancel"]>["status"], o: { locale: Locale }) {
	switch (status) {
		case "cancelled":
			return m.guide_booking_cancel_cancelled({}, o);
		case "not_found":
			return m.guide_booking_cancel_not_found({}, o);
		case "not_cancellable":
			return m.guide_booking_cancel_not_cancellable({}, o);
		case "unavailable":
			return m.guide_booking_cancel_unavailable({}, o);
		default: {
			const unreachable: never = status;
			return unreachable;
		}
	}
}

/** The guide's one-line memory of a booking turn: no time, no code, nothing personal. */
export function bookingSummary(offer: BookingOffer, locale: Locale): string {
	const o = at(locale);
	switch (offer.kind) {
		case "times":
			return m.guide_booking_summary({}, o);
		case "confirm":
			return m.guide_booking_summary_confirm({}, o);
		case "cancel_ask":
		case "cancel_result":
			return m.guide_booking_summary_cancel({}, o);
		case "services":
			return m.guide_booking_summary_services({}, o);
		default: {
			const unreachable: never = offer.kind;
			return unreachable;
		}
	}
}

export function ChatBooking({
	locale,
	offer,
	prefill = {},
	account,
	formId = chatFormId(),
}: {
	locale: Locale;
	offer: BookingOffer;
	prefill?: Prefill;
	/** The estate account's line: "filled from your profile", or a sign-in link back to this page. */
	account?: FormAccount;
	/** The form's id; by default a fresh one, so two offers in one conversation never clash. */
	formId?: string;
}): JSX.Element {
	const o = at(locale);
	const accountProp = account === undefined ? {} : { account };
	if (offer.kind === "cancel_ask") return <p>{m.guide_booking_cancel_ask({}, o)}</p>;
	if (offer.kind === "cancel_result") {
		return <p>{cancelText(offer.cancel?.status ?? "unavailable", o)}</p>;
	}
	if (offer.kind === "services") {
		const names = offer.services?.map((slug) => serviceName(slug, locale)).join(", ") ?? "";
		return <p>{m.guide_booking_services({ services: names }, o)}</p>;
	}
	if (offer.kind === "confirm" && offer.chosen !== undefined) {
		const chosen = offer.chosen;
		const day = dayOf(chosen.date, locale);
		const days: ReadonlyArray<SlotDay> = [
			{ day, slots: [{ id: chosen.slotId, time: chosen.time }] },
		];
		return (
			<div class="space-y-4">
				<p>{m.guide_booking_confirm({ time: chosen.time, day }, o)}</p>
				<BookingForm
					id={formId}
					locale={locale}
					slots={days}
					values={{ ...prefill, slot: chosen.slotId }}
					{...accountProp}
				/>
			</div>
		);
	}
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
				<Contact locale={locale} />
			</div>
		);
	}
	return (
		<div class="space-y-4">
			<p>{offer.notice === undefined ? m.guide_booking_intro({}, o) : NOTICE[offer.notice](o)}</p>
			<BookingForm id={formId} locale={locale} slots={days} values={prefill} {...accountProp} />
		</div>
	);
}
