import { MemberDetail } from "@psi/scheduling-sdk/contract";
import { beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod/v4";
import { createWorld, type Populated } from "./testing/populate";

const A = "/v1/apps/psizone";
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});
const as = (who: string, method: string, path: string, body?: unknown) =>
	w.call(who, method, `${A}${path}`, body);
/** The id the store gave a seed role. */
const roleId = (name: string): string => w.ids.roles[name] ?? name;
const tuples = (): string[] => w.authz.tuples().map((t) => `${t.user}|${t.relation}|${t.object}`);

const detail = async (subject: string): Promise<z.output<typeof MemberDetail>> => {
	const r = await as("olga", "GET", `/members/${subject}`);
	expect(r.status, subject).toBe(200);
	return MemberDetail.parse(r.json);
};
/** The relations (`key_scope`) a member effectively holds, as the editor reads them. */
const held = async (subject: string): Promise<Set<string>> =>
	new Set(
		(await detail(subject)).matrix.flatMap((r) =>
			r.held.map((s) =>
				r.fieldGroup === undefined
					? `${r.key}_${s}`
					: `${r.resource}_${r.action}_${s}_${r.fieldGroup}`,
			),
		),
	);
const permissionsOf = async (role: string): Promise<Set<string>> =>
	new Set(
		((await as("olga", "GET", `/roles/${role}`)).json.role as { permissions: string[] })
			.permissions,
	);
const put = (subject: string, roles: string[]) =>
	as("olga", "PUT", `/members/${subject}`, {
		displayName: `${subject} test`,
		roles,
		coordinates: [],
	});
/** The events of an action about one member (the populated world already put several members in). */
const auditOf = async (action: string, subject: string) =>
	(
		(await as("olga", "GET", "/audit?limit=500")).json.items as {
			action: string;
			target: { type: string; id: string };
			detail?: { changes?: Record<string, { from: string; to: string }> };
		}[]
	).filter((e) => e.action === action && e.target.id === subject);

describe("one member, as their editor reads them", () => {
	it("answers the roles, grants, denials, linked calendars and the whole catalogue", async () => {
		const d = await detail("dora");
		expect(d.roles).toEqual([roleId("therapist")]);
		expect(d.grant).toEqual([]);
		expect(d.deny).toEqual([]);
		expect(d.calendars).toEqual([w.ids.dora]);
		expect(d.matrix.length).toBeGreaterThan(100);
		expect(d.matrix.find((r) => r.key === "clients_view")?.held).toEqual(["own"]);
		expect((await detail("rita")).calendars).toEqual([]);
	});

	it("is refused to someone who may not see the team, and is not found for a stranger", async () => {
		expect((await as("vera", "GET", "/members/rita")).status).toBe(403);
		expect((await as("olga", "GET", "/members/nobody")).status).toBe(404);
	});
});

describe("several roles at once", () => {
	it("holds the union of every role's permissions", async () => {
		const volunteer = await permissionsOf(roleId("volunteer"));
		const accountant = await permissionsOf(roleId("accountant"));
		await put("vera", [roleId("volunteer"), roleId("accountant")]);
		const mine = await held("vera");
		for (const p of [...volunteer, ...accountant]) expect(mine.has(p), p).toBe(true);
		expect(tuples()).toContain(`user:vera|member|sched_role:${roleId("volunteer")}`);
		expect(tuples()).toContain(`user:vera|member|sched_role:${roleId("accountant")}`);
	});

	it("dropping one role keeps the other's permissions, the shared ones included", async () => {
		const volunteer = await permissionsOf(roleId("volunteer"));
		const accountant = await permissionsOf(roleId("accountant"));
		const onlyVolunteer = [...volunteer].filter((p) => !accountant.has(p));
		expect(onlyVolunteer.length).toBeGreaterThan(0);
		await put("vera", [roleId("volunteer"), roleId("accountant")]);
		await put("vera", [roleId("accountant")]);
		const mine = await held("vera");
		for (const p of accountant) expect(mine.has(p), p).toBe(true);
		for (const p of onlyVolunteer) expect(mine.has(p), p).toBe(false);
		expect(tuples()).not.toContain(`user:vera|member|sched_role:${roleId("volunteer")}`);
		expect(tuples()).toContain(`user:vera|member|sched_role:${roleId("accountant")}`);
		expect(tuples()).toContain("user:vera|member|sched_app:psizone");
	});

	it("with no role at all the person stays a member who holds nothing", async () => {
		await put("vera", []);
		expect(await held("vera")).toEqual(new Set());
		expect(tuples()).toContain("user:vera|member|sched_app:psizone");
	});
});

