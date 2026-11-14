import * as m from "../paraglide/messages.js";

/** The messages the owner and the administrators read. */
export const OWNER_WORDS = {
	delivery_failed_owners: {
		subject: m.delivery_failed_owners_subject,
		body: m.delivery_failed_owners_body,
		cta: m.delivery_failed_owners_cta,
	},
	digest_owner_daily_owners: {
		subject: m.digest_owner_daily_owners_subject,
		body: m.digest_owner_daily_owners_body,
		cta: m.digest_owner_daily_owners_cta,
	},
	digest_owner_weekly_owners: {
		subject: m.digest_owner_weekly_owners_subject,
		body: m.digest_owner_weekly_owners_body,
		cta: m.digest_owner_weekly_owners_cta,
	},
	feedback_negative_owners: {
		subject: m.feedback_negative_owners_subject,
		body: m.feedback_negative_owners_body,
		cta: m.feedback_negative_owners_cta,
	},
	leave_requested_owners: {
		subject: m.leave_requested_owners_subject,
		body: m.leave_requested_owners_body,
		cta: m.leave_requested_owners_cta,
	},
	security_action_owners: {
		subject: m.security_action_owners_subject,
		body: m.security_action_owners_body,
		cta: m.security_action_owners_cta,
	},
} as const;
