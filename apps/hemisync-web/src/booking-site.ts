import type { CallbackMailCopy } from "@psi/scheduling";
import {
	type BookingCopy,
	type BookingEnv,
	type BookingLocale,
	type BookingSite,
	routesUnder,
} from "@psi/ui";
import { bookingAccount } from "./account";
import { at } from "./i18n";
import { m } from "./paraglide/messages.js";
import { bookingHref, href } from "./routes";
import { phones } from "./site-settings";

/**
 * Hemi-Sync's own calendar (docs/plans/scheduling.md): the tenant every call to the store
 * carries. Psizone's is "psizone", in its own app; neither can name the other's.
 */
export const TENANT = "hemisync";

/** Hemi-Sync's words for the booking flow, from its own messages (messages/booking). */
export function bookingCopy(locale: BookingLocale): BookingCopy {
	const o = at(locale);
	return {
		errors: {
			name: m.bk_err_name({}, o),
			age: m.bk_err_age({}, o),
			details: m.bk_err_problem({}, o),
			phone: m.bk_err_phone({}, o),
			email: m.bk_err_email({}, o),
			emailTypo: (domain) => m.bk_err_email_typo({ domain }, o),
			forWhom: m.bk_err_for({}, o),
			consent: m.bk_err_consent({}, o),
			slot: m.bk_err_slot({}, o),
			hold: m.bk_err_hold({}, o),
		},
		account: {
			signedIn: m.bk_signed_in({}, o),
			signInHint: m.bk_sign_in_hint({}, o),
			signIn: m.bk_sign_in({}, o),
		},
		details: { title: m.bk_details({}, o), hint: m.bk_details_hint({}, o) },
		fields: {
			name: m.bk_name({}, o),
			email: m.bk_email({}, o),
			nameHint: m.bk_name_hint({}, o),
			age: m.bk_age({}, o),
			ageHint: m.bk_age_hint({}, o),
			details: m.bk_problem({}, o),
			detailsHint: m.bk_problem_hint({}, o),
			phone: m.bk_phone({}, o),
			consent: m.bk_consent({}, o),
			submit: m.bk_submit({}, o),
		},
		audience: { legend: m.bk_for({}, o), labels: { adult: m.bk_for_adult({}, o) } },
		when: {
			legend: m.bk_when({}, o),
			labels: {
				morning: m.bk_when_morning({}, o),
				afternoon: m.bk_when_afternoon({}, o),
				any: m.bk_when_any({}, o),
			},
		},
		done: { title: (name) => m.bk_ok_title({ name }, o), text: m.bk_ok_text({}, o) },
		confirm: {
			title: m.bk_confirm_title({}, o),
			text: (time, day, minutes) => m.bk_confirm_text({ time, day, minutes }, o),
			with: (practitioner) => m.bk_confirm_with({ practitioner }, o),
			submit: m.bk_confirm_submit({}, o),
			change: m.bk_confirm_change({}, o),
		},
		requested: {
			title: (name) => m.bk_requested_title({ name }, o),
			text: (time, day) => m.bk_requested_text({ time, day }, o),
			reference: m.bk_requested_reference({}, o),
			cancel: m.bk_requested_cancel({}, o),
			cancelHow: m.bk_requested_cancel_how({}, o),
		},
		failed: {
			title: m.bk_failed_title({}, o),
			text: m.bk_failed_text({}, o),
			phones: m.bk_failed_phones({}, o),
			retry: m.bk_failed_retry({}, o),
		},
		picker: {
			slots: {
				duration: (minutes) => m.bk_pick_duration({ minutes: String(minutes) }, o),
				chooseDay: m.bk_pick_choose_day({}, o),
				prevWeek: m.bk_pick_prev_week({}, o),
				nextWeek: m.bk_pick_next_week({}, o),
				today: m.bk_pick_today({}, o),
				freeTimes: (count) =>
					count === 1
						? m.bk_pick_free_one({}, o)
						: m.bk_pick_free_many({ count: String(count) }, o),
				noTimes: m.bk_pick_no_times({}, o),
				parts: {
					morning: m.bk_pick_part_morning({}, o),
					afternoon: m.bk_pick_part_afternoon({}, o),
					evening: m.bk_pick_part_evening({}, o),
				},
				mode: m.bk_pick_mode({}, o),
				modes: { onsite: m.bk_pick_mode_onsite({}, o), online: m.bk_pick_mode_online({}, o) },
				practitioner: m.bk_pick_practitioner({}, o),
				anyone: m.bk_pick_anyone({}, o),
				selected: (when, who, mode) =>
					m.bk_pick_selected({ when, who, mode: mode.toLowerCase() }, o),
				nothingSelected: m.bk_pick_nothing({}, o),
				taken: m.bk_pick_taken({}, o),
				emptyWeek: m.bk_pick_empty_week({}, o),
				jumpToNext: (range) => m.bk_pick_jump({ range }, o),
			},
			service: m.bk_pick_service({}, o),
			unavailable: m.bk_pick_unavailable({}, o),
			paused: {
				title: m.bk_pick_paused_title({}, o),
				until: (when) => m.bk_pick_paused_until({ when }, o),
				callback: m.bk_pick_paused_callback({}, o),
				call: m.bk_pick_paused_call({}, o),
			},
			callback: m.bk_pick_callback({}, o),
			back: m.bk_pick_back({}, o),
			modeOnsite: m.bk_pick_mode_onsite({}, o),
			modeOnline: m.bk_pick_mode_online({}, o),
		},
		serviceFallback: (slug) => slug,
		chat: {
			contactLink: m.bk_chat_contact({}, o),
			intro: m.bk_chat_intro({}, o),
			confirmPicker: m.bk_chat_confirm_picker({}, o),
			none: m.bk_chat_none({}, o),
			paused: m.bk_chat_paused({}, o),
			elsewhere: m.bk_chat_elsewhere({}, o),
			elsewhereCta: m.bk_chat_elsewhere_cta({}, o),
			notices: {
				refined: m.bk_chat_refined({}, o),
				relaxed: m.bk_chat_relaxed({}, o),
				taken: m.bk_chat_taken({}, o),
				not_free: m.bk_chat_not_free({}, o),
				ambiguous: m.bk_chat_ambiguous({}, o),
			},
			cancelAsk: m.bk_chat_cancel_ask({}, o),
			cancelResult: {
				cancelled: m.bk_chat_cancel_cancelled({}, o),
				not_found: m.bk_chat_cancel_not_found({}, o),
				not_cancellable: m.bk_chat_cancel_not_cancellable({}, o),
				unavailable: m.bk_chat_cancel_unavailable({}, o),
			},
			services: (services) => m.bk_chat_services({ services }, o),
			details: {
				thanksName: (name) => m.bk_chat_thanks_name({ name }, o),
				thanks: m.bk_chat_thanks({}, o),
				lead: (when) => m.bk_chat_lead({ when }, o),
				ask: {
					name: m.bk_chat_ask_name({}, o),
					age: m.bk_chat_ask_age({}, o),
					details: m.bk_chat_ask_details({}, o),
					phone: m.bk_chat_ask_phone({}, o),
					email: m.bk_chat_ask_email({}, o),
				},
				invalid: {
					name: m.bk_chat_invalid_name({}, o),
					age: m.bk_chat_invalid_age({}, o),
					details: m.bk_chat_invalid_details({}, o),
					phone: m.bk_chat_invalid_phone({}, o),
					email: m.bk_chat_invalid_email({}, o),
				},
				emailTypo: (domain) => m.bk_chat_email_typo({ domain }, o),
				nudge: m.bk_chat_nudge({}, o),
				useForm: m.bk_chat_use_form({}, o),
			},
			card: {
				lead: m.bk_chat_card_lead({}, o),
				labels: {
					service: m.bk_chat_card_service({}, o),
					when: m.bk_chat_card_when({}, o),
					practitioner: m.bk_chat_card_practitioner({}, o),
					name: m.bk_chat_card_name({}, o),
					age: m.bk_chat_card_age({}, o),
					phone: m.bk_chat_card_phone({}, o),
					email: m.bk_chat_card_email({}, o),
					details: m.bk_chat_card_details({}, o),
					forWhom: m.bk_chat_card_for({}, o),
				},
				consent: m.bk_chat_card_consent({}, o),
				confirm: m.bk_chat_card_confirm({}, o),
				edit: m.bk_chat_card_edit({}, o),
				nudge: m.bk_chat_card_nudge({}, o),
			},
			booked: { next: m.bk_chat_booked_next({}, o) },
			slotGone: m.bk_chat_slot_gone({}, o),
			submitRetry: m.bk_chat_submit_retry({}, o),
			summary: {
				paused: (message) => m.bk_chat_summary_paused({ message }, o),
				times: m.bk_chat_summary_times({}, o),
				confirm: m.bk_chat_summary_confirm({}, o),
				cancel: m.bk_chat_summary_cancel({}, o),
				services: m.bk_chat_summary_services({}, o),
				card: m.bk_chat_summary_card({}, o),
				booked: m.bk_chat_summary_booked({}, o),
				failed: m.bk_chat_summary_failed({}, o),
			},
		},
	};
}

