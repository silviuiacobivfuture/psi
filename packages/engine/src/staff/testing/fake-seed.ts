import type {
	ActivityEvent,
	Appointment,
	Booking,
	ClientSummary,
	NoteHit,
	PackageBalance,
	ReminderTarget,
	Resource,
	RosterEntry,
	Service,
	WebRequest,
} from "../model";

export interface FakeData {
	resources: Array<Resource>;
	services: Array<Service>;
	clients: Array<ClientSummary>;
	appointments: Array<Appointment>;
	packages: Array<PackageBalance>;
	roster: Array<RosterEntry>;
	requests: Array<WebRequest>;
	notes: Array<NoteHit>;
	reminders: Array<ReminderTarget>;
	leaves: Array<{ personId: string; from: string; to: string; kind: string }>;
	payments: Array<{ packageId: string; amountBani: number; method: string }>;
	sent: Array<{ appointmentId: string; channel: string; text: string }>;
	activity: Array<ActivityEvent>;
	bookings: Array<Booking>;
	/** Registry actions that ran, with what they were given. */
	ran: Array<{ id: string; params: Record<string, unknown> }>;
}

export function seed(): FakeData {
	const appt = (
		id: string,
		date: string,
		startMin: number,
		clientId: string,
		clientName: string,
		resourceIds: Array<string>,
		extra: Partial<Appointment> = {},
	): Appointment => ({
		id,
		version: "v1",
		date,
		startMin,
		durationMin: 50,
		resourceIds,
		clientId,
		clientName,
		title: null,
		serviceId: "s1",
		status: "confirmed",
		...extra,
	});
	const a1 = appt("a1", "2026-11-13", 600, "c1", "Maria Test", ["p1", "r1"]);
	const a2 = appt("a2", "2026-11-13", 660, "c2", "Ion Exemplu", ["p2", "d1"]);
	const a3 = appt("a3", "2026-11-14", 600, "c1", "Maria Test", ["p1", "r1"]);
	return {
		resources: [
			{ id: "p1", kind: "person", name: "Ana Pop" },
			{ id: "p2", kind: "person", name: "Dan Ionescu" },
			{
				id: "r1",
				kind: "room",
				name: "Cabinet Terapie",
				equipment: ["therapy"],
			},
			{ id: "r2", kind: "room", name: "Sala Grup", equipment: ["group"] },
			{ id: "d1", kind: "device", name: "NFB 1", equipment: ["nfb"] },
		],
		services: [
			{ id: "s1", name: "Evaluare", durationMin: 50, priceBani: 15_000 },
			{ id: "s2", name: "Neurofeedback", durationMin: 45, priceBani: 12_000 },
		],
		clients: [
			{
				id: "c1",
				version: "cv1",
				name: "Maria Test",
				status: "current",
				phone: "0712 000 001",
				email: "maria@example.test",
				guardian: "Elena Test",
				practitionerId: "p1",
				note: "Prefers mornings.",
				clinical: {
					diagnosis: "Synthetic diagnosis",
					lastReportDate: "2026-11-02",
				},
				upcoming: [a1, a3],
				recent: [],
			},
			{
				id: "c2",
				version: "cv1",
				name: "Ion Exemplu",
				status: "current",
				phone: "0712 000 002",
				email: null,
				upcoming: [a2],
				recent: [],
			},
			{
				id: "c3",
				version: "cv1",
				name: "Maria Arhivata",
				status: "archived",
				phone: null,
				upcoming: [],
				recent: [],
			},
		],
		appointments: [a1, a2, a3],
		packages: [
			{
				id: "k1",
				clientId: "c1",
				version: "kv1",
				name: "10 sessions",
				sessions: 10,
				bonus: 1,
				used: 4,
				totalBani: 100_000,
				paidBani: 40_000,
			},
		],
		roster: [
			{
				personId: "p1",
				date: "2026-11-13",
				kind: "work",
				fromMin: 540,
				toMin: 1020,
			},
			{
				personId: "p2",
				date: "2026-11-13",
				kind: "leave",
				fromMin: null,
				toMin: null,
			},
		],
		requests: [
			{
				id: "w1",
				version: "wv1",
				receivedAt: "2026-11-12T10:00:00Z",
				name: "Visitor One",
				phone: "0712 000 003",
				service: "Evaluare",
				message: "Hello, I would like an appointment.",
				channel: "form",
				handled: false,
			},
		],
		notes: [
			{
				id: "n1",
				clientId: "c1",
				date: "2026-11-02",
				text: "Session went well; sleeps better.",
			},
		],
		reminders: [
			{
				appointmentId: "a3",
				version: "v1",
				clientName: "Maria Test",
				phone: "0712 000 001",
				email: "maria@example.test",
				date: "2026-11-14",
				startMin: 600,
				resourceName: "Cabinet Terapie",
				sent: false,
			},
		],
		leaves: [],
		payments: [],
		sent: [],
		activity: [
			{
				at: "2026-11-13T07:10:00Z",
				kind: "appointment",
				verb: "create",
				actor: "Ana Pop",
				label: "Maria Test",
				subjectId: "a1",
			},
			{
				at: "2026-11-13T07:20:00Z",
				kind: "appointment",
				verb: "move",
				actor: "Ana Pop",
				label: "Ion Exemplu",
				subjectId: "a2",
			},
			{
				at: "2026-11-13T07:30:00Z",
				kind: "payment",
				verb: "pay",
				actor: "Dan Ionescu",
				label: "10 sessions",
				subjectId: "k1",
			},
			{
				at: "2026-11-12T09:00:00Z",
				kind: "client",
				verb: "create",
				actor: "Ana Pop",
				label: "Ion Exemplu",
				subjectId: "c2",
			},
		],
		ran: [],
		bookings: [
			{
				id: "a1",
				createdAt: "2026-11-13T07:10:00Z",
				date: "2026-11-13",
				startMin: 600,
				clientName: "Maria Test",
				serviceName: "Evaluare",
				source: "staff",
				status: "confirmed",
			},
			{
				id: "b2",
				createdAt: "2026-11-13T05:00:00Z",
				date: "2026-11-16",
				startMin: 540,
				clientName: "Visitor One",
				serviceName: "Evaluare",
				source: "form",
				status: "requested",
			},
			{
				id: "b3",
				createdAt: "2026-11-13T06:00:00Z",
				date: "2026-11-17",
				startMin: 600,
				clientName: "Visitor Chat",
				serviceName: "Neurofeedback",
				source: "chat",
				status: "requested",
			},
		],
	};
}
