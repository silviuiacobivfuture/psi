import { beforeEach, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";

const A = "/v1/apps/psizone";
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});
const as = (who: string, method: string, path: string, body?: unknown) =>
	w.call(who, method, `${A}${path}`, body);
const role = (name: string): string => w.ids.roles[name] ?? name;
const put = (who: string, subject: string, roles: string[], email?: string) =>
	as(who, "PUT", `/members/${subject}`, {
		displayName: `${subject} test`,
		...(email === undefined ? {} : { email }),
		roles,
		coordinates: [],
	});
const holds = (subject: string, relation: string) =>
	w.authz.check(`user:${subject}`, relation, "sched_app:psizone");
const unchanged = async (
	what: () => Promise<{ status: number; json: unknown }>,
	status: number,
	reason?: string,
) => {
	const before = await w.fingerprint();
	const r = await what();
	expect(r.status, JSON.stringify(r.json)).toBe(status);
	if (reason !== undefined) expect(JSON.stringify(r.json)).toContain(reason);
	expect(await w.fingerprint()).toBe(before);
};
const newRole = async (name: string, permissions: string[]): Promise<string> => {
	const id = (await as("olga", "POST", "/roles", { name })).json.id as string;
	await as("olga", "PUT", `/roles/${id}/permissions`, { permissions });
	return id;
};
const include = (id: string, includes: string[], who = "olga") =>
	as(who, "PUT", `/roles/${id}/includes`, { includes });

describe("a role that includes another, through OpenFGA", () => {
	it("whoever holds the including role holds the included role's permissions; never the reverse", async () => {
		const desk = await newRole("Desk", ["rooms_view_all"]);
		const lead = await newRole("Lead", ["devices_view_all"]);
		expect((await include(lead, [desk])).status).toBe(200);
		await put("olga", "vera", [lead]);
		await put("olga", "dora", [desk]);
		expect(await holds("vera", "rooms_view_all")).toBe(true);
		expect(await holds("vera", "devices_view_all")).toBe(true);
		expect(await holds("dora", "rooms_view_all")).toBe(true);
		expect(await holds("dora", "devices_view_all")).toBe(false);
	});

	it("is transitive, and a change to an included role reaches the includer's holders at once", async () => {
		const a = await newRole("A", ["rooms_view_all"]);
		const b = await newRole("B", []);
		const c = await newRole("C", []);
		await include(b, [a]);
		await include(c, [b]);
		await put("olga", "vera", [c]);
		expect(await holds("vera", "rooms_view_all")).toBe(true);
		await as("olga", "PUT", `/roles/${a}/permissions`, { permissions: ["devices_view_all"] });
		expect(await holds("vera", "rooms_view_all")).toBe(false);
		expect(await holds("vera", "devices_view_all")).toBe(true);
	});

	it("dropping the inclusion takes the permissions away and deletes its tuple", async () => {
		const a = await newRole("A", ["rooms_view_all"]);
		const b = await newRole("B", []);
		await include(b, [a]);
		await put("olga", "vera", [b]);
		expect(await holds("vera", "rooms_view_all")).toBe(true);
		expect((await include(b, [])).status).toBe(200);
		expect(await holds("vera", "rooms_view_all")).toBe(false);
		expect(
			w.authz.tuples().some((t) => t.object === `sched_role:${a}` && t.relation === "member"),
		).toBe(false);
	});

	it("the role's sheet says what it holds in the end and where each inherited permission comes from", async () => {
		const a = await newRole("A", ["rooms_view_all"]);
		const b = await newRole("B", ["devices_view_all"]);
		await include(b, [a]);
		const got = (await as("olga", "GET", `/roles/${b}`)).json as {
			role: { includes: string[]; permissions: string[] };
			inherited: Record<string, string>;
			matrix: { key: string; held: string[] }[];
		};
		expect(got.role.includes).toEqual([a]);
		expect(got.role.permissions).toEqual(["devices_view_all"]);
		expect(got.inherited).toEqual({ rooms_view_all: a });
		expect(got.matrix.find((r) => r.key === "rooms_view")?.held).toEqual(["all"]);
		expect(got.matrix.find((r) => r.key === "devices_view")?.held).toEqual(["all"]);
	});

	it("the comparison every member reads, and the view-as of a role, count what it includes", async () => {
		const a = await newRole("A", ["rooms_view_all"]);
		const b = await newRole("B", []);
		await include(b, [a]);
		const summary = (await as("rita", "GET", "/role-summary")).json as {
			roles: { id: string; includes: string[]; inherited: Record<string, string> }[];
		};
		expect(summary.roles.find((r) => r.id === b)).toMatchObject({
			includes: [a],
			inherited: { rooms_view_all: a },
		});
		const seen = (await as("root", "GET", `/me?as=role%3A${b}`)).json as {
			permissions: Record<string, string[]>;
		};
		expect(seen.permissions.rooms_view).toEqual(["all"]);
	});

	it("a copy of a role includes what the original includes", async () => {
		const a = await newRole("A", ["rooms_view_all"]);
		const b = await newRole("B", []);
		await include(b, [a]);
		const copy = (await as("olga", "POST", "/roles", { name: "B2", copyFrom: b })).json as {
			includes: string[];
		};
		expect(copy.includes).toEqual([a]);
	});
});

