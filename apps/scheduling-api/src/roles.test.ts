import { beforeEach, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";

const A = "/v1/apps/psizone";
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});
const as = (who: string, method: string, path: string, body?: unknown) =>
	w.call(who, method, `${A}${path}`, body);
/** The id the store gave an app's seed role. */
const roleOf = async (app: string, slug: string): Promise<string> => {
	const items = (await w.call("root", "GET", `/v1/apps/${app}/roles`)).json.items as {
		id: string;
		name: string;
	}[];
	const found = items.find((x) => x.name.toLowerCase() === slug);
	if (found === undefined) throw new Error(`no ${slug} role in ${app}`);
	return found.id;
};
const tuples = (): string[] => w.authz.tuples().map((t) => `${t.user}|${t.relation}|${t.object}`);

describe("roles are data, and an edit applies at once", () => {
	it("adding a permission to a role gives it to its holders immediately, and removing it takes it away", async () => {
		expect((await as("vera", "GET", "/people")).status).toBe(403);
		const role = (await as("olga", "GET", `/roles/${w.ids.roles.volunteer}`)).json.role as {
			permissions: string[];
		};
		await as("olga", "PUT", `/roles/${w.ids.roles.volunteer}/permissions`, {
			permissions: [...role.permissions, "people_view_all"],
		});
		expect((await as("vera", "GET", "/people")).status).toBe(200);
		await as("olga", "PUT", `/roles/${w.ids.roles.volunteer}/permissions`, {
			permissions: role.permissions,
		});
		expect((await as("vera", "GET", "/people")).status).toBe(403);
	});

	it("the tuples follow: written for a new grant, deleted for a removed one", async () => {
		const created = (await as("olga", "POST", "/roles", { name: "Receptionist B" })).json
			.id as string;
		await as("olga", "PUT", `/roles/${created}/permissions`, { permissions: ["clients_view_all"] });
		expect(tuples()).toContain(`sched_role:${created}#member|clients_view_all|sched_app:psizone`);
		await as("olga", "PUT", `/roles/${created}/permissions`, { permissions: [] });
		expect(tuples().filter((t) => t.startsWith(`sched_role:${created}#member`))).toEqual([]);
	});

	it("a person may hold several roles, and has the union", async () => {
		await as("olga", "PUT", "/members/vera", {
			displayName: "Vera",
			roles: [w.ids.roles.volunteer, w.ids.roles.accountant],
			coordinates: [],
		});
		expect((await as("vera", "GET", `/clients/${w.ids.c1}`)).status).toBe(200);
		expect((await as("vera", "GET", "/roster?from=2026-11-01&to=2026-11-30")).status).toBe(200);
	});

	it("a copied role starts as a copy and then diverges", async () => {
		const copy = (
			await as("olga", "POST", "/roles", { name: "Reception 2", copyFrom: w.ids.roles.reception })
		).json as { id: string; permissions: string[] };
		const source = (await as("olga", "GET", `/roles/${w.ids.roles.reception}`)).json.role as {
			permissions: string[];
		};
		expect(copy.permissions).toEqual(source.permissions);
		await as("olga", "PUT", `/roles/${copy.id}/permissions`, { permissions: [] });
		expect(
			(
				(await as("olga", "GET", `/roles/${w.ids.roles.reception}`)).json.role as {
					permissions: string[];
				}
			).permissions,
		).toEqual(source.permissions);
	});

	it("the matrix lists every catalogue row with the scopes the role holds", async () => {
		const matrix = (await as("olga", "GET", `/roles/${w.ids.roles.therapist}`)).json.matrix as {
			key: string;
			scopes: string[];
			held: string[];
		}[];
		const clients = matrix.find((m) => m.key === "clients_view");
		expect(clients).toMatchObject({ scopes: ["all", "assigned", "own"], held: ["own"] });
		expect(matrix.find((m) => m.key === "roles_edit")?.held).toEqual([]);
	});

	it("an unknown permission relation is refused and writes nothing", async () => {
		const before = await w.fingerprint();
		const r = await as("olga", "PUT", `/roles/${w.ids.roles.volunteer}/permissions`, {
			permissions: ["clients_levitate_all"],
		});
		expect(r.status).toBe(400);
		expect(await w.fingerprint()).toBe(before);
	});

	it("the Owner role cannot lose the permissions that manage roles and members, or be deleted", async () => {
		const owner = (await as("olga", "GET", `/roles/${w.ids.roles.owner}`)).json.role as {
			permissions: string[];
		};
		const r = await as("olga", "PUT", `/roles/${w.ids.roles.owner}/permissions`, {
			permissions: owner.permissions.filter((p) => p !== "roles_edit_all"),
		});
		expect(r.status).toBe(409);
		expect((await as("olga", "DELETE", `/roles/${w.ids.roles.owner}`)).status).toBe(409);
	});

	it("a role people still hold cannot be deleted; an empty one can", async () => {
		expect((await as("olga", "DELETE", `/roles/${w.ids.roles.reception}`)).status).toBe(409);
		const spare = (await as("olga", "POST", "/roles", { name: "Spare" })).json.id as string;
		expect((await as("olga", "DELETE", `/roles/${spare}`)).status).toBe(200);
		expect(tuples().some((t) => t.includes(spare))).toBe(false);
	});

	it("nobody edits their own roles, grants or membership (no self-lockout, no self-promotion)", async () => {
		for (const [method, path, body] of [
			["PUT", "/members/olga", { displayName: "x", roles: [], coordinates: [] }],
			["DELETE", "/members/olga", undefined],
			["PUT", "/members/olga/overrides", { grant: [], deny: [] }],
		] as const) {
			const before = await w.fingerprint();
			expect((await as("olga", method, path, body)).status, path).toBe(403);
			expect(await w.fingerprint()).toBe(before);
		}
	});

	it("a member given an unknown role or an unknown coordinated person is refused", async () => {
		expect(
			(
				await as("olga", "PUT", "/members/newcomer", {
					displayName: "N",
					roles: ["ghost"],
					coordinates: [],
				})
			).status,
		).toBe(400);
		expect(
			(
				await as("olga", "PUT", "/members/newcomer", {
					displayName: "N",
					roles: [],
					coordinates: ["ghost0000001"],
				})
			).status,
		).toBe(400);
	});

	it("removing a member removes every tuple of theirs", async () => {
		await as("olga", "DELETE", "/members/rita");
		expect(tuples().filter((t) => t.startsWith("user:rita|"))).toEqual([]);
		expect((await as("rita", "GET", "/clients")).status).toBe(404);
	});
});

