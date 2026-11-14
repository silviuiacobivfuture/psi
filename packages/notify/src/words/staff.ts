import * as m from "../paraglide/messages.js";

/** The messages reception, the team and the therapists read. */
export const STAFF_WORDS = {
	appointment_cancelled_practitioner: {
		subject: m.appointment_cancelled_practitioner_subject,
		body: m.appointment_cancelled_practitioner_body,
		cta: m.appointment_cancelled_practitioner_cta,
	},
	appointment_cancelled_reception: {
		subject: m.appointment_cancelled_reception_subject,
		body: m.appointment_cancelled_reception_body,
		cta: m.appointment_cancelled_reception_cta,
	},
	appointment_confirmed_practitioner: {
		subject: m.appointment_confirmed_practitioner_subject,
		body: m.appointment_confirmed_practitioner_body,
		cta: m.appointment_confirmed_practitioner_cta,
	},
	appointment_confirmed_reception: {
		subject: m.appointment_confirmed_reception_subject,
		body: m.appointment_confirmed_reception_body,
		cta: m.appointment_confirmed_reception_cta,
	},
	appointment_conflict_reception: {
		subject: m.appointment_conflict_reception_subject,
		body: m.appointment_conflict_reception_body,
		cta: m.appointment_conflict_reception_cta,
	},
	appointment_moved_practitioner: {
		subject: m.appointment_moved_practitioner_subject,
		body: m.appointment_moved_practitioner_body,
		cta: m.appointment_moved_practitioner_cta,
	},
	appointment_moved_reception: {
		subject: m.appointment_moved_reception_subject,
		body: m.appointment_moved_reception_body,
		cta: m.appointment_moved_reception_cta,
	},
	appointment_requested_practitioner: {
		subject: m.appointment_requested_practitioner_subject,
		body: m.appointment_requested_practitioner_body,
		cta: m.appointment_requested_practitioner_cta,
	},
	appointment_requested_reception: {
		subject: m.appointment_requested_reception_subject,
		body: m.appointment_requested_reception_body,
		cta: m.appointment_requested_reception_cta,
	},
	assistant_action_done_actor: {
		subject: m.assistant_action_done_actor_subject,
		body: m.assistant_action_done_actor_body,
		cta: m.assistant_action_done_actor_cta,
	},
	blacklist_attempt_reception: {
		subject: m.blacklist_attempt_reception_subject,
		body: m.blacklist_attempt_reception_body,
		cta: m.blacklist_attempt_reception_cta,
	},
	client_assigned_practitioner: {
		subject: m.client_assigned_practitioner_subject,
		body: m.client_assigned_practitioner_body,
		cta: m.client_assigned_practitioner_cta,
	},
	digest_practitioner_evening_practitioner: {
		subject: m.digest_practitioner_evening_practitioner_subject,
		body: m.digest_practitioner_evening_practitioner_body,
		cta: m.digest_practitioner_evening_practitioner_cta,
	},
	digest_reception_daily_reception: {
		subject: m.digest_reception_daily_reception_subject,
		body: m.digest_reception_daily_reception_body,
		cta: m.digest_reception_daily_reception_cta,
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
	package_running_low_reception: {
		subject: m.package_running_low_reception_subject,
		body: m.package_running_low_reception_body,
		cta: m.package_running_low_reception_cta,
	},
	record_todo_practitioner: {
		subject: m.record_todo_practitioner_subject,
		body: m.record_todo_practitioner_body,
		cta: m.record_todo_practitioner_cta,
	},
	reminder_confirmed_reception: {
		subject: m.reminder_confirmed_reception_subject,
		body: m.reminder_confirmed_reception_body,
		cta: m.reminder_confirmed_reception_cta,
	},
	reminder_declined_reception: {
		subject: m.reminder_declined_reception_subject,
		body: m.reminder_declined_reception_body,
		cta: m.reminder_declined_reception_cta,
	},
	reminder_failed_reception: {
		subject: m.reminder_failed_reception_subject,
		body: m.reminder_failed_reception_body,
		cta: m.reminder_failed_reception_cta,
	},
	request_new_team: {
		subject: m.request_new_team_subject,
		body: m.request_new_team_body,
		cta: m.request_new_team_cta,
	},
	schedule_changed_practitioner: {
		subject: m.schedule_changed_practitioner_subject,
		body: m.schedule_changed_practitioner_body,
		cta: m.schedule_changed_practitioner_cta,
	},
} as const;
