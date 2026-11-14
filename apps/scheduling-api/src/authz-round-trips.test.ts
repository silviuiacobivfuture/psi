import { beforeAll, describe, expect, it } from "vitest";
import { createAccess } from "./authz/access";
import type { AuthzPort } from "./authz/port";
import { createApp } from "./http/app";
import { createWorld, type Populated } from "./testing/populate";
import { scaleUp } from "./testing/scale";

/**
 * How many times one request goes to OpenFGA (each Check, BatchCheck and ListObjects is a round trip), on the clinic
 * at its real size: a list asks per question, never per row. The service is the world's own, over a port that counts
 * what reaches the real (in-memory) adapter.
 */
let w: Populated;
const trips = { check: 0, batch: 0, list: 0 };
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
	w = await createWorld();
	await scaleUp(w, 1);
	const inner = w.deps.authz;
	const counted: AuthzPort = {
		check(user, relation, object) {
			trips.check += 1;
			return inner.check(user, relation, object);
		},
		checkMany(questions) {
			trips.batch += 1;
			return inner.checkMany(questions);
		},
		listObjects(user, relation, type) {
			trips.list += 1;
			return inner.listObjects(user, relation, type);
		},
		write: (change) => inner.write(change),
	};
	const store = w.deps.store;
	app = createApp({
		...w.deps,
		authz: counted,
		access: createAccess(
			counted,
			async (a, subject) => new Set((await store.c.members.get(a, subject))?.denies ?? []),
		),
	});
}, 120_000);

async function count(as: string, path: string) {
	trips.check = 0;
	trips.batch = 0;
	trips.list = 0;
	const res = await app.request(`/v1/apps/psizone${path}`, {
		headers: { authorization: `Bearer ${await w.issuer.mint(as)}` },
	});
	expect(res.status, await res.clone().text()).toBe(200);
	const body = (await res.json()) as { items?: unknown[] };
	return {
		...trips,
		total: trips.check + trips.batch + trips.list,
		items: body.items?.length ?? 0,
	};
}

describe("one request goes to OpenFGA once per question, whatever the list holds", () => {
	it("a therapist's client list with its field groups: one ListObjects for the reach all groups share", async () => {
		const r = await count("dora", "/clients?fields=groups&limit=100");
		expect(r.items).toBeGreaterThan(0);
		expect(r.list).toBe(1);
		expect(r.total).toBeLessThanOrEqual(8);
	});

	it("the owner's client list of 100: no question per row", async () => {
		const r = await count("olga", "/clients?fields=groups&limit=100");
		expect(r.items).toBe(100);
		expect(r.list).toBe(0);
		expect(r.total).toBeLessThanOrEqual(8);
	});

	it("a week of the calendar: no question per appointment", async () => {
		const r = await count("olga", "/calendar?from=1763251200000&to=1763856000000");
		expect(r.total).toBeLessThanOrEqual(12);
	});
});