describe("individual grants and denials sit on top of the roles", () => {
	it("a grant is a tuple and works; a denial refuses even what the role allows", async () => {
		await as("olga", "PUT", "/members/vera/overrides", { grant: ["people_view_all"], deny: [] });
		expect((await as("vera", "GET", "/people")).status).toBe(200);
		expect(tuples()).toContain("user:vera|people_view_all|sched_app:psizone");
		await as("olga", "PUT", "/members/rita/overrides", { grant: [], deny: ["clients_view_all"] });
		expect((await as("rita", "GET", "/clients")).status).toBe(403);
		expect((await as("rita", "GET", "/rooms")).status).toBe(200);
	});

	it("withdrawing a grant deletes its tuple", async () => {
		await as("olga", "PUT", "/members/vera/overrides", { grant: ["people_view_all"], deny: [] });
		await as("olga", "PUT", "/members/vera/overrides", { grant: [], deny: [] });
		expect(tuples()).not.toContain("user:vera|people_view_all|sched_app:psizone");
	});

	it("a grant that is not a relation, and a denial that is not a key, are refused", async () => {
		expect(
			(await as("olga", "PUT", "/members/vera/overrides", { grant: ["people_levitate"], deny: [] }))
				.status,
		).toBe(400);
		expect(
			(
				await as("olga", "PUT", "/members/vera/overrides", {
					grant: [],
					deny: ["clients_levitate_all"],
				})
			).status,
		).toBe(400);
	});
});

