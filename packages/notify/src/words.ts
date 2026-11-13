import * as m from "./paraglide/messages.js";

/** Every value a template may print; each message takes the subset it names. */
export interface Params {
	readonly name: string;
	readonly kind: string;
	readonly service: string;
	readonly date: string;
	readonly time: string;
	readonly client: string;
	readonly remaining: string;
	readonly person: string;
	readonly from: string;
	readonly to: string;
	readonly amount: string;
	readonly summary: string;
}

export type Locale = "ro" | "en";
type Fn = (params: Params, options: { locale: Locale }) => string;

export interface Words {
	readonly subject: Fn;
	readonly body: Fn;
	readonly cta: Fn;
}

/** The message functions of every catalogue entry, by stem; a missing key fails the type-check. */
export const WORDS = {
	appointment_cancelled_client: {
		subject: m.appointment_cancelled_client_subject,
		body: m.appointment_cancelled_client_body,
		cta: m.appointment_cancelled_client_cta,
	},
	appointment_cancelled_practitioner: {
		subject: m.appointment_cancelled_practitioner_subject,
		body: m.appointment_cancelled_practitioner_body,
		cta: m.appointment_cancelled_practitioner_cta,
	},
	appointment_confirmed_client: {
		subject: m.appointment_confirmed_client_subject,
		body: m.appointment_confirmed_client_body,
		cta: m.appointment_confirmed_client_cta,
	},
	appointment_confirmed_practitioner: {
		subject: m.appointment_confirmed_practitioner_subject,
		body: m.appointment_confirmed_practitioner_body,
		cta: m.appointment_confirmed_practitioner_cta,
	},
	appointment_moved_client: {
		subject: m.appointment_moved_client_subject,
		body: m.appointment_moved_client_body,
		cta: m.appointment_moved_client_cta,
	},
	appointment_moved_practitioner: {
		subject: m.appointment_moved_practitioner_subject,
		body: m.appointment_moved_practitioner_body,
		cta: m.appointment_moved_practitioner_cta,
	},
	appointment_requested_client: {
		subject: m.appointment_requested_client_subject,
		body: m.appointment_requested_client_body,
		cta: m.appointment_requested_client_cta,
	},
	appointment_requested_practitioner: {
		subject: m.appointment_requested_practitioner_subject,
		body: m.appointment_requested_practitioner_body,
		cta: m.appointment_requested_practitioner_cta,
	},
	assistant_action_done_actor: {
		subject: m.assistant_action_done_actor_subject,
		body: m.assistant_action_done_actor_body,
		cta: m.assistant_action_done_actor_cta,
	},
	leave_approved_requester: {
		subject: m.leave_approved_requester_subject,
		body: m.leave_approved_requester_body,
		cta: m.leave_approved_requester_cta,
	},
	leave_declined_requester: {
		subject: m.leave_declined_requester_subject,
		body: m.leave_declined_requester_body,
		cta: m.leave_declined_requester_cta,
	},
	leave_requested_owners: {
		subject: m.leave_requested_owners_subject,
		body: m.leave_requested_owners_body,
		cta: m.leave_requested_owners_cta,
	},
	package_running_low_reception: {
		subject: m.package_running_low_reception_subject,
		body: m.package_running_low_reception_body,
		cta: m.package_running_low_reception_cta,
	},
	payment_recorded_client: {
		subject: m.payment_recorded_client_subject,
		body: m.payment_recorded_client_body,
		cta: m.payment_recorded_client_cta,
	},
	reminder_confirmed_reception: {
		subject: m.reminder_confirmed_reception_subject,
		body: m.reminder_confirmed_reception_body,
		cta: m.reminder_confirmed_reception_cta,
	},
	reminder_day_before_client: {
		subject: m.reminder_day_before_client_subject,
		body: m.reminder_day_before_client_body,
		cta: m.reminder_day_before_client_cta,
	},
	reminder_declined_reception: {
		subject: m.reminder_declined_reception_subject,
		body: m.reminder_declined_reception_body,
		cta: m.reminder_declined_reception_cta,
	},
	request_new_team: {
		subject: m.request_new_team_subject,
		body: m.request_new_team_body,
		cta: m.request_new_team_cta,
	},
} as const satisfies Record<string, Words>;

export type Stem = keyof typeof WORDS;
