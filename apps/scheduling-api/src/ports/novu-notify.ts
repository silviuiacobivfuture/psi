import {
	APP_DEFAULTS,
	APP_KEYS,
	type AppKey,
	accountClientId,
	type EventId,
	type Notifier,
	type Recipient,
} from "@psi/notify";
import { issueLinks } from "@psi/notify/reminders";
import type { LogEvent } from "../http/context";
import type { StorePort } from "../store/types";
import { choicesOf, teamRecipient } from "./choices";
import type { Notification, NotifyPort, TeamName } from "./notify";

/** Where each brand's site lives; the team console is one per environment (CONSOLE_URL), the same for both brands. */
const SITE_URLS: Readonly<Record<AppKey, string>> = {
	psizone: "https://psizone.ro",
	hemisync: "https://hemisync.psizone.ro",
};
/** The per-brand notification settings, whose console links lead to `consoleUrl`. */
export const notifyApps = (consoleUrl: string) =>
	Object.fromEntries(
		APP_KEYS.map((app) => [
			app,
			{ settings: APP_DEFAULTS[app], siteUrl: SITE_URLS[app], consoleUrl },
		]),
	);

const isAppKey = (app: string): app is AppKey => (APP_KEYS as readonly string[]).includes(app);
const iso = (ms: number): string => new Date(ms).toISOString();

export interface NovuNotifyOptions {
	notifier: Notifier;
	store: StorePort;
	log: (event: LogEvent) => void;
	clock: () => number;
	/** The service's public origin and the link secret: the reminder links an appointment mail carries. */
	links?: { publicOrigin: string; secret: string };
}

type Refs = Notification["payload"];
const str = (refs: Refs, key: string): string | undefined => {
	const v = refs[key];
	return typeof v === "string" ? v : undefined;
};

/**
 * The NotifyPort on `@psi/notify`: a handler says WHAT happened by reference (an appointment id, a package id, a
 * leave id); this resolves who is told and what the message prints (names, times, links) from the store, shapes the
 * catalogue's typed payload, and queues it with the action's own key as the occurrence. It queues and returns: a
 * failure here is the caller's to log, never to surface.
 */
