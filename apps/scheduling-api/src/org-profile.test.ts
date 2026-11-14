import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Populated } from "./testing/populate";
import type { Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const factories = await worldFactories();
const err = (r: Reply): { code: string; detail?: Record<string, unknown> } =>
	r.json.error as { code: string; detail?: Record<string, unknown> };

/** A whole profile: every field set, unicode included. */
const FULL = {
	legalName: "Psizone Centru de Psihologie SRL",
	cui: "RO12345678",
	address: {
		street: "Str. General Alexandru Cernat nr. 126",
		city: "Galați",
		county: "Galați",
		postalCode: "800001",
	},
	phones: [{ number: "0748 017 752" }, { number: "+40 752 466 792", label: "Recepție" }],
	email: "contact@example.test",
	website: "https://example.test",
	mapUrl: "https://maps.example.test/?q=Galați",
	logoUrl: "https://example.test/logo.svg",
	hours: [
		{
			day: "mon",
			spans: [
				{ open: "09:00", close: "13:00" },
				{ open: "14:00", close: "20:00" },
			],
		},
		{ day: "sat", spans: [{ open: "10:00", close: "14:00" }] },
	],
	hoursNote: "Sâmbăta doar cu programare",
};

describe.each(factories)("the organisation's contact profile, on the $name store", (factory) => {
	let w: Populated;
	const as = (who: string | null, method: string, body?: unknown, app = "psizone") =>
		w.call(who, method, `/v1/apps/${app}/org-profile`, body);
	const contact = (app = "psizone") =>
		w.callKey("psizone-web", "GET", `/v1/apps/${app}/book/contact`);
	beforeAll(async () => {
		w = await factory.create();
		await w.call("olga", "PUT", "/v1/apps/psizone/members/blank", {
			displayName: "Blank",
			roles: [],
			coordinates: [],
		});
	});
	afterAll(async () => {
		await factory.cleanup();
	});
	async function refused(run: () => Promise<Reply>, status: number, code?: string): Promise<Reply> {
		const before = await w.fingerprint();
		const reply = await run();
		expect(reply.status, JSON.stringify(reply.json)).toBe(status);
		if (code !== undefined) expect(err(reply).code).toBe(code);
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
		return reply;
	}
	const current = async (): Promise<number> => (await as("olga", "GET")).json.revision as number;

	it("an app with no profile answers revision 0 and no profile, and the public contact only the name", async () => {
		expect((await as("olga", "GET")).json).toEqual({ revision: 0 });
		const pub = await contact();
		expect(pub.status).toBe(200);
		expect(pub.json).toEqual({ name: expect.any(String) });
	});

	it("saves a whole profile from revision 0 and reads it back exactly, with who saved it", async () => {
		const saved = await as("olga", "PUT", { revision: 0, profile: FULL });
		expect(saved.status, JSON.stringify(saved.json)).toBe(200);
		expect(saved.json).toMatchObject({ revision: 1, updatedBy: "olga", profile: FULL });
		const read = await as("nina", "GET");
		expect(read.json).toMatchObject({ revision: 1, updatedBy: "olga", profile: FULL });
	});

	it("the public contact carries the profile, never who saved it", async () => {
		const pub = await contact();
		expect(pub.json.profile).toEqual(FULL);
		expect(pub.json).not.toHaveProperty("updatedBy");
		expect(pub.json).not.toHaveProperty("revision");
	});

	it("a save replaces the whole profile: a field left out is gone", async () => {
		const { cui: _cui, legalName: _legal, ...rest } = FULL;
		const saved = await as("olga", "PUT", { revision: await current(), profile: rest });
		expect(saved.status).toBe(200);
		const read = (await as("olga", "GET")).json.profile as Record<string, unknown>;
		expect(read).not.toHaveProperty("cui");
		expect(read).not.toHaveProperty("legalName");
		expect(read.phones).toEqual(FULL.phones);
	});

	it("the save is journaled with who and the NAMES of the fields that changed, never their values", async () => {
		const at = await current();
		await as("olga", "PUT", { revision: at, profile: { ...FULL, email: "office@example.test" } });
		const events = (await w.call("olga", "GET", "/v1/apps/psizone/audit?action=org.profile"))
			.json as {
			items: { actor: { subject: string }; action: string }[];
		};
		expect(events.items.length).toBeGreaterThan(0);
		expect(events.items[0]).toMatchObject({ action: "org.profile", actor: { subject: "olga" } });
		expect(JSON.stringify(events.items[0])).not.toContain("office@example.test");
	});

	it("a save from an older revision is a conflict naming the stored one, and writes nothing", async () => {
		const stored = await current();
		const r = await refused(
			() => as("olga", "PUT", { revision: stored - 1, profile: FULL }),
			409,
			"conflict",
		);
		expect(err(r).detail).toEqual({ reason: "stale", revision: stored });
	});

	it("two people saving from the same revision: one wins, the other is told", async () => {
		const stored = await current();
		const [a, b] = await Promise.all([
			as("olga", "PUT", { revision: stored, profile: { ...FULL, hoursNote: "a" } }),
			as("nina", "PUT", { revision: stored, profile: { ...FULL, hoursNote: "b" } }),
		]);
		expect([a.status, b.status].sort()).toEqual([200, 409]);
		expect((await as("olga", "GET")).json.revision).toBe(stored + 1);
	});

	describe("a profile the service refuses is refused whole, and nothing is written", () => {
		const bad: [string, Record<string, unknown>][] = [
			["no phones list", { phones: undefined }],
			["six phones", { phones: Array.from({ length: 6 }, () => ({ number: "0748017752" })) }],
			["a phone of letters", { phones: [{ number: "call us" }] }],
			["an e-mail that is not one", { email: "not-an-email" }],
			["a website over http", { website: "http://example.test" }],
			["a map link that is not a URL", { mapUrl: "https://" }],
			["a logo over a data URL", { logoUrl: "data:image/png;base64,AAAA" }],
			["a postal code of five digits", { address: { postalCode: "80000" } }],
			["a CUI with letters", { cui: "ABC123" }],
			["a day given twice", { hours: [FULL.hours[1], FULL.hours[1]] }],
			[
				"an unknown day",
				{ hours: [{ day: "funday", spans: [{ open: "09:00", close: "10:00" }] }] },
			],
			[
				"a day that closes before it opens",
				{ hours: [{ day: "tue", spans: [{ open: "18:00", close: "09:00" }] }] },
			],
			[
				"overlapping stretches",
				{
					hours: [
						{
							day: "tue",
							spans: [
								{ open: "09:00", close: "13:00" },
								{ open: "12:00", close: "15:00" },
							],
						},
					],
				},
			],
			["an hour of 24:00", { hours: [{ day: "tue", spans: [{ open: "09:00", close: "24:00" }] }] }],
			["an open day with no stretch", { hours: [{ day: "tue", spans: [] }] }],
			["an empty legal name", { legalName: "" }],
			["a note of 301 characters", { hoursNote: "n".repeat(301) }],
		];
		it.each(bad)("%s", async (_name, over) => {
			await refused(
				() => as("olga", "PUT", { revision: 0, profile: { ...FULL, ...over } }),
				400,
				"invalid",
			);
		});
		it("no revision", async () => {
			await refused(() => as("olga", "PUT", { profile: FULL }), 400, "invalid");
		});
	});

	describe("who may", () => {
		it("a person with no role in the app reads and writes nothing", async () => {
			await refused(() => as("blank", "GET"), 403, "forbidden");
			await refused(() => as("blank", "PUT", { revision: 0, profile: FULL }), 403, "forbidden");
		});
		it("reception and a therapist may not save it", async () => {
			await refused(() => as("rita", "PUT", { revision: 0, profile: FULL }), 403, "forbidden");
			await refused(() => as("dora", "PUT", { revision: 0, profile: FULL }), 403, "forbidden");
		});
		it("a stranger to the app is told it is not there", async () => {
			await refused(() => as("mallory", "GET"), 404, "not_found");
		});
		it("no sign-in is refused", async () => {
			await refused(() => as(null, "GET"), 401, "unauthenticated");
			await refused(() => as(null, "PUT", { revision: 0, profile: FULL }), 401, "unauthenticated");
		});
		it("looking at the app as someone else cannot save", async () => {
			await refused(
				() =>
					w.call(
						"olga",
						"PUT",
						"/v1/apps/psizone/org-profile",
						{ revision: 0, profile: FULL },
						{
							headers: { "x-psi-view-as": "role:owner" },
						},
					),
				403,
				"forbidden",
			);
		});
	});

	it("each app has its own profile: another app's save changes nothing here", async () => {
		const before = (await as("olga", "GET")).json;
		const saved = await as(
			"hugo",
			"PUT",
			{ revision: 0, profile: { phones: [], hours: [] } },
			"hemisync",
		);
		expect(saved.status).toBe(200);
		expect((await as("olga", "GET")).json).toEqual(before);
		expect((await as("hugo", "GET", undefined, "hemisync")).json.profile).toEqual({
			phones: [],
			hours: [],
		});
		expect((await contact()).json.profile).toEqual(before.profile);
	});

	it("a site's key reads only its own app's contact", async () => {
		const r = await contact("hemisync");
		expect(r.status).not.toBe(200);
		expect(r.json).not.toHaveProperty("profile");
	});
});
