import {
	APP_DEFAULTS,
	APP_KEYS,
	type AppKey,
	type EventId,
	type Notifier,
	type Recipient,
} from "@psi/notify";
import { type IssuedLinks, issueLinks } from "@psi/notify/reminders";
import type { LogEvent } from "../http/context";
import type { AppointmentRow, ClientRow, StorePort } from "../store/types";
import type { Notification } from "./notify";

/** Where each brand's site lives; the team console is one per environment (CONSOLE_URL), the same for both brands. */
export const SITE_URLS: Readonly<Record<AppKey, string>> = {
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

export const isAppKey = (app: string): app is AppKey =>
	(APP_KEYS as readonly string[]).includes(app);
export const iso = (ms: number): string => new Date(ms).toISOString();

type Refs = Notification["payload"];
export const str = (refs: Refs, key: string): string | undefined => {
	const v = refs[key];
	return typeof v === "string" ? v : undefined;
};
export const num = (refs: Refs, key: string): number | undefined => {
	const v = refs[key];
	return typeof v === "number" ? v : undefined;
};

export interface NovuNotifyOptions {
	notifier: Notifier;
	store: StorePort;
	log: (event: LogEvent) => void;
	clock: () => number;
	/** The service's public origin and the link secret: the reminder links an appointment mail carries. */
	links?: { publicOrigin: string; secret: string };
}

/** What every translator needs: the store to read facts from, the notifier to queue with, and the helpers they share. */
export interface NotifyEnv {
	readonly options: NovuNotifyOptions;
	readonly store: StorePort;
	/** The client as a recipient: their own e-mail first, their guardian's when they have none. */
	client(app: string, clientId: string): Promise<Recipient | undefined>;
	/** A therapist as a recipient, when they have a sign-in. */
	practitioner(app: string, personId: string): Promise<Recipient | undefined>;
	/** The facts an appointment message prints, with a signed calendar link while it is still ahead. */
	appointment(
		app: AppKey,
		id: string,
	): Promise<
		| {
				row: AppointmentRow;
				client: ClientRow | undefined;
				payload: Record<string, unknown>;
				/** The signed confirm, cancel and calendar links; absent when the service cannot sign or the visit is past. */
				links: IssuedLinks | undefined;
		  }
		| undefined
	>;
	/** The display name of whoever did something (a member or a person with a sign-in), for the team's "done by". */
	actorName(app: string, subject: string | undefined): Promise<string | undefined>;
	send(
		app: AppKey,
		event: EventId,
		payload: Record<string, unknown>,
		to: ReadonlyArray<Recipient | undefined>,
		occurrence: string,
	): Promise<void>;
}

export function createNotifyEnv(options: NovuNotifyOptions): NotifyEnv {
	const { store, notifier } = options;
	return {
		options,
		store,
		async client(app, clientId) {
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
		},
		async practitioner(app, personId) {
			const person = await store.c.people.get(app, personId);
			return person?.subject === undefined
				? undefined
				: {
						audience: "practitioner",
						subject: person.subject,
						name: person.displayName,
						locale: "ro",
					};
		},
		async appointment(app, id) {
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
			return { row, client: who, payload, links };
		},
		async actorName(app, subject) {
			if (subject === undefined) return undefined;
			const members = await store.c.members.list(app);
			return members.find((m) => m.subject === subject)?.displayName;
		},
		async send(app, event, payload, to, occurrence) {
			const recipients = to.filter((r): r is Recipient => r !== undefined);
			if (recipients.length === 0) return;
			await notifier.notify(app, event, payload, recipients, occurrence);
		},
	};
}

export type Translate = (n: Notification, app: AppKey, env: NotifyEnv) => Promise<void>;