describe("what a role may include: every refusal writes nothing", () => {
	it.each([
		["itself", (b: string) => [b], "self"],
		["an unknown role", () => ["r_nope"], "unknown_role"],
	] as const)("refuses %s", async (_what, list, reason) => {
		const b = await newRole("B", []);
		await unchanged(() => include(b, [...list(b)]), 400, reason);
	});

	it("refuses a cycle, direct or through another role", async () => {
		const a = await newRole("A", []);
		const b = await newRole("B", []);
		const c = await newRole("C", []);
		await include(b, [a]);
		await include(c, [b]);
		await unchanged(() => include(a, [b]), 400, "cycle");
		await unchanged(() => include(a, [c]), 400, "cycle");
	});

	it("refuses a chain deeper than six; one exactly six deep is fine", async () => {
		const ids: string[] = [];
		for (let i = 0; i < 8; i += 1) ids.push(await newRole(`Chain ${i}`, []));
		for (let i = 0; i < 6; i += 1)
			expect((await include(ids[i] ?? "", [ids[i + 1] ?? ""])).status).toBe(200);
		await unchanged(() => include(ids[6] ?? "", [ids[7] ?? ""]), 400, "too_deep");
	});

	it("refuses deleting a role another includes", async () => {
		const a = await newRole("A", []);
		const b = await newRole("B", []);
		await include(b, [a]);
		await unchanged(() => as("olga", "DELETE", `/roles/${a}`), 409, "included");
	});

	it("is refused to someone who may not edit roles", async () => {
		const a = await newRole("A", []);
		await unchanged(() => include(a, [role("volunteer")], "nina"), 403);
	});
});

describe("the seed roles: Owner includes Administrator, strictly more", () => {
	it("the app starts with the composition, and the Owner holds everything the Administrator does and more", async () => {
		const roles = (await as("olga", "GET", "/role-summary")).json as {
			roles: {
				id: string;
				name: string;
				permissions: string[];
				includes: string[];
				inherited: Record<string, string>;
			}[];
		};
		const byName = new Map(roles.roles.map((r) => [r.name, r]));
		const owner = byName.get("Owner");
		const admin = byName.get("Admin");
		expect(owner?.includes).toEqual([admin?.id]);
		const all = (r: typeof owner) =>
			new Set([...(r?.permissions ?? []), ...Object.keys(r?.inherited ?? {})]);
		const o = all(owner);
		const a = all(admin);
		expect([...a].every((k) => o.has(k))).toBe(true);
		for (const k of [
			"members_manage_admins_all",
			"organisation_transfer_all",
			"organisation_delete_all",
			"billing_edit_all",
			"assistant_budget_edit_all",
		]) {
			expect(o.has(k), k).toBe(true);
			expect(a.has(k), k).toBe(false);
		}
	});
});