export function createNovuNotify(options: NovuNotifyOptions): NotifyPort {
	const { store, notifier } = options;

	async function client(app: string, clientId: string): Promise<Recipient | undefined> {
		const row = await store.c.clients.get(app, clientId);
		if (row === undefined) return undefined;
		const email = row.contact?.email ?? row.guardian?.email;
		const phone = row.contact?.phone ?? row.guardian?.phone;
		return {
			audience: "client",
			clientId: row.id,
			name: row.name,
			locale: "ro",
			...(email === undefined ? {} : { email }),
			...(phone === undefined ? {} : { phone }),
		};
	}

	async function practitioner(app: AppKey, personId: string): Promise<Recipient | undefined> {
		const person = await store.c.people.get(app, personId);
		return person?.subject === undefined
			? undefined
			: {
					audience: "practitioner",
					subject: person.subject,
					name: person.displayName,
					locale: "ro",
					choices: await choicesOf(store, app, person.subject),
				};
	}

	/** The facts an appointment message prints, and who it concerns. */
	async function appointment(app: AppKey, id: string) {
		const row = await store.c.appointments.get(app, id);
		if (row === undefined) return undefined;
		const [who, service, person] = await Promise.all([
			row.clientId === undefined ? undefined : store.c.clients.get(app, row.clientId),
			row.serviceId === undefined ? undefined : store.c.services.get(app, row.serviceId),
			store.c.people.get(app, row.practitionerId),
		]);
		const now = options.clock();
		const links =
			options.links === undefined || row.start <= now
				? undefined
				: issueLinks({
						secret: options.links.secret,
						publicOrigin: options.links.publicOrigin,
						app,
						appointmentId: row.id,
						locale: "ro",
						startsAt: row.start,
						now,
					});
		const payload = {
			appointmentId: row.id,
			clientName: who?.name ?? "—",
			serviceName: service?.name.ro ?? "Programare",
			startsAt: iso(row.start),
			...(person === undefined ? {} : { practitionerName: person.displayName }),
			...(links === undefined ? {} : { icsUrl: links.icsUrl }),
		};
		return { row, payload };
	}

	async function send(
		app: AppKey,
		event: EventId,
		payload: Record<string, unknown>,
		to: ReadonlyArray<Recipient | undefined>,
		occurrence: string,
	): Promise<void> {
		// A team is told member by member, so that each member's own choices hold.
		const recipients = await Promise.all(
			to
				.filter((r): r is Recipient => r !== undefined)
				.map((r) =>
					r.audience === "team" || r.audience === "reception" || r.audience === "owners"
						? teamRecipient(store, app, r.audience)
						: r,
				),
		);
		if (recipients.length === 0) return;
		await notifier.notify(app, event, payload, recipients, occurrence);
	}

	async function translate(n: Notification, app: AppKey): Promise<void> {
		const { payload: refs, to } = n;
		switch (n.event) {
			case "request.created": {
				const reference = str(refs, "reference") ?? "";
				const found = (await store.requests.list(n.app, 0, options.clock() + 86_400_000)).find(
					(r) => r.reference === reference,
				);
				return send(
					app,
					"request.new",
					{
						requestId: reference,
						name: found?.contact?.name ?? "—",
						kind: found?.start === undefined ? "callback" : "web",
					},
					[{ audience: "team" }],
					n.idempotencyKey,
				);
			}
			case "appointment.requested":
			case "appointment.cancelled":
			case "appointment.confirmed":
			case "appointment.moved": {
				const id = str(refs, "appointmentId");
				if (id !== undefined) {
					const facts = await appointment(app, id);
					if (facts === undefined) return;
					const extra =
						n.event === "appointment.moved"
							? {
									previousStartsAt: iso(
										typeof refs.previousStart === "number" ? refs.previousStart : facts.row.start,
									),
								}
							: {};
					return send(
						app,
						n.event,
						{ ...facts.payload, ...extra },
						[
							facts.row.clientId === undefined
								? undefined
								: await client(n.app, facts.row.clientId),
							await practitioner(app, facts.row.practitionerId),
						],
						n.idempotencyKey,
					);
				}
				// A visitor's request, named by its reference: the visitor's own contact is who is told.
				const reference = str(refs, "reference") ?? str(refs, "requestId") ?? "";
				const account = str(refs, "account");
				const found = (
					await store.requests.list(n.app, 0, options.clock() + 365 * 86_400_000)
				).find((r) => r.reference === reference);
				if (found?.start === undefined || found.contact === undefined) return;
				const service = (await store.c.services.list(n.app)).find(
					(s) => s.slug === found.serviceSlug,
				);
				return send(
					app,
					n.event,
					{
						appointmentId: reference,
						clientName: found.contact.name,
						serviceName: service?.name.ro ?? "Programare",
						startsAt: iso(found.start),
						...(n.event === "appointment.moved"
							? {
									previousStartsAt: iso(
										typeof refs.previousStart === "number" ? refs.previousStart : found.start,
									),
								}
							: {}),
					},
					[
						{
							audience: "client",
							// A signed-in visitor is their account (every request of it, the devices they allowed);
							// anyone else is this request only.
							clientId: account === undefined ? reference : accountClientId(account),
							name: found.contact.name,
							locale: "ro",
							...(found.contact.email === undefined ? {} : { email: found.contact.email }),
							...(found.contact.phone === undefined ? {} : { phone: found.contact.phone }),
						},
					],
					n.idempotencyKey,
				);
			}
			case "package.low": {
				const pkg = await store.c.packages.get(n.app, str(refs, "packageId") ?? "");
				const who = pkg === undefined ? undefined : await store.c.clients.get(n.app, pkg.clientId);
				if (pkg === undefined || who === undefined) return;
				return send(
					app,
					"package.running_low",
					{
						packageId: pkg.id,
						clientId: who.id,
						clientName: who.name,
						remaining: Math.max(0, Number(refs.sessionsRemaining ?? 0)),
					},
					[{ audience: "reception" }],
					n.idempotencyKey,
				);
			}
			case "payment.recorded": {
				const clientId = str(refs, "clientId");
				const who = clientId === undefined ? undefined : await client(n.app, clientId);
				const cents = Number(refs.amountCents ?? 0);
				return send(
					app,
					"payment.recorded",
					{
						paymentId: str(refs, "paymentId") ?? n.idempotencyKey,
						serviceName: str(refs, "what") ?? "Plată",
						amount: `${(cents / 100).toFixed(2)} RON`,
					},
					[who],
					n.idempotencyKey,
				);
			}
			case "leave.requested": {
				const person = await store.c.people.get(n.app, str(refs, "personId") ?? "");
				return send(
					app,
					"leave.requested",
					{
						leaveId: str(refs, "leaveId") ?? "",
						personName: person?.displayName ?? "—",
						from: str(refs, "from") ?? "",
						to: str(refs, "to") ?? "",
					},
					[{ audience: "owners" }],
					n.idempotencyKey,
				);
			}
			case "leave.decided": {
				const leave = await store.c.leave.get(n.app, str(refs, "leaveId") ?? "");
				if (leave === undefined || to.kind !== "person") return;
				const requester: Recipient = {
					audience: "requester",
					subject: to.subject,
					locale: "ro",
					choices: await choicesOf(store, app, to.subject),
				};
				return send(
					app,
					refs.decision === "approved" ? "leave.approved" : "leave.declined",
					{ leaveId: leave.id, from: leave.from, to: leave.to },
					[requester],
					n.idempotencyKey,
				);
			}
			case "attendance.no_show":
				// The catalogue has no message for it: the calendar shows it.
				return;
			default: {
				const never: never = n.event;
				return never;
			}
		}
	}

	return {
		async notify(n) {
			if (!isAppKey(n.app)) {
				options.log({
					level: "warn",
					event: "notify_unknown_app",
					requestId: n.idempotencyKey,
					app: n.app,
				});
				return;
			}
			await translate(n, n.app);
		},
		async syncPerson(app, person, teams) {
			if (!isAppKey(app)) return;
			await notifier.upsertSubscriber(app, {
				audience: "practitioner",
				subject: person.subject,
				locale: "ro",
				...(person.name === undefined ? {} : { name: person.name }),
				...(person.email === undefined ? {} : { email: person.email }),
			});
			for (const team of ["team", "reception", "owners"] as const satisfies readonly TeamName[]) {
				const add = teams.add.includes(team) ? [person.subject] : [];
				const remove = teams.remove.includes(team) ? [person.subject] : [];
				if (add.length > 0 || remove.length > 0) await notifier.setTeam(app, team, add, remove);
			}
		},
	};
}
