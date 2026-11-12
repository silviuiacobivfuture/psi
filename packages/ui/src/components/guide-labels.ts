import type { BookingOffer, RefusalReason } from "@psi/guide";
import type { Child } from "hono/jsx";
import type { GuideSource } from "./guide-message";

/**
 * Every word the answer region shows, from the app's own i18n: the library ships none.
 * `refusals.crisis` is rendered as given (the app's fixed, factual, brand-owned block); the other
 * refusals are inline content, each rendered inside a paragraph.
 */
export interface GuideLabels {
	/** Shown while the guide prepares an answer and says nothing more precise. */
	thinking: string;
	/** The soft status line of the typing indicator, when the guide says what it is doing. */
	stages: { searching: string; checking: string };
	/** Under a finished answer (the page's asking field; the compass shows it once, at the top). */
	footer: string;
	/** Where a refusal (other than crisis) sends the visitor. */
	contact: GuideSource;
	/** The review line a source carries when it has a reviewer and a date. */
	reviewedBy: (name: string, date: string) => string;
	refusals: Record<RefusalReason, Child>;
	/** The button that asks an unanswered question again. */
	retry: string;
	/** Under a question whose answer never arrived (a dropped connection, a reload mid-answer). */
	dropped: string;
	/** Under a question a newer one replaced before it was answered. */
	unanswered: string;
	/**
	 * Booking inside the conversation (a brand that schedules): `render` shows the offered times as
	 * buttons and, on a click, the app's own confirm step (its booking form: name, contact,
	 * consent), which holds, confirms and gives the reference as the booking page does. `summary`
	 * is the guide's turn as the conversation remembers it. Without it, an offer shows the contact
	 * link.
	 */
	booking?: { render: (offer: BookingOffer) => Child; summary: string };
}