/** The team's e-mail for a request, in Romanian whatever language the visitor used. */
export function callbackMailCopy(): CallbackMailCopy {
	const team = at("ro");
	return {
		intro: (site) => m.bk_mail_intro({ site }, team),
		subject: (name) => m.bk_mail_subject({ name }, team),
		name: m.bk_mail_name({}, team),
		phone: m.bk_mail_phone({}, team),
		email: m.bk_mail_email({}, team),
		age: m.bk_mail_age({}, team),
		details: m.bk_mail_details({}, team),
		forWhom: m.bk_mail_for({}, team),
		when: m.bk_mail_when({}, team),
		slot: m.bk_mail_slot({}, team),
		service: m.bk_mail_service({}, team),
		locale: m.bk_mail_locale({}, team),
		page: m.bk_mail_page({}, team),
		received: m.bk_mail_received({}, team),
		stored: m.bk_mail_stored({}, team),
		storedYes: m.bk_mail_stored_yes({}, team),
		storedNo: m.bk_mail_stored_no({}, team),
		consent: m.bk_mail_consent({}, team),
		link: m.bk_mail_link({}, team),
		audience: { adult: m.bk_for_adult({}, team) },
		period: {
			morning: m.bk_when_morning({}, team),
			afternoon: m.bk_when_afternoon({}, team),
			any: m.bk_when_any({}, team),
		},
	};
}

/**
 * What the booking components need for one request's locale. Read per request: the CMS may change
 * the phones, and Hemi-Sync has none until the owners publish them. Sessions are for adults, so
 * the form asks no audience question.
 */
export function bookingEnv(locale: BookingLocale): BookingEnv {
	return {
		locale,
		copy: bookingCopy(locale),
		routes: routesUnder(bookingHref(locale), href(locale, "contact"), bookingHref(locale)),
		phones: phones(),
		audiences: ["adult"],
	};
}

export const site: BookingSite = {
	tenant: TENANT,
	env: bookingEnv,
	account: bookingAccount,
};
