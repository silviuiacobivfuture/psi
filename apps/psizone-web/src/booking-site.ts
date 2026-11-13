import type { CallbackMailCopy } from "@psi/scheduling";
import {
	type BookingCopy,
	type BookingEnv,
	type BookingLocale,
	type BookingSite,
	routesUnder,
} from "@psi/ui";
import { bookingAccount } from "./booking-account";
import { at, base } from "./i18n";
import { m } from "./paraglide/messages.js";
import { phones } from "./site-settings";

/**
 * Psizone's evaluation calendar (docs/plans/scheduling.md): the tenant every call to the store
 * carries. Hemi-Sync's is "hemisync", in its own app; neither can name the other's.
 */
export const TENANT = "psizone";

/** Psizone's words for the booking flow, from its own messages. */
export function bookingCopy(locale: BookingLocale): BookingCopy {
	const o = at(locale);
	return {
		errors: {
			name: m.form_err_name({}, o),
			age: m.form_err_age({}, o),
			details: m.form_err_details({}, o),
			phone: m.form_err_phone({}, o),
			email: m.form_err_email({}, o),
			emailTypo: (domain) => m.form_err_email_typo({ domain }, o),
			forWhom: m.form_err_for({}, o),
			consent: m.form_err_consent({}, o),
			slot: m.form_err_slot({}, o),
			hold: m.form_err_hold({}, o),
		},
		account: {
			signedIn: m.form_signed_in({}, o),
			signInHint: m.form_sign_in_hint({}, o),
			signIn: m.form_sign_in({}, o),
		},
		details: { title: m.pick_details({}, o), hint: m.pick_details_hint({}, o) },
		fields: {
			name: m.form_name({}, o),
			email: m.form_email({}, o),
			nameHint: m.form_name_hint({}, o),
			age: m.form_age({}, o),
			ageHint: m.form_age_hint({}, o),
			details: m.form_details({}, o),
			detailsHint: m.form_details_hint({}, o),
			phone: m.form_phone({}, o),
			consent: m.form_consent({}, o),
			submit: m.form_submit({}, o),
		},
		audience: {
			legend: m.form_for({}, o),
			labels: {
				child: m.form_for_child({}, o),
				teen: m.form_for_teen({}, o),
				adult: m.form_for_adult({}, o),
			},
		},
		when: {
			legend: m.form_when({}, o),
			labels: {
				morning: m.form_when_morning({}, o),
				afternoon: m.form_when_afternoon({}, o),
				any: m.form_when_any({}, o),
			},
		},
		done: { title: (name) => m.form_ok_title({ name }, o), text: m.callback_ok_text({}, o) },
		confirm: {
			title: m.confirm_title({}, o),
			text: (time, day, minutes) => m.confirm_text({ time, day, minutes }, o),
			with: (practitioner) => m.confirm_with({ practitioner }, o),
			submit: m.confirm_submit({}, o),
			change: m.confirm_change({}, o),
		},
		requested: {
			title: (name) => m.requested_title({ name }, o),
			text: (time, day) => m.requested_text({ time, day }, o),
			reference: m.requested_reference({}, o),
			cancel: m.requested_cancel({}, o),
			cancelHow: m.requested_cancel_how({}, o),
			inAccount: {
				text: m.requested_in_account({}, o),
				link: m.requested_in_account_link({}, o),
			},
		},
		failed: {
			title: m.callback_failed_title({}, o),
			text: m.callback_failed_text({}, o),
			phones: m.callback_failed_phones({}, o),
			retry: m.callback_failed_retry({}, o),
		},
		picker: {
			slots: {
				duration: (minutes) => m.pick_duration({ minutes: String(minutes) }, o),
				chooseDay: m.pick_choose_day({}, o),
				prevWeek: m.pick_prev_week({}, o),
				nextWeek: m.pick_next_week({}, o),
				today: m.pick_today({}, o),
				freeTimes: (count) =>
					count === 1 ? m.pick_free_one({}, o) : m.pick_free_many({ count: String(count) }, o),
				noTimes: m.pick_no_times({}, o),
				parts: {
					morning: m.pick_part_morning({}, o),
					afternoon: m.pick_part_afternoon({}, o),
					evening: m.pick_part_evening({}, o),
				},
				mode: m.pick_mode({}, o),
				modes: { onsite: m.pick_mode_onsite({}, o), online: m.pick_mode_online({}, o) },
				practitioner: m.pick_practitioner({}, o),
				anyone: m.pick_anyone({}, o),
				selected: (when, who, mode) => m.pick_selected({ when, who, mode: mode.toLowerCase() }, o),
				nothingSelected: m.pick_nothing({}, o),
				taken: m.pick_taken({}, o),
				emptyWeek: m.pick_empty_week({}, o),
				jumpToNext: (range) => m.pick_jump({ range }, o),
			},
			service: m.pick_service({}, o),
			unavailable: m.pick_unavailable({}, o),
			callback: m.pick_callback({}, o),
			back: m.pick_back({}, o),
			modeOnsite: m.pick_mode_onsite({}, o),
			modeOnline: m.pick_mode_online({}, o),
		},
		serviceFallback: (slug) =>
			slug === "evaluation" ? m.guide_booking_service_evaluation({}, o) : slug,
		chat: {
			contactLink: m.guide_source_contact({}, o),
			intro: m.guide_booking_intro({}, o),
			confirmPicker: m.guide_booking_confirm_picker({}, o),
			none: m.guide_booking_none({}, o),
			elsewhere: m.guide_booking_elsewhere({}, o),
			elsewhereCta: m.cta_book({}, o),
			notices: {
				refined: m.guide_booking_refined({}, o),
				relaxed: m.guide_booking_relaxed({}, o),
				taken: m.guide_booking_taken({}, o),
				not_free: m.guide_booking_not_free({}, o),
				ambiguous: m.guide_booking_ambiguous({}, o),
			},
			cancelAsk: m.guide_booking_cancel_ask({}, o),
			cancelResult: {
				cancelled: m.guide_booking_cancel_cancelled({}, o),
				not_found: m.guide_booking_cancel_not_found({}, o),
				not_cancellable: m.guide_booking_cancel_not_cancellable({}, o),
				unavailable: m.guide_booking_cancel_unavailable({}, o),
			},
			services: (services) => m.guide_booking_services({ services }, o),
			details: {
				thanksName: (name) => m.guide_details_thanks_name({ name }, o),
				thanks: m.guide_details_thanks({}, o),
				lead: (when) => m.guide_details_lead({ when }, o),
				ask: {
					name: m.guide_details_ask_name({}, o),
					age: m.guide_details_ask_age({}, o),
					details: m.guide_details_ask_details({}, o),
					phone: m.guide_details_ask_phone({}, o),
					email: m.guide_details_ask_email({}, o),
				},
				invalid: {
					name: m.guide_details_invalid_name({}, o),
					age: m.guide_details_invalid_age({}, o),
					details: m.guide_details_invalid_details({}, o),
					phone: m.guide_details_invalid_phone({}, o),
					email: m.guide_details_invalid_email({}, o),
				},
				emailTypo: (domain) => m.guide_details_email_typo({ domain }, o),
				nudge: m.guide_details_nudge({}, o),
				useForm: m.guide_details_use_form({}, o),
			},
			card: {
				title: m.guide_details_card_title({}, o),
				lead: m.guide_details_card_lead({}, o),
				labels: {
					service: m.guide_details_card_service({}, o),
					when: m.guide_details_card_when({}, o),
					practitioner: m.guide_details_card_practitioner({}, o),
					name: m.guide_details_card_name({}, o),
					age: m.guide_details_card_age({}, o),
					phone: m.guide_details_card_phone({}, o),
					email: m.guide_details_card_email({}, o),
					details: m.guide_details_card_details({}, o),
					forWhom: m.guide_details_card_for({}, o),
				},
				consent: m.guide_details_card_consent({}, o),
				confirm: m.guide_details_card_confirm({}, o),
				edit: m.guide_details_card_edit({}, o),
				nudge: m.guide_details_card_nudge({}, o),
			},
			booked: { next: m.guide_details_booked_next({}, o) },
			slotGone: m.guide_details_slot_gone({}, o),
			submitRetry: m.guide_details_submit_retry({}, o),
			summary: {
				times: m.guide_booking_summary({}, o),
				confirm: m.guide_booking_summary_confirm({}, o),
				cancel: m.guide_booking_summary_cancel({}, o),
				services: m.guide_booking_summary_services({}, o),
				card: m.guide_booking_summary_card({}, o),
				booked: m.guide_booking_summary_booked({}, o),
				failed: m.guide_booking_summary_failed({}, o),
			},
		},
	};
}

