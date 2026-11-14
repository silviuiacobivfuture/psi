import type { Recipient } from "@psi/notify";
import { linesOf, money, ownerStats, sessionsBetween } from "../engagement/digest-data";
import { type NotifyEnv, str, type Translate } from "./novu-env";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayOf = (value: string | undefined): string | undefined =>
	value !== undefined && DAY.test(value) ? value : undefined;

async function zoneOf(env: NotifyEnv, app: string): Promise<string> {
	return (await env.store.c.apps.get(app, app))?.timeZone ?? "Europe/Bucharest";
}

export const leaveRequested: Translate = async (n, app, env) => {
	const person = await env.store.c.people.get(n.app, str(n.payload, "personId") ?? "");
	return env.send(
		app,
		"leave.requested",
		{
			leaveId: str(n.payload, "leaveId") ?? "",
			personName: person?.displayName ?? "—",
			from: str(n.payload, "from") ?? "",
			to: str(n.payload, "to") ?? "",
		},
		[{ audience: "owners" }],
		n.idempotencyKey,
	);
};

export const leaveDecided: Translate = async (n, app, env) => {
	const leave = await env.store.c.leave.get(n.app, str(n.payload, "leaveId") ?? "");
	if (leave === undefined || n.to.kind !== "person") return;
	const requester: Recipient = { audience: "requester", subject: n.to.subject, locale: "ro" };
	return env.send(
		app,
		n.payload.decision === "approved" ? "leave.approved" : "leave.declined",
		{ leaveId: leave.id, from: leave.from, to: leave.to },
		[requester],
		n.idempotencyKey,
	);
};

/** Today's agenda for the desk: one line per session. A day with none sends nothing. */
export const receptionDaily: Translate = async (n, app, env) => {
	const date = dayOf(str(n.payload, "date"));
	if (date === undefined) return;
	const zone = await zoneOf(env, n.app);
	const rows = (await sessionsBetween(env.store, n.app, zone, date, date)).filter(
		(a) => a.status !== "cancelled",
	);
	if (rows.length === 0) return;
	return env.send(
		app,
		"digest.reception_daily",
		{
			digestId: `reception_daily:${date}`,
			date,
			total: rows.length,
			lines: await linesOf(env.store, n.app, rows),
		},
		[{ audience: "reception" }],
		n.idempotencyKey,
	);
};

/** Tomorrow's sessions of one therapist, in the evening. */
export const practitionerEvening: Translate = async (n, app, env) => {
	const date = dayOf(str(n.payload, "date"));
	const personId = str(n.payload, "personId");
	if (date === undefined || personId === undefined) return;
	const to = await env.practitioner(n.app, personId);
	if (to === undefined) return;
	const zone = await zoneOf(env, n.app);
	const rows = (await sessionsBetween(env.store, n.app, zone, date, date)).filter(
		(a) => a.practitionerId === personId && a.status !== "cancelled",
	);
	if (rows.length === 0) return;
	return env.send(
		app,
		"digest.practitioner_evening",
		{
			digestId: `practitioner_evening:${personId}:${date}`,
			date,
			total: rows.length,
			lines: await linesOf(env.store, n.app, rows),
		},
		[to],
		n.idempotencyKey,
	);
};

/** The owners' numbers for a day or a week. Revenue goes only to those whose role may read it. */
export const ownerDigest: Translate = async (n, app, env) => {
	const weekly = n.event === "digest.owner_weekly";
	const from = dayOf(str(n.payload, weekly ? "from" : "date"));
	const to = weekly ? dayOf(str(n.payload, "to")) : from;
	if (from === undefined || to === undefined) return;
	const zone = await zoneOf(env, n.app);
	const stats = await ownerStats(env.store, n.app, zone, from, to);
	const event = weekly ? "digest.owner_weekly" : "digest.owner_daily";
	const base = {
		digestId: `${weekly ? "owner_weekly" : "owner_daily"}:${from}`,
		from,
		to,
		appointments: stats.appointments,
		attended: stats.attended,
		cancelled: stats.cancelled,
		noShows: stats.noShows,
		occupancyPercent: stats.occupancyPercent,
	};
	await env.send(
		app,
		event,
		{ ...base, revenue: money(stats.revenueCents) },
		[{ audience: "owners", needs: "reports_view_money" }],
		`${n.idempotencyKey}:money`,
	);
	await env.send(
		app,
		event,
		base,
		[{ audience: "owners", without: "reports_view_money" }],
		`${n.idempotencyKey}:plain`,
	);
};

/** A roster day, a leave or a block that touches one therapist. */
export const scheduleChanged: Translate = async (n, app, env) => {
	const date = dayOf(str(n.payload, "date"));
	const personId = str(n.payload, "personId");
	const what = str(n.payload, "what");
	if (date === undefined || personId === undefined) return;
	const to = await env.practitioner(n.app, personId);
	// Someone who changed their own day knows it.
	if (to?.audience === "practitioner" && to.subject === str(n.payload, "actor")) return;
	const changedBy = await env.actorName(n.app, str(n.payload, "actor"));
	return env.send(
		app,
		"schedule.changed",
		{
			changeId: `${personId}:${date}:${what ?? "day_off"}`,
			date,
			what: what === "hours" || what === "leave" || what === "block" ? what : "day_off",
			...(changedBy === undefined ? {} : { changedBy }),
		},
		[to],
		n.idempotencyKey,
	);
};

/** After a session: its report is the therapist's to write. Only the fact that it waits, never what it says. */
export const recordTodo: Translate = async (n, app, env) => {
	const id = str(n.payload, "appointmentId");
	if (id === undefined) return;
	const facts = await env.appointment(app, id);
	if (facts === undefined) return;
	return env.send(
		app,
		"record.todo",
		facts.payload,
		[await env.practitioner(n.app, facts.row.practitionerId)],
		n.idempotencyKey,
	);
};

/** A client given to a therapist: told to the therapist who now treats them. */
export const clientAssigned: Translate = async (n, app, env) => {
	const clientId = str(n.payload, "clientId");
	const personId = str(n.payload, "personId");
	if (clientId === undefined || personId === undefined) return;
	const client = await env.store.c.clients.get(n.app, clientId);
	if (client === undefined) return;
	const to = await env.practitioner(n.app, personId);
	if (to?.audience === "practitioner" && to.subject === str(n.payload, "actor")) return;
	const changedBy = await env.actorName(n.app, str(n.payload, "actor"));
	return env.send(
		app,
		"client.assigned",
		{ clientId, clientName: client.name, ...(changedBy === undefined ? {} : { changedBy }) },
		[to],
		n.idempotencyKey,
	);
};
