import type { Scenario } from "./scenario-types";

const WHEN = { date: "2026-11-20", time: "13:00", resources: ["Ana Pop", "Cabinet Terapie"] };

/**
 * The owner's transcript: free times, a pick, then a failure because the client did not exist and
 * no service was chosen. A booking collects what it needs first, and ends in ONE confirmation card.
 */
export const BOOKING_SCENARIOS: ReadonlyArray<Scenario> = [
	{
		id: "book-missing-client-and-service-asks-once",
		by: "reception",
		lang: "ro",
		user: "Programează-l pe Iacob Silivu vineri 20 noiembrie la 13:00 cu Ana Pop în Cabinet Terapie",
		script: [
			{ tool: "findClient", input: { query: "Iacob Silivu" } },
			{ tool: "createAppointment", input: { newClient: { name: "Iacob Silivu" }, ...WHEN } },
		],
		mustCall: ["findClient"],
		mustNotCall: ["freeSlots", "createClient"],
		expect: { proposals: 0, cards: ["choices"], say: [/serviciu/i] },
	},
	{
		id: "book-missing-client-and-service-one-card",
		by: "reception",
		lang: "ro",
		user: "Programează-l pe Iacob Silivu, evaluare, vineri 20 noiembrie la 13:00 cu Ana Pop în Cabinet Terapie",
		script: [
			{ tool: "findClient", input: { query: "Iacob Silivu" } },
			{
				tool: "createAppointment",
				input: { newClient: { name: "Iacob Silivu" }, service: "Evaluare", ...WHEN },
			},
		],
		mustCall: ["findClient", "createAppointment"],
		mustNotCall: ["createClient"],
		expect: {
			proposals: 1,
			cards: ["proposal"],
			say: [/card|confirm/i],
			after: (p) => {
				const made = p.data.clients.find((c) => c.name === "Iacob Silivu");
				return (
					made !== undefined &&
					p.data.appointments.some(
						(a) => a.clientId === made.id && a.date === "2026-11-20" && a.startMin === 780,
					)
				);
			},
		},
	},
	{
		id: "book-missing-client-clinic-has-one-service",
		by: "reception",
		lang: "ro",
		user: "Programează-l pe Iacob Silivu vineri 20 noiembrie la 13:00 cu Ana Pop în Cabinet Terapie",
		setup: (p) => {
			p.data.services = [{ id: "s1", name: "Evaluare", durationMin: 50, priceBani: 15_000 }];
		},
		script: [
			{ tool: "findClient", input: { query: "Iacob Silivu" } },
			{ tool: "createAppointment", input: { newClient: { name: "Iacob Silivu" }, ...WHEN } },
		],
		mustCall: ["findClient", "createAppointment"],
		mustNotCall: ["createClient"],
		expect: {
			proposals: 1,
			cards: ["proposal"],
			after: (p) =>
				p.data.clients.some((c) => c.name === "Iacob Silivu") &&
				p.data.appointments.some((a) => a.date === "2026-11-20" && a.serviceId === "s1"),
		},
	},
	{
		id: "free-times-without-service-asks-first",
		by: "reception",
		lang: "ro",
		user: "Ce ore libere are Ana Pop vineri 20 noiembrie?",
		script: [{ tool: "freeSlots", input: { resource: "Ana Pop", from: "2026-11-20", days: 1 } }],
		mustCall: ["freeSlots"],
		expect: { proposals: 0, cards: ["choices"], say: [/serviciu/i] },
	},
];
