import { z } from "zod";
import type { EventId } from "../apps";

/**
 * What each event carries. The schema IS the allow-list: a key not named here is dropped before anything is queued, and
 * nothing in it is clinical (no diagnosis, note, report, file or questionnaire; a service name is a booking label, a
 * guardian's e-mail is never a field). A new field needs a reason to be here and an entry in `payloads.test.ts`.
 */
const Id = z.string().min(1).max(120);
const Text = z.string().min(1).max(200);
const Instant = z.string().datetime({ offset: true });
const Url = z.string().url().max(2048);
const Day = z.string().date();
const Count = z.number().int().min(0).max(1_000_000);

const Appointment = z.object({
	appointmentId: Id,
	/** The client's display name; only team-facing and own-client messages print it. */
	clientName: Text,
	serviceName: Text,
	startsAt: Instant,
	practitionerName: Text.optional(),
});

const Calendar = z.object({
	/** A signed link to the .ics of this appointment (see reminders/links). */
	icsUrl: Url.optional(),
	/** The client's own page for this appointment. */
	manageUrl: Url.optional(),
});

/** Who made the change a team member is told about: a name, and from where. */
const Who = z.object({
	changedBy: Text.optional(),
	source: z.enum(["client", "staff", "assistant", "system"]).optional(),
});

/** One line of a day's list: a time and a short text (`Ana P. · Terapie ABA`). */
const Line = z.object({ at: Instant, text: Text });
const Digest = z.object({
	/** `<kind>:<local date>`: one digest per kind and day. */
	digestId: Id,
	date: Day,
	total: Count,
	lines: z.array(Line).max(60),
});
const OwnerDigest = z.object({
	digestId: Id,
	from: Day,
	to: Day,
	appointments: Count,
	attended: Count,
	cancelled: Count,
	noShows: Count,
	occupancyPercent: z.number().int().min(0).max(100),
	/** Money, already formatted; present only for people whose role may read revenue. */
	revenue: z.string().min(1).max(40).optional(),
});

export const PAYLOADS = {
	"request.new": z.object({
		requestId: Id,
		name: Text,
		kind: z.enum(["web", "callback", "contact", "assistant"]),
	}),
	"appointment.requested": Appointment.merge(Calendar).merge(Who),
	"appointment.confirmed": Appointment.merge(Calendar).merge(Who),
	"appointment.moved": Appointment.merge(Calendar).merge(Who).extend({ previousStartsAt: Instant }),
	"appointment.cancelled": Appointment.merge(Calendar).merge(Who),
	"reminder.day_before": Appointment.merge(Calendar).extend({ confirmUrl: Url, cancelUrl: Url }),
	"reminder.two_hours": Appointment.merge(Calendar),
	"reminder.confirmed": Appointment,
	"reminder.declined": Appointment,
	"reminder.failed": Appointment.extend({ reason: z.enum(["no_contact", "gave_up"]) }),
	"package.running_low": z.object({
		packageId: Id,
		clientId: Id,
		clientName: Text,
		remaining: z.number().int().min(0).max(1000),
	}),
	"leave.requested": z.object({
		leaveId: Id,
		personName: Text,
		from: Day,
		to: Day,
	}),
	"leave.approved": z.object({ leaveId: Id, from: Day, to: Day }),
	"leave.declined": z.object({ leaveId: Id, from: Day, to: Day }),
	"payment.recorded": z.object({
		paymentId: Id,
		serviceName: Text,
		/** Already formatted money, e.g. "250 RON": the service owns currency rules. */
		amount: z.string().min(1).max(40),
		receiptUrl: Url.optional(),
	}),
	"assistant.action_done": z.object({
		actionId: Id,
		/** One sentence the assistant wrote for its actor. */
		summary: z.string().min(1).max(400),
		openPath: z
			.string()
			.regex(/^\/(?!\/)[^\\\s]*$/)
			.max(512)
			.optional(),
	}),
	"feedback.requested": Appointment.extend({ feedbackUrl: Url }),
	"account.invite": z.object({
		clientId: Id,
		/** Who the e-mail greets: the client, or the guardian it was sent to. */
		clientName: Text,
		/** The child's name, when the invitation went to a guardian. */
		forClient: Text.optional(),
		inviteUrl: Url,
		expiresAt: Instant,
	}),
	"account.invite_existing": z.object({
		clientId: Id,
		clientName: Text,
		forClient: Text.optional(),
		signInUrl: Url,
		expiresAt: Instant,
	}),
	"account.activated": z.object({ clientId: Id, clientName: Text, accountUrl: Url }),
	"blacklist.attempt": z.object({
		entryId: Id,
		severity: z.enum(["warn", "block_online", "block_all"]),
		channel: z.enum(["web", "callback", "assistant"]),
	}),
	"appointment.conflict": Appointment.extend({
		conflictId: Id,
		/** The other session, when the conflict is two sessions at once; absent for a day the therapist does not work. */
		otherAppointmentId: Id.optional(),
		what: z.enum(["practitioner", "room", "device", "roster"]),
	}),
	"digest.reception_daily": Digest,
	"digest.practitioner_evening": Digest,
	"digest.owner_daily": OwnerDigest,
	"digest.owner_weekly": OwnerDigest,
	"schedule.changed": z.object({
		changeId: Id,
		date: Day,
		what: z.enum(["day_off", "hours", "leave", "block"]),
		changedBy: Text.optional(),
	}),
	"record.todo": Appointment,
	"client.assigned": z.object({ clientId: Id, clientName: Text, changedBy: Text.optional() }),
	"feedback.negative": z.object({ feedbackId: Id, rating: z.number().int().min(1).max(5) }),
	"delivery.failed": z.object({
		deliveryId: Id,
		failedEvent: z.string().min(1).max(60),
		attempts: z.number().int().min(1).max(100),
	}),
	/** A new member of the team: their name and where to sign in. Never a password or a set-password link. */
	"team.invite": z.object({ inviteId: Id, name: Text }),
	"security.action": z.object({
		securityId: Id,
		action: z.enum(["delete", "roles", "members", "settings"]),
		by: Text,
		target: Text.optional(),
	}),
} as const satisfies Record<EventId, z.ZodTypeAny>;

export type PayloadOf<E extends EventId> = z.infer<(typeof PAYLOADS)[E]>;

/**
 * The fields that name WHICH object an event is about. A delivery's idempotency key hashes the first it finds: an event
 * whose payload has none would collapse every object into one (`payloads.test.ts` asserts each event has one).
 */
export const DOMAIN_FIELDS = [
	"requestId",
	"appointmentId",
	"packageId",
	"leaveId",
	"paymentId",
	"actionId",
	"conflictId",
	"digestId",
	"changeId",
	"feedbackId",
	"deliveryId",
	"securityId",
	"inviteId",
	"entryId",
	"clientId",
] as const;