describe("individual grants and denials", () => {
	it("a denial beats a grant of the same permission", async () => {
		await as("olga", "PUT", "/members/vera/overrides", {
			grant: ["people_view_all"],
			deny: ["people_view_all"],
		});
		expect((await as("vera", "GET", "/people")).status).toBe(403);
		expect((await held("vera")).has("people_view_all")).toBe(false);
		const d = await detail("vera");
		expect(d.grant).toEqual(["people_view_all"]);
		expect(d.deny).toEqual(["people_view_all"]);
	});

	it("a denial beats a role too, and the effective matrix says so", async () => {
		expect((await held("rita")).has("clients_view_all")).toBe(true);
		await as("olga", "PUT", "/members/rita/overrides", { grant: [], deny: ["clients_view_all"] });
		expect((await held("rita")).has("clients_view_all")).toBe(false);
	});

	it("a grant adds to the roles and shows in the effective matrix", async () => {
		expect((await held("vera")).has("people_view_all")).toBe(false);
		await as("olga", "PUT", "/members/vera/overrides", { grant: ["people_view_all"], deny: [] });
		expect((await held("vera")).has("people_view_all")).toBe(true);
	});

	it("changing the roles keeps the grants and denials", async () => {
		await as("olga", "PUT", "/members/vera/overrides", {
			grant: ["people_view_all"],
			deny: ["roster_view_all"],
		});
		await put("vera", [roleId("accountant")]);
		const d = await detail("vera");
		expect(d.grant).toEqual(["people_view_all"]);
		expect(d.deny).toEqual(["roster_view_all"]);
	});
});

describe("who may change the team: every refusal writes nothing", () => {
	/** A role that may see and edit the team, but neither add to it nor remove from it. */
	const editorOnly = async (): Promise<void> => {
		const role = (await as("olga", "POST", "/roles", { name: "Team editor" })).json.id as string;
		await as("olga", "PUT", `/roles/${role}/permissions`, {
			permissions: ["members_view_all", "members_edit_all"],
		});
		await put("vera", [role]);
	};

	it("someone without members_edit changes nothing", async () => {
		for (const [method, path, body] of [
			["PUT", "/members/vera", { displayName: "x", roles: [], coordinates: [] }],
			["PUT", "/members/vera/overrides", { grant: ["people_view_all"], deny: [] }],
			["DELETE", "/members/vera", undefined],
		] as const) {
			const before = await w.fingerprint();
			expect((await as("rita", method, path, body)).status, `${method} ${path}`).toBe(403);
			expect(await w.fingerprint()).toBe(before);
		}
	});

	it("members_edit without members_create cannot add a person", async () => {
		await editorOnly();
		const before = await w.fingerprint();
		const r = await as("vera", "PUT", "/members/newcomer", {
			displayName: "N",
			roles: [],
			coordinates: [],
		});
		expect(r.status).toBe(403);
		expect(await w.fingerprint()).toBe(before);
	});

	it("members_edit without members_delete cannot remove a person, but may change their roles", async () => {
		await editorOnly();
		const before = await w.fingerprint();
		expect((await as("vera", "DELETE", "/members/rita")).status).toBe(403);
		expect(await w.fingerprint()).toBe(before);
		const changed = await as("vera", "PUT", "/members/rita", {
			displayName: "rita test",
			roles: [roleId("reception"), roleId("coordinator")],
			coordinates: [],
		});
		expect(changed.status).toBe(200);
		expect(changed.json.roles).toEqual([roleId("reception"), roleId("coordinator")]);
	});

	it("an unknown role among several refuses the whole change", async () => {
		const before = await w.fingerprint();
		expect((await put("rita", [roleId("coordinator"), "ghost"])).status).toBe(400);
		expect(await w.fingerprint()).toBe(before);
	});
});

describe("the journal says what changed", () => {
	it("a role change keeps the roles before and after", async () => {
		await put("rita", [roleId("reception"), roleId("coordinator")]);
		const events = await auditOf("member.put", "rita");
		// the populated world added her first (from no role); the change is the other event
		expect(events.map((e) => e.detail?.changes?.roles)).toContainEqual({
			from: roleId("reception"),
			to: [roleId("reception"), roleId("coordinator")].sort().join(","),
		});
		expect(events.every((e) => e.target.type === "members")).toBe(true);
		const change = events.find((e) => e.detail?.changes?.roles?.from !== "");
		expect(change?.detail?.changes?.displayName).toBeUndefined();
	});

	it("grants and denials keep what they were and what they became", async () => {
		await as("olga", "PUT", "/members/vera/overrides", {
			grant: ["people_view_all"],
			deny: ["roster_view_all"],
		});
		const [e] = await auditOf("member.overrides", "vera");
		expect(e?.detail?.changes).toEqual({
			grants: { from: "", to: "people_view_all" },
			denies: { from: "", to: "roster_view_all" },
		});
	});

	it("a removal keeps the name and the roles of who left", async () => {
		await as("olga", "DELETE", "/members/rita");
		const [e] = await auditOf("member.remove", "rita");
		expect(e?.detail?.changes).toEqual({
			displayName: { from: "rita test", to: "" },
			roles: { from: roleId("reception"), to: "" },
		});
	});
});
