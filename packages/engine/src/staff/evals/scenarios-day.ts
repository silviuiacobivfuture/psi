import { andrei, FRI, twoAndrei } from "./scenario-fixtures";
import type { Scenario } from "./scenario-types";

export const DAY_SCENARIOS: ReadonlyArray<Scenario> = [
	// ---- reading the day
	{
		id: "agenda-today",
		by: "reception",
		lang: "ro",
		user: "ce programări avem azi?",
		script: [{ tool: "agenda", input: {} }],
		mustCall: ["agenda"],
		expect: { proposals: 0, cards: ["agenda"] },
	},
	{
		id: "agenda-tomorrow",
		by: "reception",
		lang: "ro",
		user: "arată-mi agenda de mâine",
		script: [
			{ tool: "resolveDate", input: { phrase: "mâine" } },
			{ tool: "agenda", input: { from: "2026-11-14" } },
		],
		mustCall: ["resolveDate", "agenda"],
		expect: { proposals: 0, cards: ["agenda"] },
	},
	{
		id: "agenda-person",
		by: "reception",
		lang: "ro",
		user: "ce are Dan azi?",
		script: [{ tool: "agenda", input: { resource: "Dan" } }],
		mustCall: ["agenda"],
		expect: { proposals: 0, cards: ["agenda"] },
	},
	{
		id: "agenda-room",
		by: "reception",
		lang: "ro",
		user: "cine e în cabinetul de terapie azi",
		script: [{ tool: "agenda", input: { resource: "Cabinet Terapie" } }],
		mustCall: [["agenda", "roomsAt"]],
		expect: { proposals: 0 },
	},
	{
		id: "agenda-en",
		by: "therapist",
		lang: "en",
		user: "what is on today?",
		script: [{ tool: "agenda", input: {} }],
		mustCall: ["agenda"],
		expect: { proposals: 0, cards: ["agenda"] },
	},
	{
		id: "agenda-week-ahead",
		by: "owner",
		lang: "ro",
		user: "ce programări sunt poimâine și în ziua următoare",
		script: [
			{ tool: "resolveDate", input: { phrase: "poimâine" } },
			{ tool: "agenda", input: { from: "2026-11-15", days: 2 } },
		],
		mustCall: ["resolveDate", "agenda"],
		expect: { proposals: 0, cards: ["agenda"] },
	},
	// ---- clients
	{
		id: "find-client",
		by: "reception",
		lang: "ro",
		user: "găsește-o pe Maria",
		script: [{ tool: "findClient", input: { query: "maria" } }],
		mustCall: ["findClient"],
		expect: { proposals: 0, cards: ["list"] },
	},
	{
		id: "summary-on-page",
		by: "therapist",
		lang: "ro",
		user: "rezumă fișa clientului ăsta",
		page: { screen: "client", clientId: "c1" },
		script: [{ tool: "clientSummary", input: {} }],
		mustCall: ["clientSummary"],
		mustNotCall: ["findClient"],
		expect: { proposals: 0, cards: ["client"] },
	},
	{
		id: "balance-on-page",
		by: "reception",
		lang: "ro",
		user: "cât mai are de plată?",
		page: { screen: "client", clientId: "c1" },
		script: [{ tool: "packageBalance", input: {} }],
		mustCall: ["packageBalance"],
		mustNotCall: ["findClient"],
		expect: { proposals: 0 },
	},
	{
		id: "balance-by-name",
		by: "reception",
		lang: "ro",
		user: "cât mai are Maria din abonament?",
		script: [
			{ tool: "findClient", input: { query: "maria" } },
			{ tool: "packageBalance", input: { clientId: "c1" } },
		],
		mustCall: ["findClient", "packageBalance"],
		expect: { proposals: 0 },
	},
	{
		id: "notes-search",
		by: "therapist",
		lang: "ro",
		user: "ce notițe am despre somn?",
		script: [{ tool: "searchNotes", input: { text: "sleeps" } }],
		mustCall: ["searchNotes"],
		expect: { proposals: 0, cards: ["list"] },
	},
	{
		id: "two-andrei",
		by: "reception",
		lang: "ro",
		user: "mută-l pe Andrei de joi la vineri",
		setup: twoAndrei,
		script: [{ tool: "findClient", input: { query: "andrei" } }],
		mustCall: ["findClient"],
		mustNotCall: ["moveAppointment"],
		expect: { proposals: 0, cards: ["choices"] },
	},
	// ---- scheduling
	{
		id: "free-slots-next-week",
		by: "reception",
		lang: "ro",
		user: "ore libere pentru evaluare săptămâna viitoare",
		script: [
			{ tool: "resolveDate", input: { phrase: "săptămâna viitoare" } },
			{
				tool: "freeSlots",
				input: { service: "Evaluare", from: "2026-11-16", days: 7 },
			},
		],
		mustCall: ["resolveDate", "freeSlots"],
		expect: { proposals: 0, cards: ["slots"] },
	},
	{
		id: "free-slots-person",
		by: "reception",
		lang: "ro",
		user: "când are Dan loc liber luni pentru neurofeedback?",
		script: [
			{ tool: "resolveDate", input: { phrase: "luni" } },
			{
				tool: "freeSlots",
				input: {
					service: "Neurofeedback",
					resource: "Dan",
					from: "2026-11-16",
					days: 1,
				},
			},
		],
		mustCall: ["resolveDate", "freeSlots"],
		expect: { proposals: 0, cards: ["slots"] },
	},
	{
		id: "move-andrei-thu-to-fri",
		by: "reception",
		lang: "ro",
		user: "mută-l pe Andrei de joi la vineri, aceeași oră, cu același terapeut",
		setup: andrei,
		script: [
			{ tool: "findClient", input: { query: "andrei" } },
			{ tool: "clientSummary", input: { clientId: "c4" } },
			{ tool: "resolveDate", input: { phrase: "vineri viitoare" } },
			{
				tool: "moveAppointment",
				input: { appointmentId: "a4", date: FRI, time: "14:00" },
			},
		],
		mustCall: ["findClient", "moveAppointment"],
		expect: {
			proposals: 1,
			cards: ["proposal"],
			after: (p) =>
				p.appointmentOf("a4").date === FRI &&
				p.appointmentOf("a4").startMin === 840 &&
				p.appointmentOf("a4").resourceIds.join() === "p2,d1",
		},
	},
	{
		id: "move-on-page",
		by: "reception",
		lang: "ro",
		user: "mută ședința asta mâine la 11",
		page: { screen: "appointment", appointmentId: "a1" },
		script: [
			{ tool: "resolveDate", input: { phrase: "mâine" } },
			{ tool: "moveAppointment", input: { date: "2026-11-14", time: "11:00" } },
		],
		mustCall: ["resolveDate", "moveAppointment"],
		mustNotCall: ["findClient"],
		expect: {
			proposals: 1,
			after: (p) =>
				p.appointmentOf("a1").date === "2026-11-14" && p.appointmentOf("a1").startMin === 660,
		},
	},
	{
		id: "move-into-conflict",
		by: "reception",
		lang: "ro",
		user: "mută ședința asta azi la 11 cu Dan",
		page: { screen: "appointment", appointmentId: "a1" },
		script: [
			{
				tool: "moveAppointment",
				input: {
					date: "2026-11-13",
					time: "11:00",
					resources: ["Dan Ionescu"],
				},
			},
		],
		mustCall: ["moveAppointment"],
		expect: { proposals: 0, refused: [] },
	},
	{
		id: "move-en",
		by: "reception",
		lang: "en",
		user: "move Maria's Saturday session to Monday at 11",
		script: [
			{ tool: "findClient", input: { query: "maria" } },
			{ tool: "clientSummary", input: { clientId: "c1" } },
			{
				tool: "moveAppointment",
				input: { appointmentId: "a3", date: "2026-11-16", time: "11:00" },
			},
		],
		mustCall: ["findClient", "moveAppointment"],
		expect: {
			proposals: 1,
			after: (p) => p.appointmentOf("a3").date === "2026-11-16",
		},
	},
	{
		id: "create-ion-monday",
		by: "reception",
		lang: "ro",
		user: "programează-l pe Ion luni la 10 la evaluare cu Ana în Cabinet Terapie",
		script: [
			{ tool: "findClient", input: { query: "ion" } },
			{ tool: "resolveDate", input: { phrase: "luni" } },
			{
				tool: "createAppointment",
				input: {
					clientId: "c2",
					service: "Evaluare",
					date: "2026-11-16",
					time: "10:00",
					resources: ["Ana Pop", "Cabinet Terapie"],
				},
			},
		],
		mustCall: ["findClient", "createAppointment"],
		expect: {
			proposals: 1,
			after: (p) =>
				p.data.appointments.some(
					(a) => a.clientId === "c2" && a.date === "2026-11-16" && a.startMin === 600,
				),
		},
	},
	{
		id: "create-busy",
		by: "reception",
		lang: "ro",
		user: "programează-l pe Ion azi la 10 cu Ana",
		script: [
			{
				tool: "createAppointment",
				input: {
					clientId: "c2",
					service: "Evaluare",
					date: "2026-11-13",
					time: "10:00",
					resources: ["Ana Pop"],
				},
			},
		],
		mustCall: ["createAppointment"],
		expect: { proposals: 0 },
	},
	{
		id: "cancel-on-page",
		by: "reception",
		lang: "ro",
		user: "anulează programarea asta",
		page: { screen: "appointment", appointmentId: "a1" },
		script: [{ tool: "cancelAppointment", input: {} }],
		mustCall: ["cancelAppointment"],
		expect: {
			proposals: 1,
			cards: ["proposal"],
			after: (p) => p.appointmentOf("a1").status === "cancelled",
		},
	},
	{
		id: "attendance-came",
		by: "reception",
		lang: "ro",
		user: "Maria a venit la 10",
		script: [
			{ tool: "agenda", input: {} },
			{
				tool: "markAttendance",
				input: { appointmentId: "a1", status: "attended" },
			},
		],
		mustCall: ["agenda", "markAttendance"],
		expect: {
			proposals: 1,
			after: (p) => p.appointmentOf("a1").status === "attended",
		},
	},
	{
		id: "attendance-noshow",
		by: "therapist",
		lang: "ro",
		user: "Ion nu a venit",
		script: [
			{ tool: "agenda", input: {} },
			{
				tool: "markAttendance",
				input: { appointmentId: "a2", status: "no-show" },
			},
		],
		mustCall: ["agenda", "markAttendance"],
		expect: {
			proposals: 1,
			after: (p) => p.appointmentOf("a2").status === "no-show",
		},
	},
];
