import { randomBytes } from "node:crypto";
import type { BookingOffer } from "@psi/guide";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { HtmlEscapedString } from "hono/utils/html";
import { BookingForm, type BookingValues } from "./booking";
import type { Picker } from "./booking-picker";
import { scheduleOf } from "./booking-routes";
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

function serviceName(
	slug: string,
	locale: Locale,
	names?: Readonly<Record<string, { ro: string; en: string }>>,
): string {
	const named = names?.[slug];
	if (named !== undefined) return locale === "en" ? named.en : named.ro;
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

/** The picker's starting choices, from what the engine offered: the service, the mode, the day and the time. */
function startingChoices(offer: BookingOffer): Record<string, string> {
	const first = offer.chosen ?? offer.slots[0];
	const date = first?.date ?? offer.state?.criteria.fromDate ?? "";
	return {
		service: offer.service,
		mode: offer.state?.criteria.mode ?? first?.mode ?? "",
		week: date,
		day: date,
		slot: offer.chosen?.slotId ?? "",
	};
}

type Details = NonNullable<BookingOffer["details"]>;

/** The form's starting values from what the chat told: the typed details fill it again every turn. */
function typedValues(details: Details): Prefill & Pick<BookingValues, "forWhom" | "consent"> {
	const { name, email, phone, forWhom, consent } = details.values;
	return {
		...(name === undefined ? {} : { name }),
		...(email === undefined ? {} : { email }),
		...(phone === undefined ? {} : { phone }),
		...(forWhom === undefined ? {} : { forWhom }),
		...(consent === undefined ? {} : { consent: "yes" }),
	};
}

/** The guide's one line after a message in the details step: what it took, what it still needs. */
function detailsLine(details: Details, locale: Locale): string {
	const o = at(locale);
	if (details.nudge) return m.guide_details_nudge({}, o);
	if (details.heard.length === 0) return m.guide_booking_confirm_picker({}, o);
	if (details.missing.length === 0) return m.guide_details_ready({}, o);
	const names = {
		name: m.guide_details_need_name({}, o),
		contact: m.guide_details_need_contact({}, o),
		forWhom: m.guide_details_need_for({}, o),
		consent: m.guide_details_need_consent({}, o),
	} as const;
	const what = new Intl.ListFormat(locale, { type: "conjunction" }).format(
		details.missing.map((k) => names[k]),
	);
	const first = details.values.name?.split(" ")[0];
	const thanks =
		details.heard.length === 0
			? ""
			: `${first !== undefined && details.heard.includes("name") ? m.guide_details_thanks_name({ name: first }, o) : m.guide_details_thanks({}, o)} `;
	return `${thanks}${m.guide_details_need({ what }, o)}`;
}

/**
 * The offer inside the conversation bubble. Times come as the booking picker (compact): the week
 * around the offered day, read from the store now, not from the offer's few slots. Picking a time
 * opens the details in place; the picker's own route refreshes it from there.
 */
export async function ChatBooking({
	locale,
	offer,
	prefill = {},
	account,
	formId = chatFormId(),
	source,
}: {
	locale: Locale;
	offer: BookingOffer;
	prefill?: Prefill;
	/** The estate account's line: "filled from your profile", or a sign-in link back to this page. */
	account?: FormAccount;
	/** The form's id; by default a fresh one, so two offers in one conversation never clash. */
	formId?: string;
	/** Where the free times are read from; by default the site's scheduling store. */
	source?: Picker;
}): Promise<HtmlEscapedString> {
	const o = at(locale);
	const accountProp = account === undefined ? {} : { account };
	if (offer.kind === "cancel_ask") return <p>{m.guide_booking_cancel_ask({}, o)}</p>;
	if (offer.kind === "cancel_result") {
		return <p>{cancelText(offer.cancel?.status ?? "unavailable", o)}</p>;
	}
	if (offer.kind === "services") {
		const names =
			offer.services?.map((slug) => serviceName(slug, locale, offer.names)).join(", ") ?? "";
		return <p>{m.guide_booking_services({ services: names }, o)}</p>;
	}
	const schedule = await scheduleOf(startingChoices(offer), source === undefined ? {} : { source });
	if (schedule === undefined) {
		return (
			<div class="space-y-3">
				<p>{m.guide_booking_none({}, o)}</p>
				<Contact locale={locale} />
			</div>
		);
	}
	const typed = offer.details === undefined ? {} : typedValues(offer.details);
	const lead =
		offer.kind === "confirm" && offer.details !== undefined
			? detailsLine(offer.details, locale)
			: offer.kind === "confirm" && offer.chosen !== undefined
				? m.guide_booking_confirm_picker({}, o)
				: offer.notice === undefined
					? m.guide_booking_intro({}, o)
					: NOTICE[offer.notice](o);
	return (
		<div class="space-y-4">
			<p>
				{offer.status === "ok" || offer.kind === "confirm" ? lead : m.guide_booking_none({}, o)}
			</p>
			<BookingForm
				id={formId}
				locale={locale}
				schedule={schedule}
				compact
				values={{ ...prefill, ...typed }}
				{...accountProp}
			/>
		</div>
	);
}
