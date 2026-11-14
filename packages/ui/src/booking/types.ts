import type { Audience } from "@psi/scheduling";
import type { Context } from "hono";
import type { SlotPickerLabels } from "../components/slot-picker";

/** The two languages every psi site is written in. */
export type BookingLocale = "ro" | "en";

/** A published phone number: `tel` for the link, `display` for the eye. */
export interface BookingPhone {
	tel: string;
	display: string;
}

/** What the form says about the estate account, when sign-in is available on the site. */
export type AccountLine = { signedIn: true } | { signedIn: false; signInHref: string };

/** What a visitor may type, as the form carries it. */
export type BookingValues = Partial<
	Record<
		| "name"
		| "age"
		| "details"
		| "email"
		| "phone"
		| "forWhom"
		| "when"
		| "slot"
		| "service"
		| "consent",
		string
	>
>;

export type BookingErrors = Partial<
	Record<"name" | "age" | "details" | "phone" | "email" | "forWhom" | "consent" | "slot", string>
>;

/**
 * The estate account in a booking: pre-fill for a signed-in person, a sign-in line for anyone
 * else, and the account (its subject) on the request when the site lists requests in its account.
 */
export interface BookingAccount {
	/** What the form says about the account; undefined when sign-in is not configured here. */
	form?: AccountLine;
	/** The profile's name, e-mail and phone, editable; empty for an anonymous visitor. */
	prefill: Pick<BookingValues, "name" | "email" | "phone">;
	/** The account's subject: the scheduling service makes the request theirs (their bookings page lists it); undefined when anonymous or when the site lists no requests. */
	subject?: string;
	/** The e-mail the account's sign-in vouches for (`email_verified`), sent with `subject` so the service may link a client. */
	verifiedEmail?: string;
	/** The person's bookings page, when signed in and the site has one. */
	bookingsHref?: string;
}

/**
 * Every word the booking flow shows, in one locale, from the app's own i18n: the library ships
 * none (a site's sessions, its voice and its people are its own).
 */