describe("Administrators and Owners are the Owner's to manage", () => {
	it("an Administrator manages every other member: roles, permissions, removal", async () => {
		expect((await put("nina", "rita", [role("reception"), role("accountant")])).status).toBe(200);
		expect(
			(await as("nina", "PUT", "/members/vera/overrides", { grant: ["rooms_view_all"], deny: [] }))
				.status,
		).toBe(200);
		expect((await as("nina", "DELETE", "/members/ana")).status).toBe(200);
	});

	it.each([
		["make someone an Administrator", () => put("nina", "vera", [role("admin")])],
		["make someone an Owner", () => put("nina", "vera", [role("owner")])],
		["add an Administrator", () => put("nina", "newcomer", [role("admin")])],
		["change an Owner's roles", () => put("nina", "olga", [role("reception")])],
		["remove the Owner", () => as("nina", "DELETE", "/members/olga")],
		[
			"change an Owner's permissions",
			() => as("nina", "PUT", "/members/olga/overrides", { grant: [], deny: ["rooms_view_all"] }),
		],
		[
			"grant someone a team-managing permission",
			() => as("nina", "PUT", "/members/vera/overrides", { grant: ["members_edit_all"], deny: [] }),
		],
	] as const)("an Administrator may not %s: 403, nothing written", async (_what, call) => {
		await unchanged(call, 403, "manages_admins");
	});

	it("an Administrator may not change or remove another Administrator", async () => {
		await put("olga", "vera", [role("admin")]);
		await unchanged(() => put("nina", "vera", [role("reception")]), 403, "manages_admins");
		await unchanged(() => as("nina", "DELETE", "/members/vera"), 403, "manages_admins");
	});

	it("an Administrator may not invite someone as an Administrator: nothing made at the sign-in", async () => {
		await unchanged(
			() =>
				as("nina", "POST", "/staff-accounts", {
					email: "nou@example.test",
					displayName: "Nou",
					roles: [role("admin")],
				}),
			403,
			"manages_admins",
		);
		expect(w.staff.calls.filter((c) => c.startsWith("create:"))).toEqual([]);
	});

	it("an Administrator may not show an Administrator's set-password link", async () => {
		const subject = (
			(
				await as("olga", "POST", "/staff-accounts", {
					email: "admin.nou@example.test",
					displayName: "Admin Nou",
					roles: [role("admin")],
				})
			).json as { member: { subject: string } }
		).member.subject;
		await unchanged(
			() => as("nina", "POST", `/members/${subject}/sign-in-link`, {}),
			403,
			"manages_admins",
		);
		expect((await as("olga", "POST", `/members/${subject}/sign-in-link`, {})).status).toBe(200);
	});

	it("the Owner makes and unmakes Administrators", async () => {
		expect((await put("olga", "vera", [role("admin")])).status).toBe(200);
		expect((await put("olga", "vera", [role("volunteer")])).status).toBe(200);
	});

	it("an Administrator may not give a role a team-managing permission, nor include the Administrator role", async () => {
		// An Administrator holds no roles_ permission at all; the rule holds for anyone who edits roles without managing admins.
		const id = await newRole("Plain", []);
		await unchanged(
			() => as("nina", "PUT", `/roles/${id}/permissions`, { permissions: ["members_edit_all"] }),
			403,
		);
		await unchanged(() => include(id, [role("admin")], "nina"), 403);
	});
});

describe("someone who edits roles but does not manage administrators", () => {
	/** cora holds a custom role that edits roles (and nothing about the team): the Owner gives it. */
	const roleEditor = async (): Promise<void> => {
		const editor = await newRole("Roluri", [
			"roles_view_all",
			"roles_create_all",
			"roles_edit_all",
			"roles_delete_all",
		]);
		expect((await put("olga", "cora", [editor])).status).toBe(200);
	};

	it("still edits a role that grants nothing about the team", async () => {
		await roleEditor();
		const id = await newRole("Desk", []);
		const r = await as("cora", "PUT", `/roles/${id}/permissions`, {
			permissions: ["rooms_view_all"],
		});
		expect(r.status, JSON.stringify(r.json)).toBe(200);
		expect((await include(id, [role("volunteer")], "cora")).status).toBe(200);
	});

	it.each([
		[
			"give a role a team-managing permission",
			async () => {
				const id = await newRole("Plain", []);
				return () =>
					as("cora", "PUT", `/roles/${id}/permissions`, { permissions: ["members_edit_all"] });
			},
		],
		[
			"make a role include the Administrator",
			async () => {
				const id = await newRole("Plain", []);
				return () => include(id, [role("admin")], "cora");
			},
		],
		[
			"copy the Administrator into a new role",
			async () => () => as("cora", "POST", "/roles", { name: "Admin 2", copyFrom: role("admin") }),
		],
		[
			"copy the Owner into a new role",
			async () => () => as("cora", "POST", "/roles", { name: "Owner 2", copyFrom: role("owner") }),
		],
		[
			"delete a role that manages the team",
			async () => {
				const id = await newRole("Team", ["members_edit_all"]);
				return () => as("cora", "DELETE", `/roles/${id}`);
			},
		],
		[
			"take a permission away from the Administrator",
			async () => {
				const held = (await as("olga", "GET", `/roles/${role("admin")}`)).json as {
					role: { permissions: string[] };
				};
				return () =>
					as("cora", "PUT", `/roles/${role("admin")}/permissions`, {
						permissions: held.role.permissions.slice(1),
					});
			},
		],
	] as const)("may not %s: 403, nothing written", async (_what, make) => {
		await roleEditor();
		const call = await make();
		await unchanged(call, 403, "manages_admins");
	});

	it("copying a role that grants nothing about the team is fine", async () => {
		await roleEditor();
		const r = await as("cora", "POST", "/roles", {
			name: "Volunteer 2",
			copyFrom: role("volunteer"),
		});
		expect(r.status, JSON.stringify(r.json)).toBe(200);
	});
});

