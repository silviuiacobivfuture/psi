import type { StaffCopy } from "./copy";
import type { CardRow, StaffCard } from "./events";
import { clock, clockRange, dateLabel, money } from "./format";
import type {
	Appointment,
	ClientHit,
	ClientSummary,
	PackageBalance,
	ReminderTarget,
	Resource,
	RosterEntry,
	Slot,
	Stats,
	WebRequest,
} from "./model";
import type { StaffLinks } from "./session";

const byTime = (a: Appointment, b: Appointment): number =>
	a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1;

function names(resources: ReadonlyArray<Resource>, ids: ReadonlyArray<string>): string {
	return ids.map((id) => resources.find((r) => r.id === id)?.name ?? id).join(" · ");
}

export function appointmentRows(
	copy: StaffCopy,
	appointments: ReadonlyArray<Appointment>,
	resources: ReadonlyArray<Resource>,
	links: StaffLinks | undefined,
	withDate: boolean,
): Array<CardRow> {
	return [...appointments].sort(byTime).map((a) => ({
		title: `${withDate ? `${dateLabel(copy, a.date)} · ` : ""}${clockRange(a.startMin, a.durationMin)} · ${a.clientName ?? a.title ?? ""}`,
		subtitle: names(resources, a.resourceIds),
		badge: copy.status[a.status],
		tone: copy.statusTone[a.status],
		...(links === undefined ? {} : { href: links.appointment(a.id, a.date) }),
	}));
}

export function agendaCard(copy: StaffCopy, scope: string, rows: Array<CardRow>): StaffCard {
	return {
		kind: "agenda",
		title: copy.card.agenda(scope),
		rows,
		empty: copy.card.noAppointments,
	};
}

export function clientHitsCard(
	copy: StaffCopy,
	hits: ReadonlyArray<ClientHit>,
	links: StaffLinks | undefined,
): StaffCard {
	return {
		kind: "list",
		title: copy.card.matches,
		empty: copy.card.noMatches,
		rows: hits.map((h) => ({
			title: h.name,
			subtitle: h.phone ?? undefined,
			badge: h.status === "archived" ? copy.label.archived : undefined,
			...(links === undefined ? {} : { href: links.client(h.id) }),
		})),
	};
}

export function clientCard(
	copy: StaffCopy,
	c: ClientSummary,
	resources: ReadonlyArray<Resource>,
	links: StaffLinks | undefined,
): StaffCard {
	const lines = [
		{
			label: copy.label.status,
			value: c.status === "current" ? copy.label.current : copy.label.archived,
		},
		...(c.phone ? [{ label: copy.label.phone, value: c.phone }] : []),
		...(c.email ? [{ label: copy.label.email, value: c.email }] : []),
		...(c.guardian ? [{ label: copy.label.guardian, value: c.guardian }] : []),
		...(c.practitionerId
			? [
					{
						label: copy.label.practitioner,
						value: names(resources, [c.practitionerId]),
					},
				]
			: []),
		...(c.clinical?.diagnosis
			? [{ label: copy.label.diagnosis, value: c.clinical.diagnosis }]
			: []),
		...(c.clinical?.lastReportDate
			? [
					{
						label: copy.label.lastReport,
						value: dateLabel(copy, c.clinical.lastReportDate),
					},
				]
			: []),
		...c.upcoming.slice(0, 3).map((a) => ({
			label: copy.label.upcoming,
			value: `${dateLabel(copy, a.date)} · ${clock(a.startMin)}`,
		})),
		...(c.packages ?? []).map((p) => ({
			label: copy.label.packages,
			value: copy.card.packageLine(p, (b) => money(copy, b)),
		})),
	];
	return {
		kind: "client",
		title: copy.card.client(c.name),
		lines,
		...(c.note ? { note: c.note } : {}),
		...(links === undefined ? {} : { href: links.client(c.id) }),
	};
}

export function slotsCard(
	copy: StaffCopy,
	slots: ReadonlyArray<Slot>,
	resources: ReadonlyArray<Resource>,
): StaffCard {
	return {
		kind: "slots",
		title: copy.card.slots,
		empty: copy.card.noSlots,
		slots: slots.map((s) => {
			const when = `${dateLabel(copy, s.date)} ${clock(s.startMin)}`;
			const where = names(resources, s.resourceIds);
			return {
				label: when,
				detail: where,
				ask: copy.card.pickSlot({ when, where }),
			};
		}),
	};
}