export interface BookingCopy {
	errors: {
		name: string;
		age: string;
		details: string;
		phone: string;
		email: string;
		/** "Did you mean gmail.com?": the domain the typo probably meant. */
		emailTypo: (domain: string) => string;
		forWhom: string;
		consent: string;
		/** The chosen time is not one the page offered. */
		slot: string;
		/** The held time could not be requested. */
		hold: string;
	};
	account: { signedIn: string; signInHint: string; signIn: string };
	/** The heading above the contact fields, and the line under it while a time is being chosen. */
	details: { title: string; hint: string };
	fields: {
		name: string;
		/** The guardian's name for a child: the contact is the one who answers. */
		nameHint: string;
		age: string;
		ageHint: string;
		details: string;
		detailsHint: string;
		email: string;
		phone: string;
		consent: string;
		submit: string;
	};
	/** Who it is for: a label for each audience the site serves (a site with one audience asks no question). */
	audience: { legend: string; labels: Readonly<Partial<Record<Audience, string>>> };
	when: {
		legend: string;
		labels: Readonly<Record<"morning" | "afternoon" | "any", string>>;
	};
	done: { title: (name: string) => string; text: string };
	confirm: {
		title: string;
		text: (time: string, day: string, minutes: string) => string;
		with: (practitioner: string) => string;
		submit: string;
		change: string;
	};
	requested: {
		title: (name: string) => string;
		text: (time: string, day: string) => string;
		reference: string;
		cancel: string;
		cancelHow: string;
		/** Where the request is found in the site's account: absent on a site that lists none. */
		inAccount?: { text: string; link: string };
	};
	/** The request reached nobody: said plainly, never "thank you". `phones` leads the numbers, when the site has any. */
	failed: { title: string; text: string; phones: string; retry: string };
	picker: {
		/** The slot picker's own words. */
		slots: SlotPickerLabels;
		/** The legend of the service cards. */
		service: string;
		/** The calendar cannot be read, or the site has no services yet: the callback form stands. */
		unavailable: string;
		/**
		 * The clinic paused online booking: a heading over its own message, when it opens again (a formatted date and
		 * time), and the way left: the callback form below, or the phone alone.
		 */
		paused: { title: string; until: (when: string) => string; callback: string; call: string };
		callback: string;
		back: string;
		modeOnsite: string;
		modeOnline: string;
	};
	/** A service's name when the store gives none. */
	serviceFallback: (slug: string) => string;
	chat: {
		contactLink: string;
		intro: string;
		confirmPicker: string;
		none: string;
		/** Switched off in the CMS: where to book instead, and the link's label. */
		elsewhere: string;
		elsewhereCta: string;
		notices: Readonly<Record<"refined" | "relaxed" | "taken" | "not_free" | "ambiguous", string>>;
		cancelAsk: string;
		cancelResult: Readonly<
			Record<"cancelled" | "not_found" | "not_cancellable" | "unavailable", string>
		>;
		services: (names: string) => string;
		/** The guide's lines in the details step: one question at a time, each answer judged by the form's rules. */
		details: {
			thanksName: (name: string) => string;
			thanks: string;
			/** The first question, after the chosen time: `when` is "marți, 17 noiembrie, 10:00". */
			lead: (when: string) => string;
			ask: Readonly<Record<"name" | "age" | "details" | "phone" | "email", string>>;
			/** Why an answer was not taken, naming the problem and what to do. */
			invalid: Readonly<Record<"name" | "age" | "details" | "phone" | "email", string>>;
			/** "Did you mean …@gmail.com?": the domain the typo probably meant. */
			emailTypo: (domain: string) => string;
			/** The message told nothing: back to the question. */
			nudge: string;
			/** The button that opens the booking form with everything typed so far. */
			useForm: string;
		};
		/**
		 * The summary the visitor confirms. `confirm` and `edit` are also the words the button sends
		 * as the visitor's own message, so the engine must read them as a yes and as an edit (a test
		 * of each site guards it).
		 */
		card: {
			lead: string;
			labels: Readonly<
				Record<
					| "service"
					| "when"
					| "practitioner"
					| "name"
					| "age"
					| "phone"
					| "email"
					| "details"
					| "forWhom",
					string
				>
			>;
			consent: string;
			confirm: string;
			edit: string;
			/** The message was not a yes: nothing was sent. */
			nudge: string;
		};
		/** After the guide submitted: what happens next. */
		booked: { next: string };
		/** The time went between the summary and the yes; the details are kept. */
		slotGone: string;
		/** The request could not be sent; saying yes again tries again. */
		submitRetry: string;
		/** Online booking is paused: the line over the clinic's message (which the form shows in its own words). */
		paused: string;
		/**
		 * `paused`: the guide's memory of a turn that showed the clinic's pause, with its message (`message` is the clinic's
		 * own words), so the next reply does not offer times.
		 */
		summary: Readonly<
			Record<"times" | "confirm" | "cancel" | "services" | "card" | "booked" | "failed", string>
		> & { paused: (message: string) => string };
	};
}

/** The site's pages the booking flow posts to and links to, full paths with the locale's prefix. */
export interface BookingRoutes {
	booking: string;
	/** The picker's route: every change of week, day, time, mode or practitioner posts here. */
	slots: string;
	confirm: string;
	release: string;
	contact: string;
	/** Where the chat sends a visitor when in-chat booking is switched off. */
	elsewhere: string;
}

/**
 * The routes under a booking page: `/ore`, `/confirma` and `/renunta` beneath it. `elsewhere` is
 * where the chat points when it may not book (by default the contact page).
 */
export function routesUnder(booking: string, contact: string, elsewhere = contact): BookingRoutes {
	return {
		booking,
		slots: `${booking}/ore`,
		confirm: `${booking}/confirma`,
		release: `${booking}/renunta`,
		contact,
		elsewhere,
	};
}

/** Everything the booking components need for one request's locale. */
export interface BookingEnv {
	locale: BookingLocale;
	copy: BookingCopy;
	routes: BookingRoutes;
	/** The site's own numbers; none is a valid state (the site publishes none yet). */
	phones: ReadonlyArray<BookingPhone>;
	/** Who a booking may be for: one entry means the question is not asked. */
	audiences: ReadonlyArray<Audience>;
}

/** A site's booking: its tenant in the store, and its words, routes and account per locale. */
export interface BookingSite {
	/** The app's calendar space in the scheduling store: every call carries this and no other. */
	readonly tenant: string;
	env(locale: BookingLocale): BookingEnv;
	/** The account side of a request; `fallback` is the full path sign-in returns to. */
	account(c: Context, locale: BookingLocale, fallback: string): Promise<BookingAccount>;
}
