import { objectLinks } from "@psi/scheduling-api/tuples";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SdkConsole, startSdkConsole } from "./sdk-harness";

/**
 * The "Fără client" group over the real service: a record of no client (what the import writes) is shown to the owner
 * and the administrator, who read records across the whole app, and refused to a therapist (her own clients only) and
 * to reception (no clinical scope), whose console never asks the service for it.
 */
const SUMMARY = "synthetic-orphan-summary-console";
let k: SdkConsole;
let orphan = "";

beforeAll(async () => {
	k = await startSdkConsole();
	const w = k.api.world;
	const now = w.clock.now;
	const row = await w.store.c.records.insert({
		id: `x${now.toString(36)}orphan`,
		app: "psizone",
		formId: w.ids.form,
		formVersion: 1,
		appointmentId: w.ids.a1,
		authorSubject: "system:import",
		// The service's own envelope for a record's answers (the field is a contract of ports/crypto).
		sealed: await w.deps.crypto.seal(
			"psizone",
			"formResponses.payload",
			JSON.stringify({ summary: SUMMARY }),
		),
		createdAt: now,
		updatedAt: now,
	});
	orphan = row.id;
	await w.deps.authz.write({ writes: await objectLinks(w.store, "psizone"), deletes: [] });
});
afterAll(async () => {
	await k.close();
});

describe("records of no client over the real service", () => {
	it.each(["olga", "nina"])("are listed under 'Fără client' and open for %s", async (who) => {
		const s = await k.as(who);
		const res = await s.get("/records");
		expect(res.status).toBe(200);
		const page = await res.text();
		expect(page).toContain("Fără client (1)");
		expect(page).toContain(`data-record="${orphan}"`);
		expect(page).not.toContain(`data-record="${k.api.world.ids.record}"`);
		const one = await s.get(`/records/${orphan}`);
		expect(one.status).toBe(200);
		expect(await one.text()).toContain(SUMMARY);
	});

	it("are not on the client's page of the visit they hang on", async () => {
		const s = await k.as("olga");
		const page = await (await s.get(`/clients/${k.api.world.ids.c1}/records`)).text();
		expect(page).not.toContain(orphan);
		expect(page).not.toContain(SUMMARY);
		expect((await s.get(`/clients/${k.api.world.ids.c1}/records/${orphan}`)).status).toBe(404);
	});

	it.each(["dora", "rita"])("are refused to %s, and nothing of them is shown", async (who) => {
		const s = await k.as(who);
		for (const path of ["/records", `/records/${orphan}`]) {
			const res = await s.get(path);
			expect(res.status).toBe(403);
			expect(await res.text()).not.toContain(SUMMARY);
		}
		expect(await (await s.get("/more")).text()).not.toContain('data-more="/records"');
	});
});
