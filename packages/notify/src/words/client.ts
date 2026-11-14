import * as m from "../paraglide/messages.js";

/** The messages a client reads (and a guardian who answers for them). */
export const CLIENT_WORDS = {
	account_activated_client: {
		subject: m.account_activated_client_subject,
		body: m.account_activated_client_body,
		cta: m.account_activated_client_cta,
	},
	account_invite_client: {
		subject: m.account_invite_client_subject,
		body: m.account_invite_client_body,
		cta: m.account_invite_client_cta,
	},
	account_invite_existing_client: {
		subject: m.account_invite_existing_client_subject,
		body: m.account_invite_existing_client_body,
		cta: m.account_invite_existing_client_cta,
	},
	appointment_cancelled_client: {
		subject: m.appointment_cancelled_client_subject,
		body: m.appointment_cancelled_client_body,
		cta: m.appointment_cancelled_client_cta,
	},
	appointment_confirmed_client: {
		subject: m.appointment_confirmed_client_subject,
		body: m.appointment_confirmed_client_body,
		cta: m.appointment_confirmed_client_cta,
	},
	appointment_moved_client: {
		subject: m.appointment_moved_client_subject,
		body: m.appointment_moved_client_body,
		cta: m.appointment_moved_client_cta,
	},
	appointment_requested_client: {
		subject: m.appointment_requested_client_subject,
		body: m.appointment_requested_client_body,
		cta: m.appointment_requested_client_cta,
	},
	feedback_requested_client: {
		subject: m.feedback_requested_client_subject,
		body: m.feedback_requested_client_body,
		cta: m.feedback_requested_client_cta,
	},
	package_running_low_client: {
		subject: m.package_running_low_client_subject,
		body: m.package_running_low_client_body,
		cta: m.package_running_low_client_cta,
	},
	payment_recorded_client: {
		subject: m.payment_recorded_client_subject,
		body: m.payment_recorded_client_body,
		cta: m.payment_recorded_client_cta,
	},
	reminder_day_before_client: {
		subject: m.reminder_day_before_client_subject,
		body: m.reminder_day_before_client_body,
		cta: m.reminder_day_before_client_cta,
	},
	reminder_two_hours_client: {
		subject: m.reminder_two_hours_client_subject,
		body: m.reminder_two_hours_client_body,
		cta: m.reminder_two_hours_client_cta,
	},
} as const;
