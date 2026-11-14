import { appLink, parentLink, treatingLink } from "../authz/links";
import type { Tuple } from "../authz/port";
import { MemoryCollection } from "../store/memory-collection";
import type { AppointmentRow, ClientRow, NoteRow, PackageRow, PaymentRow } from "../store/types";
import type { Populated } from "./populate";
import { HOUR, NOW } from "./world";

/** The clinic as it is today: ~220 clients and ~5600 visits. `factor` 10 is the size it must still bear. */
export const BASE_SCALE = { clients: 220, appointments: 5600 } as const;

export interface ScaleCounts {
	clients: number;
	appointments: number;
	packages: number;
	payments: number;
	notes: number;
	audit: number;
}

const DAY = 24 * HOUR;
/** Deterministic: the same factor gives the same rows, so two runs measure the same world. */
const pick = <T>(list: readonly T[], i: number): T => {
	const item = list[i % list.length];
	if (item === undefined) throw new Error("pick from an empty list");
	return item;
};

/** Practitioners (each with a room of their own) the grown clinic has, the two populated ones included. */
const TEAM = 10;
/** Visits a practitioner can hold a day: one an hour from 08:00 UTC. */
const HOURS = 10;
/** Days the visits spread over: a year before NOW and a year after. */
const SPAN = 730;

/** The team and the rooms are made through the API (a handful of calls), so their tuples are the service's own. */
async function team(world: Populated): Promise<{ people: string[]; rooms: string[] }> {
	const people = [world.ids.dora, world.ids.elena];
	const rooms = [world.ids.room, world.ids.room];
	const base = "/v1/apps/psizone";
	for (let i = people.length; i < TEAM; i++) {
		const person = await world.call("olga", "POST", `${base}/people`, {
			displayName: `Scale Practitioner ${i}`,
			kind: "practitioner",
		});
		const room = await world.call("olga", "POST", `${base}/rooms`, {
			name: `Scale Room ${i}`,
			kind: "therapy",
		});
		const pid = person.json.id;
		const rid = room.json.id;
		if (typeof pid !== "string" || typeof rid !== "string")
			throw new Error(`team member ${i}: ${person.status} ${room.status}`);
		people.push(pid);
		rooms.push(rid);
	}
	return { people, rooms };
}

/**
 * Grows the populated psizone app to `factor` times the clinic's real size, writing straight into the store and the
 * authorization tuples (seeding 56 000 visits through HTTP would take minutes). The rows and tuples are the ones the
 * handlers would write: every client and appointment linked to the app, appointments to their calendar, clients to
 * who treats them. Visits spread over two years around NOW, at most one an hour per practitioner and room, so none
 * overlaps; they are inserted without the in-memory store's overlap scan, which would make seeding quadratic.
 */