export function packagesCard(
	copy: StaffCopy,
	client: string,
	packages: ReadonlyArray<PackageBalance>,
): StaffCard {
	return {
		kind: "list",
		title: copy.card.packages(client),
		empty: copy.card.noPackages,
		rows: packages.map((p) => ({
			title: p.name,
			subtitle: copy.card.packageLine(p, (b) => money(copy, b)),
			badge:
				p.totalBani > p.paidBani
					? `${copy.label.due}: ${money(copy, p.totalBani - p.paidBani)}`
					: undefined,
			tone: p.totalBani > p.paidBani ? "warn" : "good",
		})),
	};
}

export function rosterCard(
	copy: StaffCopy,
	entries: ReadonlyArray<RosterEntry>,
	resources: ReadonlyArray<Resource>,
): StaffCard {
	return {
		kind: "list",
		title: copy.card.roster,
		empty: copy.card.noRoster,
		rows: [...entries]
			.sort((a, b) =>
				a.date === b.date ? a.personId.localeCompare(b.personId) : a.date < b.date ? -1 : 1,
			)
			.map((e) => ({
				title: `${dateLabel(copy, e.date)} · ${names(resources, [e.personId])}`,
				subtitle:
					e.fromMin !== null && e.toMin !== null
						? `${clock(e.fromMin)}–${clock(e.toMin)}`
						: undefined,
				badge: copy.rosterKind[e.kind],
				tone: e.kind === "medical" ? "bad" : e.kind === "leave" ? "warn" : "neutral",
			})),
	};
}

export function requestsCard(copy: StaffCopy, requests: ReadonlyArray<WebRequest>): StaffCard {
	return {
		kind: "list",
		title: copy.card.requests,
		empty: copy.card.noRequests,
		rows: requests.map((r) => ({
			title: `${r.name} · ${r.phone}`,
			subtitle: `${r.service} — ${r.message}`,
			badge: r.handled ? copy.card.handled : undefined,
			tone: r.handled ? "good" : "warn",
		})),
	};
}

export function remindersCard(
	copy: StaffCopy,
	date: string,
	targets: ReadonlyArray<ReminderTarget>,
): StaffCard {
	return {
		kind: "list",
		title: copy.card.reminders(dateLabel(copy, date)),
		empty: copy.card.noReminders,
		rows: targets.map((t) => ({
			title: `${clock(t.startMin)} · ${t.clientName}`,
			subtitle: [t.email ?? copy.card.noEmail, t.phone ?? copy.card.noPhone].join(" · "),
			badge: t.sent ? copy.card.sent : copy.card.notSent,
			tone: t.sent ? "good" : "neutral",
		})),
	};
}

export function notesCard(
	copy: StaffCopy,
	notes: ReadonlyArray<{ date: string; text: string }>,
): StaffCard {
	return {
		kind: "list",
		title: copy.card.notes,
		empty: copy.card.noNotes,
		rows: notes.map((n) => ({
			title: dateLabel(copy, n.date),
			subtitle: n.text,
		})),
	};
}

export function statsCard(copy: StaffCopy, s: Stats): StaffCard {
	return {
		kind: "stats",
		title: copy.card.stats(dateLabel(copy, s.from), dateLabel(copy, s.to)),
		metrics: [
			{ label: copy.card.sessions, value: String(s.sessions) },
			{ label: copy.card.attended, value: String(s.attended), tone: "good" },
			{
				label: copy.card.noShows,
				value: String(s.noShows),
				tone: s.noShows > 0 ? "bad" : "neutral",
			},
			{ label: copy.card.cancelled, value: String(s.cancelled) },
			{
				label: copy.card.unpaidClients,
				value: String(s.unpaidClients),
				tone: s.unpaidClients > 0 ? "warn" : "neutral",
			},
			{
				label: copy.card.unpaid,
				value: money(copy, s.unpaidBani),
				tone: s.unpaidBani > 0 ? "warn" : "neutral",
			},
		],
	};
}
