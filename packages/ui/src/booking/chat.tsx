/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { randomBytes } from "node:crypto";
import type { BookingOffer } from "@psi/guide";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { HtmlEscapedString } from "hono/utils/html";
import type { GuideLabels } from "../components/guide-labels";
import { BookingForm } from "./form";
import type { Picker } from "./picker";
import { scheduleOf } from "./routes";
import type { AccountLine, BookingEnv, BookingValues } from "./types";

/**
 * Booking inside the guide's conversation. Each booking turn is rendered from what the engine sent:
 * the free times as the booking form's own time buttons (a refinement says what it did), a time the
 * visitor named and the guide found free as the same form with that time chosen, the request for a
 * reference and cancel code, the result of a cancellation, the services. Submitting the form holds
 * the time, the next step confirms it and shows the reference and cancel code, exactly as on the
 * booking page: the guide only offers and checks; nothing is held until the person submits, and the
 * contact never passes through the model.
 *
 * `prefill` is the app's hook for a signed-in visitor: name, e-mail and phone from their profile,
 * shown in the form and editable. The request's owner (the account's subject) is the booking
 * route's to attach when the form is submitted; nothing here reads a session.
 */

type Prefill = Pick<BookingValues, "name" | "email" | "phone">;

/** A form id no other form in the page shares: every offer is its own form. */
export function chatFormId(): string {
	return `chat-booking-${randomBytes(3).toString("hex")}`;
}

function Contact({ env }: { env: BookingEnv }): JSX.Element {
	return (
		<a class="underline" href={env.routes.contact}>
			{env.copy.chat.contactLink}
		</a>
	);
}

function serviceName(
	slug: string,
	env: BookingEnv,
	names?: Readonly<Record<string, { ro: string; en: string }>>,
): string {
	const named = names?.[slug];
	if (named !== undefined) return env.locale === "en" ? named.en : named.ro;
	return env.copy.serviceFallback(slug);
}

/** The guide's one-line memory of a booking turn: no time, no code, nothing personal. */
export function bookingSummary(offer: BookingOffer, env: BookingEnv): string {
	const { summary } = env.copy.chat;
	switch (offer.kind) {
		case "times":
			return summary.times;
		case "confirm":
			return summary.confirm;
		case "cancel_ask":
		case "cancel_result":
			return summary.cancel;
		case "services":
			return summary.services;
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

/**
 * The offer inside the conversation bubble. Times come as the booking picker (compact): the week
 * around the offered day, read from the store now, not from the offer's few slots. Picking a time
 * opens the details in place; the picker's own route refreshes it from there. A site whose store
 * has no services (or cannot be read) shows its callback form, never another site's times.
 */
export async function ChatBooking({
	env,
	offer,
	picker,
	prefill = {},
	account,
	formId = chatFormId(),
}: {
	env: BookingEnv;
	offer: BookingOffer;
	/** Where the free times are read from: this site's tenant only. */
	picker: Picker;
	prefill?: Prefill;
	/** The estate account's line: "filled from your profile", or a sign-in link back to this page. */
	account?: AccountLine;
	/** The form's id; by default a fresh one, so two offers in one conversation never clash. */
	formId?: string;
}): Promise<HtmlEscapedString> {
	const { chat } = env.copy;
	const accountProp = account === undefined ? {} : { account };
	if (offer.kind === "cancel_ask") return <p>{chat.cancelAsk}</p>;
	if (offer.kind === "cancel_result") {
		return <p>{chat.cancelResult[offer.cancel?.status ?? "unavailable"]}</p>;
	}
	if (offer.kind === "services") {
		const names =
			offer.services?.map((slug) => serviceName(slug, env, offer.names)).join(", ") ?? "";
		return <p>{chat.services(names)}</p>;
	}
	const schedule = await scheduleOf(picker, startingChoices(offer));
	if (schedule === undefined) {
		return (
			<div class="space-y-3">
				<p>{chat.none}</p>
				<Contact env={env} />
			</div>
		);
	}
	const lead =
		offer.kind === "confirm" && offer.chosen !== undefined
			? chat.confirmPicker
			: offer.notice === undefined
				? chat.intro
				: chat.notices[offer.notice];
	return (
		<div class="space-y-4">
			<p>{offer.status === "ok" || offer.kind === "confirm" ? lead : chat.none}</p>
			<BookingForm
				id={formId}
				env={env}
				schedule={schedule}
				compact
				values={prefill}
				{...accountProp}
			/>
		</div>
	);
}

function BookingElsewhere({ env }: { env: BookingEnv }): JSX.Element {
	return (
		<div class="space-y-3">
			<p>{env.copy.chat.elsewhere}</p>
			<p>
				<a class="font-semibold underline" href={env.routes.elsewhere}>
					{env.copy.chat.elsewhereCta}
				</a>
			</p>
		</div>
	);
}

/**
 * The chat's `booking` labels: the offers as forms, or, with in-chat booking switched off in the
 * CMS (`inChat` false), the way to the contact page and no free times.
 */
export function chatBookingLabels(options: {
	env: BookingEnv;
	picker: Picker;
	inChat: boolean;
	prefill?: Prefill;
	account?: AccountLine;
}): NonNullable<GuideLabels["booking"]> {
	const { env, picker, inChat, prefill, account } = options;
	return {
		render: (offer) =>
			inChat ? (
				<ChatBooking
					env={env}
					offer={offer}
					picker={picker}
					{...(prefill === undefined ? {} : { prefill })}
					{...(account === undefined ? {} : { account })}
				/>
			) : (
				<BookingElsewhere env={env} />
			),
		summary: (offer) => (inChat ? bookingSummary(offer, env) : env.copy.chat.elsewhere),
	};
}