export async function scaleUp(world: Populated, factor: number): Promise<ScaleCounts> {
	const app = "psizone";
	const store = world.store.c;
	const { people: practitioners, rooms } = await team(world);
	if (BASE_SCALE.appointments * factor > TEAM * HOURS * SPAN)
		throw new Error(`factor ${factor} needs more practitioners than ${TEAM}`);
	const insertVisit =
		store.appointments instanceof MemoryCollection
			? (row: AppointmentRow) => MemoryCollection.prototype.insert.call(store.appointments, row)
			: (row: AppointmentRow) => store.appointments.insert(row);
	const clients = BASE_SCALE.clients * factor;
	const appointments = BASE_SCALE.appointments * factor;
	const tuples: Tuple[] = [];
	const clientIds: string[] = [];
	for (let i = 0; i < clients; i++) {
		const id = `cs${String(i).padStart(6, "0")}`;
		const treating = [pick(practitioners, i)];
		const row: ClientRow = {
			id,
			app,
			name: `Scale Client ${String(i).padStart(5, "0")}`,
			status: i % 17 === 0 ? "archived" : "active",
			treating,
			birthYear: 1950 + (i % 70),
			contact: { phone: `07${String(10_000_000 + i).slice(-8)}`, email: `scale${i}@example.test` },
			createdAt: NOW - (i % 700) * DAY,
			updatedAt: NOW - (i % 30) * DAY,
			...(i % 17 === 0 ? { archivedAt: NOW - 10 * DAY } : {}),
		};
		await store.clients.insert(row);
		clientIds.push(id);
		tuples.push(appLink("sched_client", id, app), treatingLink(id, pick(treating, 0)));
	}
	const first = NOW - (SPAN / 2) * DAY - (NOW % DAY);
	for (let i = 0; i < appointments; i++) {
		const practitionerId = pick(practitioners, i);
		const roomId = pick(rooms, i);
		const slot = Math.floor(i / practitioners.length);
		const day = slot % SPAN;
		const hour = 8 + (Math.floor(slot / SPAN) % HOURS);
		const start = first + day * DAY + hour * HOUR;
		const id = `as${String(i).padStart(7, "0")}`;
		const row: AppointmentRow = {
			id,
			app,
			kind: "session",
			status: start < NOW ? (i % 11 === 0 ? "cancelled" : "attended") : "scheduled",
			practitionerId,
			clientId: pick(clientIds, i * 7),
			roomId,
			serviceId: world.ids.service,
			start,
			end: start + HOUR,
			remind: true,
			createdAt: start - 7 * DAY,
			updatedAt: start - 7 * DAY,
		};
		await insertVisit(row);
		tuples.push(
			appLink("sched_appointment", id, app),
			parentLink("sched_appointment", id, "calendar", "sched_calendar", practitionerId),
		);
	}
	let packages = 0;
	let payments = 0;
	let notes = 0;
	for (let i = 0; i < clientIds.length; i++) {
		const clientId = pick(clientIds, i);
		if (i % 2 === 0) {
			const id = `ks${String(i).padStart(6, "0")}`;
			const pkg: PackageRow = {
				id,
				app,
				clientId,
				name: "10 sessions",
				sessions: 10,
				bonus: 0,
				priceCents: 100_000,
				discountCents: 0,
				createdAt: NOW - 60 * DAY,
				updatedAt: NOW - 60 * DAY,
			};
			await store.packages.insert(pkg);
			tuples.push(
				appLink("sched_package", id, app),
				parentLink("sched_package", id, "client", "sched_client", clientId),
			);
			packages++;
			const pay: PaymentRow = {
				id: `ys${String(i).padStart(6, "0")}`,
				app,
				clientId,
				packageId: id,
				amountCents: 50_000,
				method: "cash",
				paidAt: NOW - 50 * DAY,
				recordedBy: "olga",
				createdAt: NOW - 50 * DAY,
				updatedAt: NOW - 50 * DAY,
			};
			await store.payments.insert(pay);
			payments++;
		}
		for (let n = 0; n < 2; n++) {
			const note: NoteRow = {
				id: `ns${String(i).padStart(6, "0")}${n}`,
				app,
				clientId,
				category: "general",
				text: `Synthetic note ${n} of ${clientId}`,
				pinned: n === 0 && i % 5 === 0,
				authorSubject: "olga",
				createdAt: NOW - (n + 1) * DAY,
				updatedAt: NOW - (n + 1) * DAY,
			};
			await store.notes.insert(note);
			notes++;
		}
	}
	const audit = appointments;
	for (let i = 0; i < audit; i++)
		await store.audit.insert({
			id: `us${String(i).padStart(7, "0")}`,
			app,
			at: NOW - i * 60_000,
			actor: { subject: "olga", kind: "person" },
			action: pick(["appointment.created", "client.updated", "payment.created"], i),
			target: { type: "appointment", id: `as${String(i).padStart(7, "0")}` },
		});
	for (let i = 0; i < tuples.length; i += 5000)
		await world.authz.write({ writes: tuples.slice(i, i + 5000), deletes: [] });
	return { clients, appointments, packages, payments, notes, audit };
}