describe("apps are closed worlds", () => {
	it("a person in two apps holds different roles in each, and nothing crosses", async () => {
		await w.call("hugo", "PUT", "/v1/apps/hemisync/members/rita", {
			displayName: "Rita",
			roles: [await roleOf("hemisync", "volunteer")],
			coordinates: [],
		});
		expect((await w.call("rita", "GET", "/v1/apps/hemisync/clients")).status).toBe(403);
		expect((await w.call("rita", "GET", "/v1/apps/psizone/clients")).status).toBe(200);
		expect(
			((await w.call("rita", "GET", "/v1/me")).json.apps as { app: string }[])
				.map((a) => a.app)
				.sort(),
		).toEqual(["hemisync", "psizone"]);
	});

	it("an id from one app is not found in another, even for the owner of both", async () => {
		await w.call("root", "PUT", "/v1/apps/hemisync/members/olga", {
			displayName: "Olga",
			roles: [await roleOf("hemisync", "owner")],
			coordinates: [],
		});
		expect((await w.call("olga", "GET", `/v1/apps/hemisync/clients/${w.ids.c1}`)).status).toBe(404);
		expect((await w.call("olga", "GET", "/v1/apps/hemisync/clients")).json.items).toEqual([]);
	});

	it("only an estate administrator creates an app, and a taken slug is a conflict", async () => {
		expect(
			(
				await w.call("olga", "POST", "/v1/apps", {
					id: "third",
					name: "Third",
					timeZone: "Europe/Bucharest",
					ownerSubject: "x",
				})
			).status,
		).toBe(403);
		expect(
			(
				await w.call("root", "POST", "/v1/apps", {
					id: "psizone",
					name: "Dup",
					timeZone: "Europe/Bucharest",
					ownerSubject: "x",
				})
			).status,
		).toBe(409);
	});

	it("a suspended app refuses writes but can be read and reactivated", async () => {
		await as("olga", "PATCH", "", { status: "suspended" });
		expect((await as("olga", "GET", "/clients")).status).toBe(200);
		const r = await as("olga", "POST", "/rooms", { name: "X", kind: "y" });
		expect(r.status).toBe(403);
		expect(r.json.error).toMatchObject({ detail: { reason: "app_suspended" } });
		expect((await as("olga", "PATCH", "", { status: "active" })).status).toBe(200);
	});

	it("the estate administrator manages apps and roles but reads no clinical data", async () => {
		await w.call("root", "PUT", "/v1/apps/psizone/members/newcomer", {
			displayName: "N",
			roles: [w.ids.roles.reception],
			coordinates: [],
		});
		expect((await w.call("root", "GET", `/v1/apps/psizone/clients/${w.ids.c1}`)).status).toBe(404);
		expect((await w.call("root", "GET", "/v1/apps/psizone/roles")).status).toBe(200);
	});
});

describe("what a member may do (/me), and the view-as", () => {
	it("lists the permissions held with their scopes, and leaves out the denied", async () => {
		await as("olga", "PUT", "/members/dora/overrides", { grant: [], deny: ["leave_create_own"] });
		const me = (await as("dora", "GET", "/me")).json as {
			permissions: Record<string, string[]>;
			denied: string[];
			roles: string[];
		};
		expect(me.roles).toEqual([w.ids.roles.therapist]);
		expect(me.permissions.clients_view).toEqual(["own"]);
		expect(me.permissions.calendars_view).toEqual(["own"]);
		expect(me.permissions.rooms_view).toEqual(["all"]);
		expect(Object.keys(me.permissions)).not.toContain("roles_edit");
		expect(Object.keys(me.permissions)).not.toContain("leave_create");
		expect(me.denied).toEqual(["leave_create_own"]);
	});

	it("shows another member's access only to the estate administrator, never to the app's owner", async () => {
		const seen = await as("root", "GET", "/me?as=rita");
		expect(seen.status).toBe(200);
		expect(seen.json).toMatchObject({ subject: "rita" });
		expect((await as("olga", "GET", "/me?as=rita")).status).toBe(403);
		expect((await as("dora", "GET", "/me?as=rita")).status).toBe(403);
		expect((await as("root", "GET", "/me?as=ghost")).status).toBe(404);
	});

	it("is the same relations the server enforces: what /me lists works, what it omits is refused", async () => {
		const me = (await as("rita", "GET", "/me")).json as { permissions: Record<string, string[]> };
		expect(me.permissions.clients_view).toEqual(["all"]);
		expect(Object.keys(me.permissions)).not.toContain("clients_view_clinical");
		expect((await as("rita", "GET", `/clients/${w.ids.c1}`)).status).toBe(200);
	});
});
