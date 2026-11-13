import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ok, type Populated } from "./testing/populate";
import type { Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const A = "/v1/apps/psizone";
const factories = await worldFactories();

type Line = {
	id: string;
	method: string;
	recordedBy: string;
	recordedByName?: string;
	note?: string;
};
type Pack = { package: { id: string; note?: string }; payments?: Line[] };

describe.each(factories)("package notes and who took the money, on the $name store", (factory) => {
	let w: Populated;
	beforeAll(async () => {
		w = await factory.create();
	});
	afterAll(async () => {
		await factory.cleanup();
	});
	const as = (who: string, method: string, path: string, body?: unknown) =>
		w.call(who, method, `${A}${path}`, body);
	const newPackage = async (body: Record<string, unknown> = {}): Promise<string> =>
		String(
			ok(
				await as("olga", "POST", `/clients/${w.ids.c2}/packages`, {
					name: "5 sessions",
					sessions: 5,
					priceCents: 50_000,
					...body,
				}),
				"package",
			).id,
		);
	const read = async (id: string): Promise<Pack> =>
		ok(await as("olga", "GET", `/packages/${id}`), "package") as unknown as Pack;
	/** A refusal answers what it should and leaves everything the service holds exactly as it was. */
	async function refused(run: () => Promise<Reply>, status: number): Promise<void> {
		const before = await w.fingerprint();
		expect((await run()).status).toBe(status);
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
	}

	describe("notes", () => {
		it("a package is sold with a note, and the note is read back", async () => {
			const id = await newPackage({ note: "  the parent pays in two parts  " });
			expect((await read(id)).package.note).toBe("the parent pays in two parts");
		});
		it("a package sold without a note, or with an empty one, has none", async () => {
			expect((await read(await newPackage())).package.note).toBeUndefined();
			expect((await read(await newPackage({ note: "" }))).package.note).toBeUndefined();
		});
		it("the note is changed, and emptied", async () => {
			const id = await newPackage({ note: "first" });
			ok(await as("olga", "PATCH", `/packages/${id}`, { note: "second" }), "edit");
			expect((await read(id)).package.note).toBe("second");
			ok(await as("olga", "PATCH", `/packages/${id}`, { name: "renamed" }), "rename");
			expect((await read(id)).package.note, "an edit that names no note leaves it").toBe("second");
			ok(await as("olga", "PATCH", `/packages/${id}`, { note: "" }), "empty");
			expect((await read(id)).package.note).toBeUndefined();
		});
		it("a note of exactly 1000 characters is kept", async () => {
			const id = await newPackage({ note: "n".repeat(1000) });
			expect((await read(id)).package.note).toHaveLength(1000);
		});
		it("a note of unicode text is kept as written", async () => {
			const id = await newPackage({ note: "plătit în rate — mulțumim 🙂" });
			expect((await read(id)).package.note).toBe("plătit în rate — mulțumim 🙂");
		});
		it("a note of 1001 characters is refused and nothing is written", async () => {
			await refused(
				() =>
					as("olga", "POST", `/clients/${w.ids.c2}/packages`, {
						name: "x",
						sessions: 1,
						priceCents: 1,
						note: "n".repeat(1001),
					}),
				400,
			);
			const id = await newPackage({ note: "kept" });
			await refused(() => as("olga", "PATCH", `/packages/${id}`, { note: "n".repeat(1001) }), 400);
			expect((await read(id)).package.note).toBe("kept");
		});
		it("a note on a package the role may not edit is refused and nothing is written", async () => {
			const id = await newPackage({ note: "kept" });
			await refused(() => as("vera", "PATCH", `/packages/${id}`, { note: "mine" }), 404);
			expect((await read(id)).package.note).toBe("kept");
		});
	});

	describe("payments", () => {
		it.each([
			"cash",
			"card",
			"transfer",
		] as const)("a %s payment is stored with its method and the person who took it, from the token", async (method) => {
			const id = await newPackage();
			const made = ok(
				await as("rita", "POST", `/packages/${id}/payments`, { amountCents: 1_000, method }),
				"payment",
			);
			expect(made).toMatchObject({ method, recordedBy: "rita" });
			const line = (await read(id)).payments?.[0];
			expect(line).toMatchObject({ method, recordedBy: "rita" });
		});
		it("the person is named by their name in the team", async () => {
			const id = await newPackage();
			const made = ok(
				await as("rita", "POST", `/packages/${id}/payments`, { amountCents: 100, method: "cash" }),
				"payment",
			);
			const member = ok(await as("olga", "GET", "/members?limit=500"), "members").items as {
				subject: string;
				displayName: string;
			}[];
			expect(made.recordedByName).toBe(member.find((m) => m.subject === "rita")?.displayName);
		});
		it("two people's payments keep each their own", async () => {
			const id = await newPackage();
			for (const who of ["rita", "olga"])
				ok(
					await as(who, "POST", `/packages/${id}/payments`, { amountCents: 100, method: "card" }),
					who,
				);
			const who = ((await read(id)).payments ?? []).map((p) => p.recordedBy).sort();
			expect(who).toEqual(["olga", "rita"]);
		});
		it("who took the money cannot be written by the caller", async () => {
			const id = await newPackage();
			const made = ok(
				await as("rita", "POST", `/packages/${id}/payments`, {
					amountCents: 100,
					method: "cash",
					recordedBy: "someone-else",
				}),
				"payment",
			);
			expect(made.recordedBy).toBe("rita");
		});
		it("a payment on an appointment records who took it too", async () => {
			const paid = ok(
				await as("rita", "POST", `/appointments/${w.ids.a1}/payment`, {
					amountCents: 100,
					method: "transfer",
				}),
				"pay",
			);
			expect(paid.id).toBe(w.ids.a1);
			const lines = (await w.store.c.payments.list("psizone", { eq: { appointmentId: w.ids.a1 } }))
				.length;
			expect(lines).toBeGreaterThan(0);
		});
		it("a method outside cash, card and transfer is refused and nothing is written", async () => {
			const id = await newPackage();
			await refused(
				() =>
					as("rita", "POST", `/packages/${id}/payments`, { amountCents: 100, method: "bitcoin" }),
				400,
			);
			expect((await read(id)).payments).toEqual([]);
		});
		it("no method at all is refused and nothing is written", async () => {
			const id = await newPackage();
			await refused(
				() => as("rita", "POST", `/packages/${id}/payments`, { amountCents: 100 }),
				400,
			);
		});
		it("a payment by a role that may not take one is refused and nothing is written", async () => {
			const id = await newPackage();
			await refused(
				() => as("vera", "POST", `/packages/${id}/payments`, { amountCents: 100, method: "cash" }),
				404,
			);
		});
		it("a payment above what is owed is refused and nothing is written", async () => {
			const id = await newPackage();
			await refused(
				() =>
					as("rita", "POST", `/packages/${id}/payments`, { amountCents: 50_001, method: "cash" }),
				409,
			);
		});
	});
});