/** The team's e-mail for a request, in Romanian whatever language the visitor used. */
export function callbackMailCopy(): CallbackMailCopy {
	const team = at("ro");
	return {
		intro: (site) => m.callback_mail_intro({ site }, team),
		subject: (name) => m.callback_mail_subject({ name }, team),
		name: m.callback_mail_name({}, team),
		phone: m.callback_mail_phone({}, team),
		email: m.callback_mail_email({}, team),
		age: m.callback_mail_age({}, team),
		details: m.callback_mail_details({}, team),
		forWhom: m.callback_mail_for({}, team),
		when: m.callback_mail_when({}, team),
		slot: m.callback_mail_slot({}, team),
		service: m.callback_mail_service({}, team),
		locale: m.callback_mail_locale({}, team),
		page: m.callback_mail_page({}, team),
		received: m.callback_mail_received({}, team),
		stored: m.callback_mail_stored({}, team),
		storedYes: m.callback_mail_stored_yes({}, team),
		storedNo: m.callback_mail_stored_no({}, team),
		consent: m.callback_mail_consent({}, team),
		link: m.callback_mail_link({}, team),
		audience: {
			child: m.form_for_child({}, team),
			teen: m.form_for_teen({}, team),
			adult: m.form_for_adult({}, team),
		},
		period: {
			morning: m.form_when_morning({}, team),
			afternoon: m.form_when_afternoon({}, team),
			any: m.form_when_any({}, team),
		},
	};
}

/** What the booking components need for one request's locale. Read per request: the CMS may change the phones. */
export function bookingEnv(locale: BookingLocale): BookingEnv {
	return {
		locale,
		copy: bookingCopy(locale),
		routes: routesUnder(`${base(locale)}/programare`, `${base(locale)}/contact`),
		phones: phones(),
		audiences: ["child", "teen", "adult"],
	};
}

export const site: BookingSite = {
	tenant: TENANT,
	env: bookingEnv,
	account: bookingAccount,
};
