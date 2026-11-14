import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { backendReady, runMutation } from "./admin";
import { actor, enc, harness, id } from "./api-harness";
import { callMutation, callQuery } from "./server";

/**
 * The batched client reads, against the local backend in a throwaway `test-many-…` app: `apiClients:getMany` (many
 * clients and their practitioners in one round trip) and `apiClients:treatingForMany` (the treating relation of a
 * whole team in one). Each is refused without the key and writes nothing (the harness checks every call). Synthetic data.
 */
if (!backendReady) console.warn("api-clients-many.test: no local backend; see README");

const { TENANT, mut, qry } = harness("many");
const OTHER = `${TENANT}-other`;

const Found = z.object({
	clients: z.array(
		z.object({
			client: z.object({ id: z.string(), name: z.string() }),
			treating: z.array(z.string()),
		}),
	),
});
const Treating = z.object({
	treating: z.array(z.object({ practitioner: z.string(), clients: z.array(z.string()) })),
});

describe.skipIf(!backendReady)("batched client reads", () => {
	const ids: Record<string, string> = {};
	const client = (name: string, phone: string) => ({
		name,
		kind: "adult",
		phone,
		consent: { contact: true, reminders: false },
		diagnosisEnc: enc,
	});

	beforeAll(async () => {
		if (!backendReady) return;
		for (const slug of [TENANT, OTHER])
			await runMutation(
				"clinicApps:ensureApp",
				{ slug, name: "T", kind: "clinic", defaultLocale: "ro", currency: "RON" },
				z.unknown(),
			);
		const people = await runMutation(
			"importPeople:upsertPractitioners",
			{
				tenant: TENANT,
				rows: [1, 2, 3].map((i) => ({
					legacyId: `therapists:${i}`,
					fingerprint: String(i),
					slug: `t-${i}`,
					displayName: `Test Therapist ${i}`,
					active: true,
				})),
			},
			z.array(z.object({ id: z.string() })),
		);
		people.forEach((p, i) => {
			ids[`p${i + 1}`] = p.id;
		});
		ids.a = id(
			await mut("apiClients:create", {
				client: client("Test Ana", "0700 000 101"),
				practitioners: [ids.p1, ids.p2],
			}),
		);
		ids.b = id(
			await mut("apiClients:create", {
				client: client("Test Bogdan", "0700 000 102"),
				practitioners: [ids.p1],
			}),
		);
		ids.c = id(await mut("apiClients:create", { client: client("Test Ștefan", "0700 000 103") }));
		ids.gone = id(
			await mut("apiClients:create", { client: client("Test Erased", "0700 000 104") }),
		);
		await mut("apiClients:standing", { client: ids.c, action: "archive" });
		const erased = z
			.object({ ok: z.boolean() })
			.parse(
				await callMutation("staffClients:eraseClient", { tenant: TENANT, client: ids.gone, actor }),
			);
		expect(erased.ok).toBe(true);
		const foreign = z.object({ id: z.string() }).parse(
			await callMutation("apiClients:create", {
				tenant: OTHER,
				actor,
				client: client("Test Foreign", "0700 000 105"),
			}),
		);
		ids.foreign = foreign.id;
	});
	afterAll(async () => {
		if (!backendReady) return;
		for (const tenant of [TENANT, OTHER])
			await runMutation("seed:dropFixture", { tenant }, z.unknown());
	});

	it("answers the clients asked for, in the order asked, each once, with their practitioners", async () => {
		const out = Found.parse(await qry("apiClients:getMany", { clients: [ids.b, ids.a, ids.b] }));
		expect(out.clients.map((c) => c.client.id)).toEqual([ids.b, ids.a]);
		expect(out.clients.map((c) => c.client.name)).toEqual(["Test Bogdan", "Test Ana"]);
		expect(out.clients[0]?.treating).toEqual([ids.p1]);
		expect([...(out.clients[1]?.treating ?? [])].sort()).toEqual([ids.p1, ids.p2].sort());
	});

	it("answers any standing, the same client as `get` does", async () => {
		const many = Found.parse(await qry("apiClients:getMany", { clients: [ids.c] }));
		const one = z
			.object({
				client: z.object({ id: z.string(), name: z.string() }),
				treating: z.array(z.string()),
			})
			.parse(await qry("apiClients:get", { client: ids.c }));
		expect(many.clients).toEqual([{ client: one.client, treating: one.treating }]);
		expect(many.clients[0]?.client.name).toBe("Test Ștefan");
	});

	it("leaves out an unknown id, a malformed id, an erased client and another app's client", async () => {
		const out = Found.parse(
			await qry("apiClients:getMany", {
				clients: [ids.gone, "not-an-id", ids.foreign, ids.a, ids.p1],
			}),
		);
		expect(out.clients.map((c) => c.client.id)).toEqual([ids.a]);
	});

	it("answers nothing for no ids", async () => {
		expect(Found.parse(await qry("apiClients:getMany", { clients: [] })).clients).toEqual([]);
	});

	it("takes 100 ids and refuses 101 (`invalid`), reading nothing", async () => {
		const hundred = [ids.a, ...Array.from({ length: 99 }, (_, i) => `missing-${i}`)];
		expect(Found.parse(await qry("apiClients:getMany", { clients: hundred })).clients).toHaveLength(
			1,
		);
		const refused = await qry(
			"apiClients:getMany",
			{ clients: [...hundred, "one-more"] },
			{ ok: false, same: true },
		);
		expect(refused.reason).toBe("invalid");
	});

	it("reads a whole team's treating relation in one call, a practitioner with none answering empty", async () => {
		const out = Treating.parse(
			await qry("apiClients:treatingForMany", { practitioners: [ids.p2, ids.p1, ids.p3, ids.p1] }),
		);
		expect(out.treating.map((t) => t.practitioner)).toEqual([ids.p2, ids.p1, ids.p3]);
		expect(out.treating[0]?.clients).toEqual([ids.a]);
		expect([...(out.treating[1]?.clients ?? [])].sort()).toEqual([ids.a, ids.b].sort());
		expect(out.treating[2]?.clients).toEqual([]);
	});

	it("agrees with asking practitioner by practitioner", async () => {
		const many = Treating.parse(
			await qry("apiClients:treatingForMany", { practitioners: [ids.p1, ids.p2, ids.p3] }),
		);
		for (const row of many.treating) {
			const one = z
				.object({ clients: z.array(z.string()) })
				.parse(await qry("apiClients:treatingFor", { practitioner: row.practitioner }));
			expect([...row.clients].sort()).toEqual([...one.clients].sort());
		}
	});

	it("leaves out an unknown or malformed practitioner, answers nothing for none, refuses 101", async () => {
		expect(
			Treating.parse(await qry("apiClients:treatingForMany", { practitioners: ["nope", ids.a] }))
				.treating,
		).toEqual([]);
		expect(
			Treating.parse(await qry("apiClients:treatingForMany", { practitioners: [] })).treating,
		).toEqual([]);
		const refused = await qry(
			"apiClients:treatingForMany",
			{ practitioners: Array.from({ length: 101 }, (_, i) => `p-${i}`) },
			{ ok: false, same: true },
		);
		expect(refused.reason).toBe("invalid");
	});

	it("another app's practitioners are not this app's", async () => {
		const out = await callQuery("apiClients:treatingForMany", {
			tenant: OTHER,
			practitioners: [ids.p1],
		});
		expect(Treating.parse(out).treating).toEqual([]);
	});
});
