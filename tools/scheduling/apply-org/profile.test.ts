import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseRoomsSeed } from "@psi/scheduling/clinic";
import { createWorld, type Populated } from "@psi/scheduling-api/testing-populate";
import { beforeEach, describe, expect, it } from "vitest";
import { ROOMS_ACTOR } from "./apply";
import { applyProfile, planProfile } from "./profile";
import { profileLine } from "./report";
import { parseOrgSeed } from "./seed";

const seedFile = (name: string): unknown =>
	JSON.parse(
		readFileSync(createRequire(import.meta.url).resolve(`@psi/scheduling/seed/${name}`), "utf8"),
	);
const ROOMS = parseRoomsSeed(seedFile("psizone-rooms.json"));
const APP = "psizone";
const seed = () => {
	const profile = parseOrgSeed(seedFile("psizone-org.json"), ROOMS).profile;
	if (profile === undefined) throw new Error("the seed has no profile");
	return profile;
};

describe("the Psizone seed's contact profile", () => {
	it("is what psizone.ro publishes, and nothing the site does not state", () => {
		expect(seed()).toEqual({
			address: {
				street: "Str. General Alexandru Cernat nr. 126",
				city: "Galați",
				county: "Galați",
			},
			phones: [{ number: "0748 017 752" }, { number: "0752 466 792" }],
			website: "https://psizone.ro",
			hours: [],
		});
	});
	it("a profile the service would refuse is refused by the seed", () => {
		const bad = structuredClone(seedFile("psizone-org.json")) as Record<string, unknown>;
		bad.profile = { phones: [{ number: "letters" }], hours: [] };
		expect(() => parseOrgSeed(bad, ROOMS)).toThrow(/the profile is not one the service keeps/);
	});
});

describe("planProfile: the seed fills only what the owners left unset", () => {
	const stored = (profile: unknown, revision = 3) => ({ revision, body: JSON.stringify(profile) });
	it("nothing stored: the whole seed, from revision 0", () => {
		expect(planProfile(seed(), undefined)).toEqual({
			kind: "save",
			revision: 0,
			next: seed(),
			fields: ["address", "phones", "website"],
		});
	});
	it("the owners' phones, e-mail and street stay; the seed adds the city, county and website", () => {
		const held = {
			phones: [{ number: "0741 000 111", label: "Recepție" }],
			email: "office@example.test",
			address: { street: "Str. Domnească nr. 1" },
			hours: [{ day: "mon", spans: [{ open: "09:00", close: "17:00" }] }],
		};
		const step = planProfile(seed(), stored(held));
		if (step.kind !== "save") throw new Error("expected a save");
		expect(step.revision).toBe(3);
		expect(step.fields).toEqual(["address", "website"]);
		expect(step.next).toEqual({
			...held,
			address: { street: "Str. Domnească nr. 1", city: "Galați", county: "Galați" },
			website: "https://psizone.ro",
		});
	});
	it("a profile that already has every field the seed has is kept", () => {
		expect(planProfile(seed(), stored(seed(), 7))).toEqual({ kind: "keep", revision: 7 });
	});
});

describe("applyProfile, against the service's store", () => {
	let w: Populated;
	beforeEach(async () => {
		w = await createWorld();
	});
	const run = (dryRun: boolean) =>
		applyProfile({
			store: w.store,
			app: APP,
			seed: seed(),
			actor: ROOMS_ACTOR,
			dryRun,
			now: 1_000,
		});

	it("a dry run says what it would fill and writes nothing, not even the journal", async () => {
		const before = await w.fingerprint();
		const step = await run(true);
		expect(profileLine(step, true)).toBe("contact profile: would fill address, phones, website");
		expect(await w.fingerprint()).toBe(before);
	});

	it("a run saves the profile the service then answers, journaled as org.profile with field names only", async () => {
		const step = await run(false);
		expect(profileLine(step, false)).toBe(
			"contact profile: filled at revision 1: address, phones, website",
		);
		const read = await w.call("olga", "GET", `/v1/apps/${APP}/org-profile`);
		expect(read.json).toMatchObject({ revision: 1, updatedBy: ROOMS_ACTOR, profile: seed() });
		const events = (await w.call("olga", "GET", `/v1/apps/${APP}/audit?action=org.profile`))
			.json as {
			items: { actor: { subject: string }; detail?: Record<string, unknown> }[];
		};
		expect(events.items).toHaveLength(1);
		expect(events.items[0]?.actor.subject).toBe(ROOMS_ACTOR);
		expect(events.items[0]?.detail).toEqual({
			revision: 1,
			fields: ["address", "phones", "website"],
		});
		expect(JSON.stringify(events.items[0])).not.toContain("0748");
	});

	it("a second run writes nothing", async () => {
		await run(false);
		const before = await w.fingerprint();
		const again = await run(false);
		expect(again).toEqual({ kind: "keep", revision: 1 });
		expect(await w.fingerprint()).toBe(before);
	});

	it("what the owners saved in the console is never overwritten", async () => {
		const mine = {
			phones: [{ number: "0741 000 111" }],
			website: "https://example.test",
			hours: [],
		};
		await w.call("olga", "PUT", `/v1/apps/${APP}/org-profile`, { revision: 0, profile: mine });
		await run(false);
		const read = (await w.call("olga", "GET", `/v1/apps/${APP}/org-profile`)).json;
		expect(read.profile).toEqual({ ...mine, address: seed().address });
	});
});
