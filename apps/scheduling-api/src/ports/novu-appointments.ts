import { type AppKey, accountClientId, type Recipient } from "@psi/notify";
import type { Notification } from "./notify";
import { iso, type NotifyEnv, num, str, type Translate } from "./novu-env";

type Source = "client" | "staff" | "assistant" | "system";
const SOURCES: readonly Source[] = ["client", "staff", "assistant", "system"];
const sourceOf = (refs: Notification["payload"]): Source | undefined =>
	SOURCES.find((s) => s === str(refs, "source"));

/** The reception team minus the person who made the change: they need no notice of their own action. */
const reception = (except: string | undefined): Recipient => ({
	audience: "reception",
	...(except === undefined ? {} : { except }),
});

/** A visitor's request, named by its reference: found among the app's requests. */
async function requestOf(env: NotifyEnv, app: string, reference: string) {
	const horizon = env.options.clock() + 365 * 86_400_000;
	return (await env.store.requests.list(app, 0, horizon)).find((r) => r.reference === reference);
}

export const requestCreated: Translate = async (n, app, env) => {
	const reference = str(n.payload, "reference") ?? "";
	const found = (await env.store.requests.list(n.app, 0, env.options.clock() + 86_400_000)).find(
		(r) => r.reference === reference,
	);
	const via = str(n.payload, "via");
	return env.send(
		app,
		"request.new",
		{
			requestId: reference,
			name: found?.contact?.name ?? "—",
			kind: via === "guide" ? "assistant" : found?.start === undefined ? "callback" : "web",
		},
		[{ audience: "team" }],
		n.idempotencyKey,
	);
};

/** requested, confirmed, moved, cancelled: the client and the therapist by what the appointment says, reception by who did it. */
export const appointmentChanged: Translate = async (n, app, env) => {
	const event = n.event;
	if (
		event !== "appointment.requested" &&
		event !== "appointment.confirmed" &&
		event !== "appointment.moved" &&
		event !== "appointment.cancelled"
	)
		return;
	const id = str(n.payload, "appointmentId");
	if (id !== undefined) {
		const facts = await env.appointment(app, id);
		if (facts === undefined) return;
		const extra =
			event === "appointment.moved"
				? {
						previousStartsAt: iso(num(n.payload, "previousStart") ?? facts.row.start),
					}
				: {};
		await env.send(
			app,
			event,
			{ ...facts.payload, ...extra },
			[
				facts.row.clientId === undefined ? undefined : await env.client(n.app, facts.row.clientId),
				await env.practitioner(n.app, facts.row.practitionerId),
			],
			n.idempotencyKey,
		);
		// The desk is told who did it; the client's own message never carries a colleague's name.
		const actor = str(n.payload, "actor");
		const changedBy = await env.actorName(n.app, actor);
		const source = sourceOf(n.payload);
		return env.send(
			app,
			event,
			{
				...facts.payload,
				...extra,
				...(changedBy === undefined ? {} : { changedBy }),
				...(source === undefined ? {} : { source }),
			},
			[reception(actor)],
			n.idempotencyKey,
		);
	}
	// A visitor's request, named by its reference: the visitor's own contact is who is told.
	const reference = str(n.payload, "reference") ?? str(n.payload, "requestId") ?? "";
	const found = await requestOf(env, n.app, reference);
	if (found?.start === undefined || found.contact === undefined) return;
	const service = (await env.store.c.services.list(n.app)).find(
		(s) => s.slug === found.serviceSlug,
	);
	const payload = {
		appointmentId: reference,
		clientName: found.contact.name,
		serviceName: service?.name.ro ?? "Programare",
		startsAt: iso(found.start),
		...(event === "appointment.moved"
			? { previousStartsAt: iso(num(n.payload, "previousStart") ?? found.start) }
			: {}),
	};
	const account = str(n.payload, "account");
	await env.send(
		app,
		event,
		payload,
		[
			{
				audience: "client",
				// A signed-in visitor is their account (every request of it, the devices they allowed on a site); anyone
				// else is this request only.
				clientId: account === undefined ? reference : accountClientId(account),
				name: found.contact.name,
				locale: "ro",
				...(found.contact.email === undefined ? {} : { email: found.contact.email }),
				...(found.contact.phone === undefined ? {} : { phone: found.contact.phone }),
			},
		],
		n.idempotencyKey,
	);
	// A visitor who cancels or moves their own is news for the desk (the old time is free, the new one taken); a new
	// request the desk already hears of as `request.new`.
	if (event === "appointment.cancelled" || event === "appointment.moved")
		await env.send(
			app,
			event,
			{ ...payload, source: "client" },
			[reception(undefined)],
			n.idempotencyKey,
		);
};

/** The 24-hour and the 2-hour reminders: the client, with the links to answer in one tap (24 h) or the calendar. */
export const reminderToClient: Translate = async (n, app, env) => {
	const id = str(n.payload, "appointmentId");
	if (id === undefined || (n.event !== "reminder.day_before" && n.event !== "reminder.two_hours"))
		return;
	const facts = await env.appointment(app, id);
	if (facts === undefined || facts.row.clientId === undefined || facts.row.status === "cancelled")
		return;
	const to = await env.client(n.app, facts.row.clientId);
	if (n.event === "reminder.two_hours")
		return env.send(app, n.event, facts.payload, [to], n.idempotencyKey);
	// The day-before reminder IS its two links: without the means to sign them there is nothing to send.
	if (facts.links === undefined) return;
	return env.send(
		app,
		n.event,
		{ ...facts.payload, confirmUrl: facts.links.confirmUrl, cancelUrl: facts.links.cancelUrl },
		[to],
		n.idempotencyKey,
	);
};

/** A reminder that could not reach the client: reception rings or writes instead. */
export const reminderFailed: Translate = async (n, app, env) => {
	const id = str(n.payload, "appointmentId");
	const reason = str(n.payload, "reason") === "gave_up" ? "gave_up" : "no_contact";
	if (id === undefined) return;
	const facts = await env.appointment(app, id);
	if (facts === undefined) return;
	return env.send(
		app,
		"reminder.failed",
		{ ...facts.payload, reason },
		[reception(undefined)],
		n.idempotencyKey,
	);
};

/** Two appointments on one therapist, room or device at one time. */
export const appointmentConflict: Translate = async (n, app, env) => {
	const id = str(n.payload, "appointmentId");
	const other = str(n.payload, "otherAppointmentId");
	const what = str(n.payload, "what");
	if (id === undefined) return;
	const facts = await env.appointment(app, id);
	if (facts === undefined) return;
	return env.send(
		app,
		"appointment.conflict",
		{
			...facts.payload,
			conflictId: other === undefined ? `${id}+roster` : `${id}+${other}`,
			...(other === undefined ? {} : { otherAppointmentId: other }),
			what: what === "room" || what === "device" || what === "roster" ? what : "practitioner",
		},
		[reception(undefined)],
		n.idempotencyKey,
	);
};

/** A client with a clinic record who is not on the books: nothing to print, only where and how hard. */
export const blacklistAttempt: Translate = async (n, app, env) => {
	const severity = str(n.payload, "severity");
	const channel = str(n.payload, "channel");
	return env.send(
		app,
		"blacklist.attempt",
		{
			entryId: str(n.payload, "entryId") ?? "unknown",
			severity: severity === "block_online" || severity === "block_all" ? severity : "warn",
			channel: channel === "callback" || channel === "assistant" ? channel : "web",
		},
		[reception(undefined)],
		n.idempotencyKey,
	);
};

export type { AppKey };
