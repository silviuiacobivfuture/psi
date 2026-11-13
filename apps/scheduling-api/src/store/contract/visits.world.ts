import { beforeAll, expect } from "vitest";
import { newId } from "../ids";
import type { AppointmentRow, PackageRow, PaymentRow } from "../types";
import type { ContractEnv } from "./env";

/**
 * Appointments, packages, payments and reminders, as the handlers use them. Ids are the store's (Convex assigns them),
 * stamps are the store's, so rows are compared on what the caller wrote. A refusal is its own case and leaves every row as
 * it was.
 */
export const HOUR = 3_600_000;
export const BASE = Date.UTC(2030, 5, 3, 8);

export interface World {
	app: string;
	dora: string;
	elena: string;
	mara: string;
	c1: string;
	c2: string;
	room: string;
	room2: string;
	device: string;
	group: string;
}

export async function build(env: ContractEnv): Promise<World> {
	const app = await env.newApp();
	const now = Date.now();
	const stamps = { createdAt: now, updatedAt: now };
	const c = env.store.c;
	const person = async (displayName: string, kind: "practitioner" | "reception") =>
		(
			await c.people.insert({
				id: newId("p"),
				app,
				displayName,
				kind,
				active: true,
				external: false,
				...stamps,
			})
		).id;
	const client = async (name: string) =>
		(
			await c.clients.insert({
				id: newId("c"),
				app,
				name,
				status: "active",
				treating: [],
				...stamps,
			})
		).id;
	const room = async (name: string) =>
		(await c.rooms.insert({ id: newId("o"), app, name, kind: "therapy", active: true, ...stamps }))
			.id;
	return {
		app,
		dora: await person("Dora Test", "practitioner"),
		elena: await person("Elena Test", "practitioner"),
		mara: await person("Mara Test", "reception"),
		c1: await client("Client One"),
		c2: await client("Client Two"),
		room: await room("Room One"),
		room2: await room("Room Two"),
		device: (
			await c.devices.insert({ id: newId("d"), app, name: "Device One", active: true, ...stamps })
		).id,
		group: (
			await c.groups.insert({
				id: newId("g"),
				app,
				name: "Group One",
				kind: "group",
				clientIds: [],
				active: true,
				...stamps,
			})
		).id,
	};
}

export const draft = (
	w: World,
	over: Partial<AppointmentRow> & { start: number },
): AppointmentRow => ({
	id: newId("a"),
	app: w.app,
	kind: "session",
	status: "scheduled",
	practitionerId: w.dora,
	clientId: w.c1,
	end: over.start + HOUR,
	createdAt: Date.now(),
	updatedAt: Date.now(),
	...over,
});

/** What the caller wrote, without the store's id and stamps. */
export const written = (row: AppointmentRow | undefined) => {
	if (row === undefined) return undefined;
	const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = row;
	return rest;
};

export const money = (price: number, paid: number): NonNullable<AppointmentRow["money"]> => ({
	priceCents: price,
	paidCents: paid,
	paymentStatus: price > 0 && paid >= price ? "paid" : paid > 0 ? "partial" : "unpaid",
});
export const pkg = (
	world: World,
	clientId: string,
	over: Partial<PackageRow> = {},
): PackageRow => ({
	id: newId("k"),
	app: world.app,
	clientId,
	name: "10 sessions",
	sessions: 10,
	bonus: 1,
	priceCents: 120_000,
	discountCents: 0,
	createdAt: Date.now(),
	updatedAt: Date.now(),
	...over,
});
export const pay = (world: World, over: Partial<PaymentRow>): PaymentRow => ({
	id: newId("y"),
	app: world.app,
	clientId: world.c1,
	amountCents: 1_000,
	method: "cash",
	paidAt: Date.now(),
	createdAt: Date.now(),
	updatedAt: Date.now(),
	...over,
});

/** One app per section, built before its cases run; the helpers every case of the section uses. */
export function useWorld(env: () => ContractEnv) {
	let w: World | undefined;
	let slot = 0;
	beforeAll(async () => {
		w = await build(env());
	});
	const world = (): World => {
		if (w === undefined) throw new Error("the world is built before the cases run");
		return w;
	};
	const c = () => env().store.c;
	/** A free hour of its own, so cases do not meet. */
	const next = (): number => BASE + 24 * HOUR * ++slot;
	const snapshot = async (): Promise<string> =>
		JSON.stringify([
			(await c().appointments.list(world().app)).sort((a, b) => a.id.localeCompare(b.id)),
			(await c().packages.list(world().app)).sort((a, b) => a.id.localeCompare(b.id)),
			(await c().payments.list(world().app)).sort((a, b) => a.id.localeCompare(b.id)),
			(await c().reminders.list(world().app)).sort((a, b) => a.id.localeCompare(b.id)),
		]);
	/** The call is refused with one of the store's reasons and nothing anywhere changed. */
	async function refused(reason: string, run: () => Promise<unknown>): Promise<void> {
		const before = await snapshot();
		await expect(run()).rejects.toMatchObject({ name: "StoreRefused", reason });
		expect(await snapshot(), "a refusal wrote something").toBe(before);
	}
	return { world, c, next, snapshot, refused };
}
