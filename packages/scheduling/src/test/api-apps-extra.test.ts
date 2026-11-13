import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { backendReady, runMutation } from "./admin";
import { harness } from "./api-harness";
import { callQuery } from "./server";

/**
 * The app and team wrappers the staff API adds (apiAppsExtra): each refused without the key (and with a wrong one)
 * writing nothing, one audit event per write and none for a write that changes nothing. Throwaway `test-…` apps.
 */
if (!backendReady) console.warn("api-apps-extra.test: no local backend; see README");

const h = harness("apps");
const spare = harness("apps2");

describe.skipIf(!backendReady)("apps and members, over the server-keyed wrappers", () => {
	const ids: Record<string, string> = {};
	let practitioner = "";

	beforeAll(async () => {
		if (!backendReady) return;
		await h.mut("apiAppsExtra:createApp", { name: "Test App", timeZone: "Europe/Bucharest" });
		const people = await runMutation(
			"importPeople:upsertPractitioners",
			{
				tenant: h.TENANT,
				rows: [
					{
						legacyId: "therapists:1",
						fingerprint: "a",
						slug: "t-one",
						displayName: "Test Therapist One",
						active: true,
					},
				],
			},
			z.array(z.object({ id: z.string() })),
		);
		practitioner = people[0]?.id ?? "";
	});
	afterAll(async () => {
		if (!backendReady) return;
		for (const tenant of [h.TENANT, spare.TENANT])
			await runMutation("seed:dropFixture", { tenant }, z.unknown());
	});

	it("an app is made once, with its seed roles, and read back", async () => {
		const got = await h.qry("apiAppsExtra:getApp", {});
		expect(got).toMatchObject({
			id: h.TENANT,
			name: "Test App",
			timeZone: "Europe/Bucharest",
			active: true,
		});
		const roles = (await h.qry("apiAccess:roles", {})).roles as {
			name: string;
			seeded: boolean;
			id: string;
		}[];
		expect(roles.map((r) => r.name).sort()).toContain("Owner");
		expect(roles.every((r) => r.seeded)).toBe(true);
		for (const r of roles) ids[r.name] = r.id;
		await h.mut(
			"apiAppsExtra:createApp",
			{ name: "Again", timeZone: "Europe/Bucharest" },
			{ audit: 0, ok: false },
		);
	});

	it("an invalid app is refused, writing nothing", async () => {
		await spare.mut(
			"apiAppsExtra:createApp",
			{ name: "x", timeZone: "Nowhere/Land" },
			{ audit: 0, ok: false },
		);
		await spare.mut(
			"apiAppsExtra:createApp",
			{ name: "  ", timeZone: "Europe/Bucharest" },
			{ audit: 0, ok: false },
		);
		expect(await callQuery("apiAppsExtra:getApp", { tenant: spare.TENANT })).toMatchObject({
			ok: false,
		});
	});

	it("name, zone and status change in one audited write; the same again changes nothing", async () => {
		await h.mut("apiAppsExtra:updateApp", { name: "Test App B", active: false });
		const got = await h.qry("apiAppsExtra:getApp", {});
		expect(got).toMatchObject({ name: "Test App B", active: false });
		expect(Number(got.updatedAt)).toBeGreaterThanOrEqual(Number(got.createdAt));
		await h.mut("apiAppsExtra:updateApp", { name: "Test App B", active: false }, { audit: 0 });
		await h.mut("apiAppsExtra:updateApp", { timeZone: "Nowhere/Land" }, { audit: 0, ok: false });
		await h.mut("apiAppsExtra:updateApp", { active: true });
	});

	it("a role is renamed in one write; a taken name and a foreign key are refused", async () => {
		await h.mut("apiAppsExtra:saveRole", { role: ids.Volunteer, name: "Helper" });
		await h.mut("apiAppsExtra:saveRole", { role: ids.Volunteer, name: "Helper" }, { audit: 0 });
		await h.mut(
			"apiAppsExtra:saveRole",
			{ role: ids.Volunteer, name: "Owner" },
			{ audit: 0, ok: false },
		);
		await h.mut(
			"apiAppsExtra:saveRole",
			{ role: ids.Volunteer, permissions: ["nope_all"] },
			{ audit: 0, ok: false },
		);
		await h.mut(
			"apiAppsExtra:saveRole",
			{ role: "x".repeat(32), name: "Z" },
			{ audit: 0, ok: false },
		);
	});

	it("a member: profile, roles and coordinators in one write; nothing for an unchanged one", async () => {
		const base = {
			subject: "sub-member",
			displayName: "Member One",
			roles: [ids.Owner],
			coordinators: [practitioner],
		};
		await h.mut(
			"apiMembersExtra:putMember",
			{ ...base, roles: ["x".repeat(32)] },
			{ audit: 0, ok: false },
		);
		await h.mut(
			"apiMembersExtra:putMember",
			{ ...base, coordinators: ["x".repeat(32)] },
			{ audit: 0, ok: false },
		);
		await h.mut(
			"apiMembersExtra:putMember",
			{ ...base, displayName: "  " },
			{ audit: 0, ok: false },
		);
		expect(await h.mut("apiMembersExtra:putMember", base)).toMatchObject({
			created: true,
			changed: true,
		});
		await h.mut("apiMembersExtra:putMember", base, { audit: 0 });
		await h.mut("apiMembersExtra:putMember", {
			...base,
			email: "m@example.test",
			roles: [ids.Owner, ids.Admin],
			coordinators: [],
		});
		const got = (await h.qry("apiMembersExtra:member", { subject: "sub-member" })).member as Record<
			string,
			unknown
		>;
		expect(got).toMatchObject({
			displayName: "Member One",
			email: "m@example.test",
			coordinates: [],
		});
		expect((got.roles as string[]).sort()).toEqual([ids.Owner, ids.Admin].sort());
		await h.mut("apiMembersExtra:putMember", {
			subject: "sub-blank",
			displayName: "Blank",
			roles: [],
			coordinators: [],
		});
		const all = (await h.qry("apiMembersExtra:members", {})).members as { subject: string }[];
		expect(all.map((m) => m.subject).sort()).toEqual(["sub-blank", "sub-member"]);
		expect(
			await callQuery("apiMembersExtra:member", { tenant: h.TENANT, subject: "ghost" }),
		).toMatchObject({ ok: false });
	});

	it("overrides are replaced as a set; a key both granted and denied, an unknown key, and a stranger are refused", async () => {
		await h.mut("apiMembersExtra:setOverrides", {
			subject: "sub-member",
			grants: ["people_view_all"],
			denies: ["clients_view_own"],
		});
		await h.mut(
			"apiMembersExtra:setOverrides",
			{ subject: "sub-member", grants: ["people_view_all"], denies: ["clients_view_own"] },
			{ audit: 0 },
		);
		await h.mut(
			"apiMembersExtra:setOverrides",
			{ subject: "sub-member", grants: ["people_view_all"], denies: ["people_view_all"] },
			{ audit: 0, ok: false },
		);
		await h.mut(
			"apiMembersExtra:setOverrides",
			{ subject: "sub-member", grants: ["nope"], denies: [] },
			{ audit: 0, ok: false },
		);
		await h.mut(
			"apiMembersExtra:setOverrides",
			{ subject: "ghost", grants: [], denies: [] },
			{ audit: 0, ok: false },
		);
		const got = (await h.qry("apiMembersExtra:member", { subject: "sub-member" })).member as Record<
			string,
			unknown
		>;
		expect(got).toMatchObject({ grants: ["people_view_all"], denies: ["clients_view_own"] });
		await h.mut("apiMembersExtra:setOverrides", { subject: "sub-member", grants: [], denies: [] });
		const cleared = (await h.qry("apiMembersExtra:member", { subject: "sub-member" }))
			.member as Record<string, unknown>;
		expect(cleared).toMatchObject({ grants: [], denies: [] });
	});

	it("the apps a person is in, with their roles there, and only where they are a member", async () => {
		const out = z
			.object({ apps: z.array(z.object({ app: z.string(), roles: z.array(z.string()) })) })
			.parse(await callQuery("apiMembersExtra:appsOf", { subject: "sub-member" }));
		expect(out.apps).toEqual([
			{ app: h.TENANT, roles: expect.arrayContaining([ids.Owner, ids.Admin]) },
		]);
		await expect(
			callQuery("apiMembersExtra:appsOf", { subject: "sub-member" }, null),
		).rejects.toThrow();
		expect(
			z
				.object({ apps: z.array(z.unknown()) })
				.parse(await callQuery("apiMembersExtra:appsOf", { subject: "nobody" })).apps,
		).toEqual([]);
	});

	it("removing a member takes the profile, roles and overrides with it; a role in use stays", async () => {
		await h.mut("apiAccess:deleteRole", { role: ids.Owner }, { audit: 0, ok: false });
		await h.mut("apiMembersExtra:removeMember", { subject: "sub-member" });
		await h.mut("apiMembersExtra:removeMember", { subject: "sub-member" }, { audit: 0, ok: false });
		const roles = (await h.qry("apiAccess:roles", {})).roles as { members: string[] }[];
		expect(roles.flatMap((r) => r.members)).toEqual([]);
	});

	it("an app nothing was done in is taken back; one with data is refused and keeps everything", async () => {
		await h.mut("apiAppsExtra:removeApp", {}, { audit: 0, ok: false });
		await spare.mut("apiAppsExtra:createApp", { name: "Spare", timeZone: "Europe/Bucharest" });
		await spare.mut("apiAppsExtra:removeApp", {});
		expect(await callQuery("apiAppsExtra:getApp", { tenant: spare.TENANT })).toMatchObject({
			ok: false,
		});
		expect(((await spare.qry("apiAccess:roles", {})).roles as unknown[]).length).toBe(0);
	});
});
