import type { Scenario } from "./scenario-types";

const CLIENT_PAGE = { screen: "client", clientId: "c1" } as const;

/**
 * The owner's transcript and the action registry: a person who is not a client yet, notes,
 * blacklisting, what cannot be done through chat, discovering what is possible, copying a week.
 */
export const ACTION_SCENARIOS: ReadonlyArray<Scenario> = [
	{
		id: "create-client-and-book",
		by: "reception",
		lang: "ro",
		user: "Creează clientul Iulian Iacob, telefon 0722 111 222, și programează-l luni la 15:30 la Evaluare, cu Ana Pop în Cabinet Terapie",
		script: [
			{
				tool: "createAppointment",
				input: {
					newClient: { name: "Iulian Iacob", phone: "0722 111 222" },
					service: "Evaluare",
					date: "2026-11-16",
					time: "15:30",
					resources: ["Ana Pop", "Cabinet Terapie"],
				},
			},
		],
		mustCall: ["createAppointment"],
		mustNotCall: ["createClient"],
		expect: {
			proposals: 1,
			cards: ["proposal"],
			after: (p) => {
				const made = p.data.clients.find((c) => c.name === "Iulian Iacob");
				return (
					made !== undefined &&
					made.phone === "0722 111 222" &&
					p.data.appointments.some(
						(a) => a.clientId === made.id && a.date === "2026-11-16" && a.startMin === 930,
					)
				);
			},
			say: [/card|confirm/i],
		},
	},
	{
		id: "create-client-only",
		by: "reception",
		lang: "ro",
		user: "Adaugă un client nou: Elena Dima, 8 ani, părintele Ioana Dima, e-mail ioana@example.test",
		script: [
			{ tool: "findClient", input: { query: "Elena Dima" } },
			{
				tool: "createClient",
				input: {
					name: "Elena Dima",
					age: 8,
					guardian: "Ioana Dima",
					email: "ioana@example.test",
				},
			},
		],
		mustCall: ["createClient"],
		expect: {
			proposals: 1,
			cards: ["proposal"],
			after: (p) =>
				p.data.clients.some(
					(c) =>
						c.name === "Elena Dima" &&
						c.email === "ioana@example.test" &&
						c.guardian === "Ioana Dima",
				),
		},
	},
	{
		id: "add-note",
		by: "owner",
		lang: "ro",
		user: "Adaugă o notiță la fișa lui: a venit mai relaxată și doarme mai bine",
		page: CLIENT_PAGE,
		script: [
			{ tool: "listActions", input: { about: "notiță" } },
			{
				tool: "runAction",
				input: {
					actionId: "clients.addNote",
					params: { clientId: "c1", text: "A venit mai relaxată și doarme mai bine." },
				},
			},
		],
		mustCall: ["listActions", "runAction"],
		expect: {
			proposals: 1,
			cards: ["proposal"],
			after: (p) =>
				p.data.ran.some((r) => r.id === "clients.addNote" && r.params.clientId === "c1"),
		},
	},
	{
		id: "blacklist-with-reason",
		by: "owner",
		lang: "ro",
		user: "Pune-l pe Ion Exemplu pe lista neagră: nu a venit de trei ori fără să anunțe",
		script: [
			{ tool: "findClient", input: { query: "Ion Exemplu" } },
			{ tool: "listActions", input: { about: "listă neagră" } },
			{
				tool: "runAction",
				input: {
					actionId: "clients.blacklist",
					params: { clientId: "c2", reason: "Nu a venit de trei ori fără să anunțe." },
				},
			},
		],
		mustCall: ["findClient", "listActions", "runAction"],
		expect: {
			proposals: 1,
			cards: ["proposal"],
			after: (p) =>
				p.data.ran.some(
					(r) =>
						r.id === "clients.blacklist" && r.params.clientId === "c2" && r.params.reason !== "",
				),
		},
	},
	{
		id: "upload-file-guidance",
		by: "owner",
		lang: "ro",
		user: "Vreau să încarc raportul în PDF la fișa lui Maria",
		page: CLIENT_PAGE,
		script: [{ tool: "listActions", input: { about: "fișier" } }],
		mustCall: ["listActions"],
		mustNotCall: ["runAction"],
		expect: { proposals: 0, say: [/fișier|fila|pagina|fișa/i] },
	},
	{
		id: "list-actions-client-page",
		by: "owner",
		lang: "ro",
		user: "Ce pot face pe pagina acestui client?",
		page: CLIENT_PAGE,
		script: [{ tool: "listActions", input: {} }],
		mustCall: ["listActions"],
		expect: { proposals: 0, say: [/notiț|listă neagră|fișier/i] },
	},
	{
		id: "copy-week-two-ahead",
		by: "reception",
		lang: "ro",
		user: "copiază programul de săptămâna asta și peste două săptămâni",
		script: [
			{ tool: "resolveDate", input: { phrase: "săptămâna asta" } },
			{ tool: "resolveDate", input: { phrase: "peste două săptămâni" } },
			{ tool: "copyWeek", input: { fromDate: "2026-11-09", toDate: "2026-11-23" } },
		],
		mustCall: ["resolveDate", "copyWeek"],
		expect: {
			proposals: 1,
			after: (p) => p.data.appointments.some((a) => a.date === "2026-11-27" && a.clientId === "c1"),
		},
	},
];
