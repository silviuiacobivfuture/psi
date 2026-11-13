import type { EventId } from "../apps";

const appointment = {
	appointmentId: "apt_1",
	clientName: "Ana Popescu",
	serviceName: "Terapie ABA",
	startsAt: "2026-12-01T08:00:00.000Z",
	practitionerName: "Dr. Ionescu",
};

/** One valid payload per event (synthetic people only). */
export const SAMPLES: Readonly<Record<EventId, Record<string, unknown>>> = {
	"request.new": { requestId: "req_1", name: "Maria Test", kind: "callback" },
	"appointment.requested": {
		...appointment,
		icsUrl: "https://clinic.example/ics/t1",
		manageUrl: "https://psizone.example/cont",
	},
	"appointment.confirmed": { ...appointment, icsUrl: "https://clinic.example/ics/t1" },
	"appointment.moved": { ...appointment, previousStartsAt: "2026-11-30T08:00:00.000Z" },
	"appointment.cancelled": { ...appointment },
	"reminder.day_before": {
		...appointment,
		confirmUrl: "https://clinic.example/v1/public/reminders/c1/confirm",
		cancelUrl: "https://clinic.example/v1/public/reminders/c2/cancel",
	},
	"reminder.confirmed": { ...appointment },
	"reminder.declined": { ...appointment },
	"package.running_low": {
		packageId: "pkg_1",
		clientId: "cli_1",
		clientName: "Ana Popescu",
		remaining: 2,
	},
	"leave.requested": {
		leaveId: "lv_1",
		personName: "Dr. Ionescu",
		from: "2026-12-20",
		to: "2026-12-27",
	},
	"leave.approved": { leaveId: "lv_1", from: "2026-12-20", to: "2026-12-27" },
	"leave.declined": { leaveId: "lv_1", from: "2026-12-20", to: "2026-12-27" },
	"payment.recorded": { paymentId: "pay_1", serviceName: "Terapie ABA", amount: "250 RON" },
	"assistant.action_done": {
		actionId: "act_1",
		summary: "Am mutat 3 programări.",
		openPath: "/calendar",
	},
};
