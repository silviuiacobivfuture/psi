import { addDays, weekStart } from "../lib/dates";
import {
	ACTIONS,
	type Appointment,
	type AppSlug,
	type AuditEvent,
	appointmentDefaults,
	type Client,
	type Column,
	type Package,
	type Role,
	type RosterEntry,
	type Service,
	type WebRequest,
} from "./schema";
import { seedPackages } from "./seed-packages";

/** Everything here is synthetic: invented names, `0700 000 …` numbers, `example.test` e-mail. */
export interface AppData {
	columns: Column[];
	services: Service[];
	clients: Client[];
	appointments: Appointment[];
	packages: Package[];
	roster: RosterEntry[];
	requests: WebRequest[];
	audit: AuditEvent[];
	roles: Role[];
	sentReminders: Set<string>;
}

function lcg(seed: number): () => number {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) % 4294967296;
		return s / 4294967296;
	};
}

const NAMES = [
	"Ștefan",
	"Ioana",
	"Matei",
	"Ilinca",
	"Tudor",
	"Anca",
	"Vlad",
	"Sofia",
	"Radu",
	"Teodora",
	"Luca",
	"Maria",
];
const pad = (n: number): string => String(n).padStart(2, "0");

const person = (id: string, name: string, colour: number): Column => ({
	id,
	kind: "person",
	name,
	colour,
});

function columnsFor(app: AppSlug): Column[] {
	if (app === "hemisync")
		return [
			person("h1", "Ghid Sesiuni Alfa", 1),
			person("h2", "Ghid Sesiuni Beta", 2),
			{ id: "hr1", kind: "room", name: "Sala Hemi-Sync", colour: 5, capacity: 8 },
			{ id: "hg1", kind: "group", name: "Club Hemi-Sync", colour: 6, capacity: 12 },
		];
	return [
		person("p1", "Terapeut Alfa", 1),
		person("p2", "Terapeut Beta", 2),
		person("p3", "Terapeut Gamma", 3),
		{ id: "d1", kind: "device", name: "Aparat NFB 1", colour: 4 },
		{ id: "r1", kind: "room", name: "Cabinet Terapie", colour: 5, capacity: 3 },
		{ id: "g1", kind: "group", name: "Sală Grup", colour: 6, capacity: 12 },
	];
}

const SERVICES: Record<AppSlug, Service[]> = {
	psizone: [
		{
			id: "s1",
			name: "Terapie individuală",
			durationMin: 50,
			priceBani: 15000,
		},
		{ id: "s2", name: "Evaluare", durationMin: 90, priceBani: 40000 },
		{ id: "s3", name: "Neurofeedback", durationMin: 45, priceBani: 12000 },
		{ id: "s4", name: "Ședință de grup", durationMin: 60, priceBani: 8000 },
	],
	hemisync: [
		{ id: "s1", name: "Sesiune Hemi-Sync", durationMin: 60, priceBani: 9000 },
		{ id: "s2", name: "Club (grup)", durationMin: 90, priceBani: 5000 },
	],
};

const ALL = (scope: "all" | "assigned" | "own"): Record<string, "all" | "assigned" | "own"> =>
	Object.fromEntries(ACTIONS.map((a) => [a, scope]));

function rolesFor(): Role[] {
	const full = (resources: ReadonlyArray<string>, scope: "all" | "assigned" | "own" = "all") =>
		Object.fromEntries(resources.map((r) => [r, ALL(scope)]));
	return [
		{
			id: "owner",
			name: "Owner",
			description: "Everything, including roles and the audit log.",
			members: 1,
			grants: full([
				"appointments",
				"calendars",
				"groups",
				"clients",
				"clinical",
				"files",
				"packages",
				"payments",
				"prices",
				"roster",
				"leave",
				"reminders",
				"requests",
				"settings",
				"members",
				"roles",
				"audit",
			]),
			fieldGroups: ["contact", "guardian", "money", "clinical"],
		},
		{
			id: "reception",
			name: "Reception",
			description:
				"The calendar, clients (contact, guardian, money), packages, reminders and requests.",
			members: 2,
			grants: {
				...full([
					"appointments",
					"calendars",
					"groups",
					"clients",
					"packages",
					"payments",
					"reminders",
					"requests",
				]),
				roster: { view: "all" },
			},
			fieldGroups: ["contact", "guardian", "money"],
		},
		{
			id: "therapist",
			name: "Therapist",
			description: "Their own calendar and the clinical record of clients they treat.",
			members: 4,
			grants: {
				appointments: {
					view: "own",
					create: "own",
					edit: "own",
					cancel: "own",
				},
				clients: { view: "assigned" },
				clinical: { view: "assigned", create: "assigned", edit: "assigned" },
				leave: { view: "own", create: "own" },
			},
			fieldGroups: ["contact", "guardian", "clinical"],
		},
		{
			id: "accountant",
			name: "Accountant",
			description: "Money and reports, read-only.",
			members: 1,
			grants: {
				packages: { view: "all", export: "all" },
				payments: { view: "all", export: "all" },
				prices: { view: "all" },
			},
			fieldGroups: ["money"],
		},
	];
}

