import type { NotifyEvent, NotifyPort } from "./notify";
import {
	accountActivated,
	accountInvite,
	deliveryFailed,
	feedbackNegative,
	feedbackRequested,
	packageLow,
	paymentRecorded,
	securityAction,
} from "./novu-account";
import {
	appointmentChanged,
	appointmentConflict,
	blacklistAttempt,
	reminderFailed,
	reminderToClient,
	requestCreated,
} from "./novu-appointments";
import { createNotifyEnv, isAppKey, type NovuNotifyOptions, type Translate } from "./novu-env";
import {
	clientAssigned,
	leaveDecided,
	leaveRequested,
	ownerDigest,
	practitionerEvening,
	receptionDaily,
	recordTodo,
	scheduleChanged,
} from "./novu-staff";

export { type NovuNotifyOptions, notifyApps } from "./novu-env";

const none: Translate = () => Promise.resolve();

/** One translator per event of the port: a missing one is a compile error, so no event can be emitted and silently dropped. */
const TRANSLATORS: Readonly<Record<NotifyEvent, Translate>> = {
	"request.created": requestCreated,
	"appointment.requested": appointmentChanged,
	"appointment.confirmed": appointmentChanged,
	"appointment.moved": appointmentChanged,
	"appointment.cancelled": appointmentChanged,
	// The catalogue has no message for it: the calendar shows it.
	"attendance.no_show": none,
	"payment.recorded": paymentRecorded,
	"leave.requested": leaveRequested,
	"leave.decided": leaveDecided,
	"package.low": packageLow,
	"reminder.day_before": reminderToClient,
	"reminder.two_hours": reminderToClient,
	"reminder.failed": reminderFailed,
	"feedback.requested": feedbackRequested,
	"feedback.negative": feedbackNegative,
	"account.invite": accountInvite,
	"account.invite_existing": accountInvite,
	"account.activated": accountActivated,
	"blacklist.attempt": blacklistAttempt,
	"appointment.conflict": appointmentConflict,
	"digest.reception_daily": receptionDaily,
	"digest.practitioner_evening": practitionerEvening,
	"digest.owner_daily": ownerDigest,
	"digest.owner_weekly": ownerDigest,
	"schedule.changed": scheduleChanged,
	"record.todo": recordTodo,
	"client.assigned": clientAssigned,
	"delivery.failed": deliveryFailed,
	"security.action": securityAction,
};

/**
 * The NotifyPort on `@psi/notify`: a handler says WHAT happened by reference (an appointment id, a package id, a
 * leave id); this resolves who is told and what the message prints (names, times, links) from the store, shapes the
 * catalogue's typed payload, and queues it with the action's own key as the occurrence. It queues and returns: a
 * failure here is the caller's to log, never to surface. Each family of events has its translator
 * (`novu-appointments`, `novu-account`, `novu-staff`).
 */
export function createNovuNotify(options: NovuNotifyOptions): NotifyPort {
	const env = createNotifyEnv(options);
	const { notifier } = options;
	return {
		async notify(n) {
			if (!isAppKey(n.app)) {
				options.log({
					level: "warn",
					event: "notify_unknown_app",
					requestId: n.idempotencyKey,
					app: n.app,
				});
				return;
			}
			await TRANSLATORS[n.event](n, n.app, env);
		},
		async syncPerson(app, person) {
			if (!isAppKey(app)) return;
			await notifier.upsertSubscriber(app, {
				audience: "practitioner",
				subject: person.subject,
				locale: "ro",
				...(person.name === undefined ? {} : { name: person.name }),
				...(person.email === undefined ? {} : { email: person.email }),
			});
		},
	};
}
