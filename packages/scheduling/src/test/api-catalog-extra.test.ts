import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { backendReady, runMutation } from "./admin";
import { harness, id } from "./api-harness";

/**
 * `apiCatalogExtra`: the full-row readers, the `extra` column, a practitioner's account and colour, the guarded delete and
 * the client pages, against the local backend in a throwaway `test-catx-…` app. Each is refused without the key and then
 * writes NOTHING; with it a write appends one audit event and one change-log entry. Synthetic data.
 */
if (!backendReady) console.warn("api-catalog-extra.test: no local backend; see README");

const { TENANT, mut, qry } = harness("catx");

describe.skipIf(!backendReady)("the catalogue's extra wrappers", () => {
	const ids: Record<string, string> = {};

	beforeAll(async () => {
		if (!backendReady) return;
		await runMutation(
			"clinicApps:ensureApp",
			{ slug: TENANT, name: "T", kind: "clinic", defaultLocale: "ro", currency: "RON" },
			z.unknown(),
		);
	});
	afterAll(async () => {
		if (backendReady) await runMutation("seed:dropFixture", { tenant: TENANT }, z.unknown());
	});

	it("readers give whole rows, ids and creation times", async () => {
		ids.p = id(
			await mut(
				"staffSetup:createPractitioner",
				{ slug: "dora-test", displayName: "Dora Test" },
				{ audit: 0 },
			),
		);
		ids.room = id(
			await mut("staffRooms:createRoom", {
				slug: "cabinet",
				name: "Cabinet",
				kind: "therapy",
				capacity: 2,
				suits: ["adult"],
				equipment: [],
			}),
		);
		const people = (await qry("apiCatalogExtra:practitioners", {})).practitioners as {
			id: string;
			createdAt: number;
		}[];
		expect(people.map((p) => p.id)).toEqual([ids.p]);
		expect(people[0]?.createdAt).toBeGreaterThan(0);
		expect(((await qry("apiCatalogExtra:rooms", {})).rooms as unknown[]).length).toBe(1);
		expect(((await qry("apiCatalogExtra:services", {})).services as unknown[]).length).toBe(0);
	});

	it("setExtra stores JSON text on a row, a practitioner's account and colour on its columns, and clears them", async () => {
		await mut("apiCatalogExtra:setExtra", {
			table: "rooms",
			id: ids.room,
			extra: JSON.stringify({ kind: "free-text" }),
		});
		const room = ((await qry("apiCatalogExtra:rooms", {})).rooms as { extra?: string }[])[0];
		expect(room?.extra).toBe('{"kind":"free-text"}');
		await mut("apiCatalogExtra:setExtra", {
			table: "practitioners",
			id: ids.p,
			staffSubject: "dora",
			color: "#aabbcc",
		});
		const set = (
			(await qry("apiCatalogExtra:practitioners", {})).practitioners as Record<string, unknown>[]
		)[0];
		expect(set).toMatchObject({ staffSubject: "dora", color: "#aabbcc" });
		await mut("apiCatalogExtra:setExtra", {
			table: "practitioners",
			id: ids.p,
			staffSubject: null,
			color: null,
		});
		const cleared = (
			(await qry("apiCatalogExtra:practitioners", {})).practitioners as Record<string, unknown>[]
		)[0];
		expect(cleared?.staffSubject).toBeUndefined();
		expect(cleared?.color).toBeUndefined();
	});

	it("setExtra refuses what it must, and writes nothing", async () => {
		const refused = { audit: 0, ok: false } as const;
		await mut("apiCatalogExtra:setExtra", { table: "rooms", id: ids.room, color: "#fff" }, refused);
		await mut("apiCatalogExtra:setExtra", { table: "rooms", id: ids.p, extra: "{}" }, refused);
		await mut("apiCatalogExtra:setExtra", { table: "rooms", id: "nope", extra: "{}" }, refused);
		await mut(
			"apiCatalogExtra:setExtra",
			{ table: "rooms", id: ids.room, extra: "x".repeat(20_001) },
			refused,
		);
		await mut(
			"apiCatalogExtra:setExtra",
			{ table: "practitioners", id: ids.p, staffSubject: " " },
			refused,
		);
	});

	it("a row another app owns is not found, for a write and for a delete", async () => {
		const other = `${TENANT}-other`;
		const refused = { audit: 0, ok: false } as const;
		await mut(
			"apiCatalogExtra:setExtra",
			{ tenant: other, table: "rooms", id: ids.room, extra: "{}" },
			refused,
		);
		await mut(
			"apiCatalogExtra:removeRow",
			{ tenant: other, table: "rooms", id: ids.room },
			refused,
		);
	});

	it("clients are paged by name and by standing, whole rows with their extra", async () => {
		const client = (name: string) => ({
			name,
			kind: "adult",
			consent: { contact: true, reminders: false },
		});
		ids.a = id(await mut("apiClients:create", { client: client("Alpha") }));
		ids.b = id(await mut("apiClients:create", { client: client("Beta") }));
		ids.c = id(await mut("apiClients:create", { client: client("Gamma") }));
		await mut("apiClients:standing", { client: ids.b, action: "archive" });
		await mut("apiCatalogExtra:setExtra", {
			table: "clients",
			id: ids.a,
			extra: '{"address":"x"}',
		});
		const page = async (standing: string, cursor: string | null, numItems: number) =>
			z
				.object({
					clients: z.array(
						z.object({ id: z.string(), name: z.string(), extra: z.string().optional() }),
					),
					continueCursor: z.string(),
					isDone: z.boolean(),
				})
				.parse(await qry("apiCatalogExtra:clientsPage", { standing, cursor, numItems }));
		const first = await page("all", null, 2);
		expect(first.clients.map((c) => c.name)).toEqual(["Alpha", "Beta"]);
		expect(first.clients[0]?.extra).toBe('{"address":"x"}');
		expect(first.isDone).toBe(false);
		const second = await page("all", first.continueCursor, 2);
		expect(second.clients.map((c) => c.name)).toEqual(["Gamma"]);
		expect((await page("archived", null, 10)).clients.map((c) => c.name)).toEqual(["Beta"]);
		expect((await page("active", null, 10)).clients.map((c) => c.name)).toEqual(["Alpha", "Gamma"]);
		expect((await page("deleted", null, 10)).clients).toEqual([]);
	});

	it("removeRow deletes an unused row with its settings, and refuses one that is in use", async () => {
		const room2 = id(
			await mut("staffRooms:createRoom", {
				slug: "cabinet-2",
				name: "Cabinet 2",
				kind: "therapy",
				capacity: 2,
				suits: ["adult"],
				equipment: [],
			}),
		);
		await mut("staffRooms:addRoomClosure", { room: room2, from: "2030-01-01", to: "2030-01-02" });
		await mut("apiCatalogExtra:removeRow", { table: "rooms", id: room2 });
		expect(((await qry("apiCatalogExtra:rooms", {})).rooms as unknown[]).length).toBe(1);
		await mut("apiCatalogExtra:removeRow", { table: "rooms", id: room2 }, { audit: 0, ok: false });

		await mut("apiClients:setTreating", { client: ids.a, practitioners: [ids.p] });
		const inUse = await mut(
			"apiCatalogExtra:removeRow",
			{ table: "practitioners", id: ids.p },
			{ audit: 0, ok: false },
		);
		expect(inUse.reason).toBe("in_use");
		await mut("apiClients:setTreating", { client: ids.a, practitioners: [] });
		await mut("apiCatalogExtra:removeRow", { table: "practitioners", id: ids.p });
		const device = id(
			await mut("apiResources:createDevice", { slug: "nfb", name: "NFB", kind: "other" }),
		);
		await mut("apiCatalogExtra:removeRow", { table: "devices", id: device });
	});
});