export function seedApp(app: AppSlug, today: string): AppData {
	const rand = lcg(app === "psizone" ? 7 : 19);
	const columns = columnsFor(app);
	const services = SERVICES[app];
	const clientCount = app === "psizone" ? 24 : 9;
	const clients: Client[] = Array.from({ length: clientCount }, (_, i) => {
		const n = i + 1;
		return {
			id: `c${n}`,
			name: `${NAMES[i % NAMES.length]} Exemplu ${pad(n)}`,
			guardian: n % 3 === 0 ? null : `Tutore Exemplu ${pad(n)}`,
			phone: `0700 000 0${pad(n)}`,
			email: `client.${pad(n)}@example.test`,
			status: n > clientCount - 3 ? "archived" : "current",
			note: n === 2 ? "Notă sintetică cu diacritice: ăîâșț — și emoji 🙂." : "",
			practitionerId: columns.find((c) => c.kind === "person")?.id ?? null,
		};
	});
	const live = clients.filter((c) => c.status === "current");
	const appointments: Appointment[] = [];
	let id = 1;
	for (let d = -3; d <= 14; d++) {
		const date = addDays(today, d);
		if ([0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())) continue;
		for (const col of columns) {
			let start = 9 * 60 + Math.floor(rand() * 3) * 30;
			const slots = col.kind === "group" ? 1 : 3 + Math.floor(rand() * 3);
			for (let k = 0; k < slots; k++) {
				const svc =
					col.kind === "group"
						? services[services.length - 1]
						: services[Math.floor(rand() * (services.length - 1))];
				if (!svc) continue;
				const client = live[Math.floor(rand() * live.length)];
				const past = d < 0;
				const r = rand();
				appointments.push({
					id: `a${id++}`,
					date,
					startMin: start,
					durationMin: svc.durationMin,
					columnId: col.id,
					clientId: col.kind === "group" ? null : (client?.id ?? null),
					title: col.kind === "group" ? svc.name : null,
					serviceId: svc.id,
					status: past
						? r < 0.72
							? "attended"
							: r < 0.82
								? "no-show"
								: "cancelled"
						: r < 0.7
							? "confirmed"
							: r < 0.92
								? "requested"
								: "cancelled",
					note: "",
					...appointmentDefaults(),
					priceBani: col.kind === "group" ? 0 : (svc.priceBani ?? 0),
				});
				start += svc.durationMin + (rand() < 0.4 ? 30 : 10);
				if (start > 17 * 60) break;
			}
		}
	}
	const packages = seedPackages(live, services, columns, appointments, today);
	const people = columns.filter((c) => c.kind === "person");
	const monday = weekStart(today);
	const roster: RosterEntry[] = [];
	for (const w of [0, 1]) {
		for (const p of people) {
			for (let d = 0; d < 7; d++) {
				const date = addDays(monday, w * 7 + d);
				const dow = d;
				const kind =
					dow >= 5
						? "free"
						: p.id.endsWith("2") && dow === 2 && w === 0
							? "leave"
							: p.id.endsWith("3") && dow === 3 && w === 0
								? "medical"
								: "work";
				roster.push({
					personId: p.id,
					date,
					kind,
					fromMin: kind === "work" ? 9 * 60 : null,
					toMin: kind === "work" ? 17 * 60 : null,
				});
			}
		}
	}
	const requests: WebRequest[] = Array.from({ length: app === "psizone" ? 5 : 2 }, (_, i) => ({
		id: `w${i + 1}`,
		receivedAt: `${addDays(today, -i)}T${pad(8 + i)}:15:00`,
		name: `Solicitant Exemplu ${pad(i + 1)}`,
		phone: `0700 000 9${pad(i + 1)}`,
		service: services[i % services.length]?.name ?? "",
		message:
			i === 1
				? "Aș dori o evaluare pentru fiul meu (7 ani). Mulțumesc!"
				: "Vă rog sunați-mă înapoi.",
		handled: i >= 3,
	}));
	const audit: AuditEvent[] = Array.from({ length: 12 }, (_, i) => ({
		id: `e${i + 1}`,
		at: `${addDays(today, -Math.floor(i / 3))}T${pad(9 + i)}:${pad((i * 7) % 60)}:00`,
		actor: i % 2 === 0 ? "Recepție Exemplu" : "Terapeut Alfa",
		action:
			[
				"appointment.create",
				"appointment.cancel",
				"client.edit",
				"package.payment",
				"reminder.send",
			][i % 5] ?? "client.edit",
		target: i % 5 < 2 ? `a${i + 3}` : `c${(i % clientCount) + 1}`,
	}));
	return {
		columns,
		services,
		clients,
		appointments,
		packages,
		roster,
		requests,
		audit,
		roles: rolesFor(),
		sentReminders: new Set(),
	};
}