describe("the organisation keeps an Owner", () => {
	it("the last Owner cannot be removed, nor lose the ownership by a denial or by their role's edit", async () => {
		await unchanged(() => as("root", "DELETE", "/members/olga"), 409, "last_owner");
		await unchanged(
			() =>
				as("root", "PUT", "/members/olga/overrides", {
					grant: [],
					deny: ["organisation_transfer_all"],
				}),
			409,
			"last_owner",
		);
		const owner = (await as("olga", "GET", `/roles/${role("owner")}`)).json as {
			role: { permissions: string[] };
		};
		await unchanged(
			() =>
				as("olga", "PUT", `/roles/${role("owner")}/permissions`, {
					permissions: owner.role.permissions.filter((p) => p !== "organisation_transfer_all"),
				}),
			409,
			"last_owner",
		);
	});

	it("with two Owners, one may go", async () => {
		await put("olga", "vera", [role("owner")]);
		expect((await as("olga", "DELETE", "/members/vera")).status).toBe(200);
	});
});

describe("handing the organisation over", () => {
	it("the new owner takes the Owner role; the giver keeps the Administrator it includes", async () => {
		const r = await as("olga", "POST", "/ownership", { to: "rita" });
		expect(r.status, JSON.stringify(r.json)).toBe(200);
		const out = r.json as { from: { roles: string[] }; to: { roles: string[] } };
		expect(out.to.roles).toContain(role("owner"));
		expect(out.from.roles).toEqual([role("admin")]);
		expect(await holds("rita", "organisation_transfer_all")).toBe(true);
		expect(await holds("olga", "organisation_transfer_all")).toBe(false);
		expect(await holds("olga", "members_edit_all")).toBe(true);
		// what rita held before (Recepție) adds nothing to an Owner: it is not kept beside it
		expect(out.to.roles).toEqual([role("owner")]);
	});

	it.each([
		["to oneself", "olga", "olga", 409, "self"],
		["to someone not in the team", "olga", "nobody-here", 404, undefined],
		["by an Administrator", "nina", "rita", 403, undefined],
		["by a receptionist", "rita", "nina", 403, undefined],
	] as const)("is refused %s, and nothing is written", async (_what, who, to, status, reason) => {
		await unchanged(() => as(who, "POST", "/ownership", { to }), status, reason);
	});

	it("the estate administrator hands over an organisation, giving the Owner role", async () => {
		const r = await as("root", "POST", "/ownership", { to: "cora" });
		expect(r.status, JSON.stringify(r.json)).toBe(200);
		expect((r.json as { from: unknown }).from).toBeNull();
		expect(await holds("cora", "organisation_transfer_all")).toBe(true);
	});
});

describe("a role contained in another picked role is not kept", () => {
	it("Administrator with Owner keeps the Owner alone, and the journal says which was included in which", async () => {
		const r = await put("olga", "vera", [role("admin"), role("owner")]);
		expect((r.json as { roles: string[] }).roles).toEqual([role("owner")]);
		const events = (
			(await as("olga", "GET", "/audit?limit=500")).json.items as {
				action: string;
				target: { id: string };
				detail?: { included?: Record<string, string> };
			}[]
		).filter((e) => e.action === "member.put" && e.target.id === "vera");
		expect(events[0]?.detail?.included).toEqual({ [role("admin")]: role("owner") });
	});

	it("Recepție with Administrator keeps the Administrator; two unrelated roles are both kept", async () => {
		expect(
			((await put("olga", "vera", [role("reception"), role("admin")])).json as { roles: string[] })
				.roles,
		).toEqual([role("admin")]);
		expect(
			(
				(await put("olga", "vera", [role("reception"), role("coordinator")])).json as {
					roles: string[];
				}
			).roles.sort(),
		).toEqual([role("reception"), role("coordinator")].sort());
	});
});
