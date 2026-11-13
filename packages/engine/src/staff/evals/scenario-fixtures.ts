import type { Step } from "../proposals";
import type { FakeStaffPort } from "../testing";

export const THU = "2026-11-19";
export const FRI = "2026-11-20";

export function andrei(port: FakeStaffPort): void {
	port.data.clients.push({
		id: "c4",
		version: "cv1",
		name: "Andrei Popescu",
		status: "current",
		phone: "0712 000 004",
		upcoming: [],
		recent: [],
	});
	port.data.appointments.push({
		id: "a4",
		version: "v1",
		date: THU,
		startMin: 840,
		durationMin: 50,
		resourceIds: ["p2", "d1"],
		clientId: "c4",
		clientName: "Andrei Popescu",
		title: null,
		serviceId: "s2",
		status: "confirmed",
	});
}

export function twoAndrei(port: FakeStaffPort): void {
	andrei(port);
	port.data.clients.push({
		id: "c5",
		version: "cv1",
		name: "Andrei Marin",
		status: "current",
		phone: "0712 000 005",
		upcoming: [],
		recent: [],
	});
}

export function danWorksTomorrow(port: FakeStaffPort): void {
	port.data.roster.push({
		personId: "p2",
		date: "2026-11-14",
		kind: "work",
		fromMin: 540,
		toMin: 1020,
	});
}

export const hasStep = (kind: Step["kind"], port: FakeStaffPort): boolean =>
	port.calls.some((c) => c.method === kindToMethod(kind));
function kindToMethod(kind: Step["kind"]): string {
	return {
		create_appointment: "createAppointment",
		move_appointment: "moveAppointment",
		cancel_appointment: "cancelAppointment",
		mark_attendance: "markAttendance",
		record_payment: "recordPayment",
		request_leave: "requestLeave",
		handle_request: "markRequestHandled",
		send_reminders: "sendReminder",
		route_call: "callRoute",
		create_client: "createClient",
		run_action: "runAction",
	}[kind];
}
