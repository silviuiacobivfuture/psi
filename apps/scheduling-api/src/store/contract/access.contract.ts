import { describe, expect, it } from "vitest";
import { StoreConflict, StoreRefused } from "../types";
import type { ContractEnv, ContractSection } from "./env";

/**
 * The app, its team and its log, on every adapter: `apps`, `roles`, `members`, `audit` and `appsOf`. Ids the store
 * assigns are always taken from what `insert` returns. Events a wrapper records itself (audit-map.ts `recorded`) are
 * not written by `audit.insert` on Convex, so they are not asserted here; the mapping has its own tests.
 */
const now = (): number => Date.now();
const stamp = () => ({ createdAt: now(), updatedAt: now() });
const sorted = (xs: readonly string[]): string[] => [...xs].sort();
/** What the test itself wrote: Convex's own `ensureApp` also logs the app's creation, which is not under test. */
const written = <E extends { action: string }>(events: E[]): E[] =>
	events.filter((e) => e.action !== "app.create");
const GHOST = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";

export const accessContract: ContractSection = (env: () => ContractEnv) => {
	const store = () => env().store;

	describe("apps", () => {
		it("an app is read by its own id only, with its name, zone and status", async () => {
			const app = await env().newApp();
			const row = await store().c.apps.get(app, app);
			expect(row).toMatchObject({ id: app, app, status: "active", timeZone: "Europe/Bucharest" });
			expect(typeof row?.name).toBe("string");
			expect(await store().c.apps.get(app, GHOST)).toBeUndefined();
			expect(await store().c.apps.get("test-ct-nowhere", "test-ct-nowhere")).toBeUndefined();
			expect((await store().c.apps.list(app)).map((a) => a.id)).toEqual([app]);
		});

		it("a changed name, zone and status are read back; a missing app is not replaced", async () => {
			const app = await env().newApp();
			const row = await store().c.apps.get(app, app);
			if (row === undefined) throw new Error("no app");
			expect(
				await store().c.apps.replace({
					...row,
					name: "Renamed",
					timeZone: "Europe/London",
					status: "suspended",
					updatedAt: now(),
				}),
			).toBe(true);
			expect(await store().c.apps.get(app, app)).toMatchObject({
				name: "Renamed",
				timeZone: "Europe/London",
				status: "suspended",
			});
			expect(
				await store().c.apps.replace({ ...row, id: "test-ct-nowhere", app: "test-ct-nowhere" }),
			).toBe(false);
		});

		it("an app that exists is a conflict; a new one can be made, suspended, and taken back", async () => {
			const app = await env().newApp();
			const row = await store().c.apps.get(app, app);
			if (row === undefined) throw new Error("no app");
			await expect(store().c.apps.insert(row)).rejects.toBeInstanceOf(StoreConflict);
			const id = `test-ct-ins${Math.random().toString(36).slice(2, 8)}`;
			const made = await store().c.apps.insert({
				id,
				app: id,
				name: "Made",
				timeZone: "Europe/Bucharest",
				status: "suspended",
				...stamp(),
			});
			expect(made).toMatchObject({ id, name: "Made", status: "suspended" });
			expect(await store().c.apps.get(id, id)).toMatchObject({ status: "suspended" });
			expect(await store().c.apps.remove(id, id)).toBe(true);
			expect(await store().c.apps.get(id, id)).toBeUndefined();
			expect(await store().c.apps.remove(id, id)).toBe(false);
		});
	});

	describe("roles", () => {
		const role = (app: string, name: string, extra: object = {}) => ({
			id: `r-${Math.random().toString(36).slice(2, 10)}`,
			app,
			name,
			system: false,
			permissions: ["clients_view_all", "clients_view_own"],
			includes: [],
			...stamp(),
			...extra,
		});

		it("a role is made, read, listed, changed (renamed too) and removed", async () => {
			const app = await env().newApp();
			const made = await store().c.roles.insert(role(app, "Intern"));
			expect(made).toMatchObject({ name: "Intern", system: false, app });
			expect(made.permissions).toEqual(["clients_view_all", "clients_view_own"]);
			expect((await store().c.roles.get(app, made.id))?.name).toBe("Intern");
			expect((await store().c.roles.list(app)).map((r) => r.id)).toContain(made.id);
			expect(
				await store().c.roles.replace({
					...made,
					name: "Trainee",
					description: "Learning",
					permissions: ["rooms_view_all"],
				}),
			).toBe(true);
			expect(await store().c.roles.get(app, made.id)).toMatchObject({
				name: "Trainee",
				description: "Learning",
				permissions: ["rooms_view_all"],
			});
			expect(await store().c.roles.remove(app, made.id)).toBe(true);
			expect(await store().c.roles.get(app, made.id)).toBeUndefined();
			expect(await store().c.roles.remove(app, made.id)).toBe(false);
			expect(await store().c.roles.replace({ ...made, id: GHOST })).toBe(false);
		});

		it("a name is unique within the app, on insert and on rename", async () => {
			const app = await env().newApp();
			const a = await store().c.roles.insert(role(app, "Alpha"));
			const b = await store().c.roles.insert(role(app, "Beta"));
			await expect(store().c.roles.insert(role(app, "Alpha"))).rejects.toBeInstanceOf(
				StoreConflict,
			);
			await expect(store().c.roles.replace({ ...b, name: "Alpha" })).rejects.toBeInstanceOf(
				StoreConflict,
			);
			expect((await store().c.roles.get(app, a.id))?.name).toBe("Alpha");
			expect((await store().c.roles.get(app, b.id))?.name).toBe("Beta");
		});

		it("a seed role is adopted, not doubled: the app has one Owner whichever way it was made", async () => {
			const app = await env().newApp();
			const owner = await store().c.roles.insert(
				role(app, "Owner", { system: true, permissions: ["roles_view_all"] }),
			);
			expect(owner.system).toBe(true);
			const owners = (await store().c.roles.list(app)).filter((r) => r.name === "Owner");
			expect(owners.map((r) => r.id)).toEqual([owner.id]);
		});

		it("a role someone holds is not removed, and nothing is lost by the refusal", async () => {
			const app = await env().newApp();
			const held = await store().c.roles.insert(role(app, "Held"));
			await store().c.members.insert({
				id: "sub-holder",
				app,
				subject: "sub-holder",
				displayName: "Holder",
				roles: [held.id],
				coordinates: [],
				grants: [],
				denies: [],
				...stamp(),
			});
			await expect(store().c.roles.remove(app, held.id)).rejects.toBeInstanceOf(StoreRefused);
			expect(await store().c.roles.get(app, held.id)).toBeDefined();
		});

		it("roles of one app are not found in another", async () => {
			const one = await env().newApp();
			const two = await env().newApp();
			const made = await store().c.roles.insert(role(one, "Only here"));
			expect(await store().c.roles.get(two, made.id)).toBeUndefined();
			expect((await store().c.roles.list(two)).some((r) => r.name === "Only here")).toBe(false);
			expect(await store().c.roles.remove(two, made.id)).toBe(false);
		});
	});

	describe("members", () => {
		const member = (app: string, subject: string, extra: object = {}) => ({
			id: subject,
			app,
			subject,
			displayName: `Member ${subject}`,
			roles: [] as string[],
			coordinates: [] as string[],
			grants: [] as string[],
			denies: [] as string[],
			...stamp(),
			...extra,
		});
		const roleIn = async (app: string, name: string): Promise<string> =>
			(
				await store().c.roles.insert({
					id: `r-${Math.random().toString(36).slice(2, 10)}`,
					app,
					name,
					system: false,
					permissions: [],
					includes: [],
					...stamp(),
				})
			).id;

		it("a member with no role is a member: made, read, listed", async () => {
			const app = await env().newApp();
			const made = await store().c.members.insert(
				member(app, "sub-a", { email: "a@example.test" }),
			);
			expect(made).toMatchObject({
				id: "sub-a",
				subject: "sub-a",
				displayName: "Member sub-a",
				email: "a@example.test",
				roles: [],
			});
			expect(await store().c.members.get(app, "sub-a")).toMatchObject({ subject: "sub-a" });
			expect((await store().c.members.list(app)).map((m) => m.subject)).toEqual(["sub-a"]);
			expect(await store().c.members.get(app, "ghost")).toBeUndefined();
			await expect(store().c.members.insert(member(app, "sub-a"))).rejects.toBeInstanceOf(
				StoreConflict,
			);
		});

		it("roles, grants and denials are read back as the sets written", async () => {
			const app = await env().newApp();
			const r1 = await roleIn(app, "One");
			const r2 = await roleIn(app, "Two");
			await store().c.members.insert(
				member(app, "sub-b", {
					roles: [r1, r2],
					grants: ["people_view_all", "rooms_view_all"],
					denies: ["clients_view_own"],
				}),
			);
			const got = await store().c.members.get(app, "sub-b");
			expect(sorted(got?.roles ?? [])).toEqual(sorted([r1, r2]));
			expect(got?.grants).toEqual(["people_view_all", "rooms_view_all"]);
			expect(got?.denies).toEqual(["clients_view_own"]);
		});

		it("a change of profile, roles and overrides is replaced; a missing member is not", async () => {
			const app = await env().newApp();
			const r1 = await roleIn(app, "One");
			const r2 = await roleIn(app, "Two");
			const made = await store().c.members.insert(member(app, "sub-c", { roles: [r1] }));
			expect(
				await store().c.members.replace({
					...made,
					displayName: "Renamed",
					email: "c@example.test",
					roles: [r2],
					grants: ["rooms_view_all"],
					denies: ["devices_view_all"],
				}),
			).toBe(true);
			const got = await store().c.members.get(app, "sub-c");
			expect(got).toMatchObject({
				displayName: "Renamed",
				email: "c@example.test",
				roles: [r2],
				grants: ["rooms_view_all"],
				denies: ["devices_view_all"],
			});
			expect(await store().c.members.replace({ ...made, id: "ghost", subject: "ghost" })).toBe(
				false,
			);
			expect(await store().c.members.replace({ ...made, email: undefined, roles: [] })).toBe(true);
			expect((await store().c.members.get(app, "sub-c"))?.email).toBeUndefined();
		});

		it("an unknown role or coordinator is refused and nothing is written", async () => {
			const app = await env().newApp();
			await expect(
				store().c.members.insert(member(app, "sub-d", { roles: [GHOST] })),
			).rejects.toBeInstanceOf(StoreRefused);
			await expect(
				store().c.members.insert(member(app, "sub-d", { coordinates: [GHOST] })),
			).rejects.toBeInstanceOf(StoreRefused);
			expect(await store().c.members.get(app, "sub-d")).toBeUndefined();
		});

		it("coordinated practitioners are read back by their API ids", async () => {
			const app = await env().newApp();
			const person = await store().c.people.insert({
				id: "p-contract",
				app,
				displayName: "Coordinated",
				kind: "practitioner",
				active: true,
				external: false,
				...stamp(),
			});
			await store().c.members.insert(member(app, "sub-e", { coordinates: [person.id] }));
			expect((await store().c.members.get(app, "sub-e"))?.coordinates).toEqual([person.id]);
			const got = await store().c.members.get(app, "sub-e");
			if (got === undefined) throw new Error("no member");
			await store().c.members.replace({ ...got, coordinates: [] });
			expect((await store().c.members.get(app, "sub-e"))?.coordinates).toEqual([]);
		});

		it("a removed member is gone with their roles, and the role is free to go", async () => {
			const app = await env().newApp();
			const r1 = await roleIn(app, "One");
			await store().c.members.insert(member(app, "sub-f", { roles: [r1] }));
			expect(await store().c.members.remove(app, "sub-f")).toBe(true);
			expect(await store().c.members.get(app, "sub-f")).toBeUndefined();
			expect(await store().c.members.remove(app, "sub-f")).toBe(false);
			expect(await store().c.roles.remove(app, r1)).toBe(true);
		});

		it("members of one app are not members of another", async () => {
			const one = await env().newApp();
			const two = await env().newApp();
			await store().c.members.insert(member(one, "sub-g"));
			expect(await store().c.members.get(two, "sub-g")).toBeUndefined();
			expect(await store().c.members.list(two)).toEqual([]);
		});

		it("appsOf lists the apps a person belongs to with their roles there, and nothing for a stranger", async () => {
			const one = await env().newApp();
			const two = await env().newApp();
			const r1 = await roleIn(one, "One");
			const subject = `sub-h-${Math.random().toString(36).slice(2, 8)}`;
			await store().c.members.insert(member(one, subject, { roles: [r1] }));
			await store().c.members.insert(member(two, subject));
			const apps = await store().appsOf(subject);
			expect(apps.map((a) => a.app).sort()).toEqual([one, two].sort());
			expect(apps.find((a) => a.app === one)?.roles).toEqual([r1]);
			expect(apps.find((a) => a.app === two)?.roles).toEqual([]);
			expect(await store().appsOf("nobody-at-all")).toEqual([]);
		});
	});

	describe("audit", () => {
		const event = (
			app: string,
			action: string,
			target: { type: string; id: string },
			extra: object = {},
		) => ({
			id: `e-${Math.random().toString(36).slice(2, 10)}`,
			app,
			at: now(),
			actor: { subject: "sub-actor", kind: "person" as const },
			action,
			target,
			...extra,
		});

		it("an event is appended and read back in the API's words: action, actor, target", async () => {
			const app = await env().newApp();
			const saved = await store().c.audit.insert(
				event(app, "file.download", { type: "files", id: "f1" }),
			);
			const listed = written(await store().c.audit.list(app));
			expect(listed).toHaveLength(1);
			expect(listed[0]).toMatchObject({
				action: "file.download",
				actor: { subject: "sub-actor", kind: "person" },
				target: { type: "files", id: "f1" },
			});
			expect(Math.abs((listed[0]?.at ?? 0) - now())).toBeLessThan(10_000);
			expect(listed[0]?.id).toBe(saved.id);
		});

		it("a service actor and a clinical read of a client keep their kind and target", async () => {
			const app = await env().newApp();
			await store().c.audit.insert(
				event(
					app,
					"clinical.read",
					{ type: "client", id: "c1" },
					{
						actor: { subject: "service:cms", kind: "service" },
						detail: { via: "clients.list" },
					},
				),
			);
			const [one] = written(await store().c.audit.list(app));
			expect(one).toMatchObject({
				action: "clinical.read",
				actor: { subject: "service:cms", kind: "service" },
				target: { type: "client", id: "c1" },
			});
		});

		it("a filter on the action narrows the list, and one app never sees another's events", async () => {
			const one = await env().newApp();
			const two = await env().newApp();
			await store().c.audit.insert(event(one, "file.download", { type: "files", id: "f1" }));
			await store().c.audit.insert(event(one, "clinical.read", { type: "client", id: "c1" }));
			await store().c.audit.insert(event(two, "file.download", { type: "files", id: "f2" }));
			expect(
				(await store().c.audit.list(one, { eq: { action: "clinical.read" } })).map(
					(e) => e.target.id,
				),
			).toEqual(["c1"]);
			expect(
				written(await store().c.audit.list(one))
					.map((e) => e.target.id)
					.sort(),
			).toEqual(["c1", "f1"]);
			expect(written(await store().c.audit.list(two)).map((e) => e.target.id)).toEqual(["f2"]);
		});

		it("the log is append-only: an event is neither replaced nor removed", async () => {
			const app = await env().newApp();
			const saved = await store().c.audit.insert(
				event(app, "file.download", { type: "files", id: "f1" }),
			);
			await expect(store().c.audit.replace({ ...saved, action: "x.y" })).rejects.toBeInstanceOf(
				StoreRefused,
			);
			await expect(store().c.audit.remove(app, saved.id)).rejects.toBeInstanceOf(StoreRefused);
			expect(written(await store().c.audit.list(app))).toHaveLength(1);
		});
	});
};
