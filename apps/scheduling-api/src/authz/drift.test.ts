import { readFileSync } from "node:fs";
import { effectiveOf } from "@psi/scheduling/permissions";
import { ROUTES } from "@psi/scheduling-sdk/contract";
import { describe, expect, it } from "vitest";
import {
	ALL_PERMISSION_KEYS,
	allAppRelations,
	CATALOGUE,
	catalogueIsClosed,
	parseRelation,
	permissionOf,
} from "./catalogue";
import { buildManifest } from "./manifest";
import {
	buildModel,
	INTEGRATION_ROLE,
	PLATFORM_CLAUSE,
	PROGRAM_SUBJECT,
	REGISTER,
	REGISTER_PERMISSIONS,
	render,
} from "./model";
import { PERMISSIONS } from "./permissions.generated";
import { seedRoles } from "./roles-seed";

const root = new URL("../../../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), "utf8");

describe("the committed artefacts follow the catalogue and the model", () => {
	it("authz.manifest.json is exactly what the generator script writes", () => {
		expect(JSON.parse(read("apps/scheduling-api/authz.manifest.json"))).toEqual(
			JSON.parse(JSON.stringify(buildManifest())),
		);
	});

	it("estate/authz/modules/sched.fga defines every relation of the model, with the same clauses", () => {
		const fga = read("estate/authz/modules/sched.fga");
		let type = "";
		const seen = new Map<string, Map<string, string[]>>();
		for (const line of fga.split("\n")) {
			if (line.startsWith("extend type")) type = "";
			const t = /^type (\w+)$/.exec(line);
			if (t?.[1] !== undefined) {
				type = t[1];
				seen.set(type, new Map());
			}
			const d = /^\s+define (\w+): (.+)$/.exec(line);
			if (d?.[1] !== undefined && d[2] !== undefined && type !== "")
				seen.get(type)?.set(
					d[1],
					d[2].split(" or ").map((s) => s.trim()),
				);
		}
		// The generator's own directory relation on the app (the tile policy); it confers nothing.
		for (const relations of seen.values()) relations.delete("app_sched_access");
		const model = buildModel();
		expect([...seen.keys()].sort()).toEqual(Object.keys(model).sort());
		for (const [t, relations] of Object.entries(model)) {
			expect([...(seen.get(t)?.keys() ?? [])].sort(), t).toEqual(Object.keys(relations).sort());
			for (const [name, clauses] of Object.entries(relations)) {
				const expected = clauses.map(render);
				expect(seen.get(t)?.get(name), `${t}#${name}`).toEqual(expected);
			}
		}
	});

	it("the platform role clause is the one the generator appends", () => {
		expect(render(PLATFORM_CLAUSE)).toBe("role_sched_app_admin from parent_platform");
	});

	it("permissions.generated.ts lists exactly the catalogue's keys and the register's", () => {
		const generated = Object.values(PERMISSIONS)
			.flatMap((r) => Object.keys(r))
			.sort();
		expect(generated).toEqual(
			[...CATALOGUE.map((d) => d.key), ...Object.keys(REGISTER_PERMISSIONS)].sort(),
		);
	});
});

describe("the service's program", () => {
	type Obj = { type: string; scope: { scope_type: string; relation: string } };
	type Role = { key: string; scope_type: string; grants: string[]; resource_scopes?: string[] };
	const manifest = buildManifest() as {
		program_subject?: string;
		programs?: { roles: string[]; resource: string };
		objects: Obj[];
		roles: Role[];
	};

	it("is declared: one role, on a register Polaris places in the organisation", () => {
		expect(manifest.program_subject).toBe(PROGRAM_SUBJECT);
		expect(manifest.programs).toEqual({ roles: [INTEGRATION_ROLE], resource: REGISTER });
		expect(manifest.objects.find((o) => o.type === REGISTER)?.scope).toEqual({
			scope_type: "org",
			relation: "parent_org",
		});
	});

	it("is offered its role on the register only, and the role confers only the register's relations", () => {
		const role = manifest.roles.find((r) => r.key === INTEGRATION_ROLE);
		expect(role).toMatchObject({ scope_type: "org", resource_scopes: [REGISTER] });
		expect(role?.grants.sort()).toEqual(
			Object.values(REGISTER_PERMISSIONS)
				.map((relation) => `${REGISTER}#${relation}`)
				.sort(),
		);
	});

	it("is a subject, never a declared object, and no other role reaches the register", () => {
		expect(manifest.objects.map((o) => o.type)).not.toContain(PROGRAM_SUBJECT);
		for (const r of manifest.roles.filter((x) => x.key !== INTEGRATION_ROLE)) {
			expect(
				r.grants.some((g) => g.startsWith(`${REGISTER}#`)),
				r.key,
			).toBe(false);
			expect(r.resource_scopes ?? [], r.key).not.toContain(REGISTER);
		}
	});

	it("leaves every clinical type where it was: scoped to the app, holding no program", () => {
		const fga = read("estate/authz/modules/sched.fga");
		for (const o of manifest.objects.filter((x) => x.type !== REGISTER && x.type !== "sched_app"))
			expect(o.scope, o.type).toEqual({ scope_type: "sched_app", relation: "app" });
		const lines = fga.split("\n").filter((l) => l.includes(PROGRAM_SUBJECT));
		expect(lines.map((l) => l.trim())).toEqual([
			`type ${PROGRAM_SUBJECT}`,
			`define role_sched_integration: [user, group#member, ${PROGRAM_SUBJECT}]`,
			`define program_sched: [${PROGRAM_SUBJECT}]`,
		]);
	});
});

describe("the catalogue", () => {
	it("is the package's: every relation it derives is a key of ALL_PERMISSION_KEYS, and every key is derived", () => {
		expect(catalogueIsClosed()).toBe(true);
		expect(new Set(allAppRelations())).toEqual(new Set(ALL_PERMISSION_KEYS));
		expect(allAppRelations().length).toBe(ALL_PERMISSION_KEYS.length);
	});

	it("has unique keys, and every scoped permission is defined on the objects that resolve its scopes", () => {
		expect(new Set(CATALOGUE.map((d) => d.key)).size).toBe(CATALOGUE.length);
		const model = buildModel();
		for (const d of CATALOGUE) {
			if (d.objects.length === 1 && d.objects[0] === "sched_app") continue;
			for (const type of d.objects)
				expect(Object.keys(model[type] ?? {}), `${type} defines ${d.key}`).toContain(d.key);
		}
	});

	it("names every relation it holds on the app, and parses each back to its permission and scope", () => {
		for (const relation of allAppRelations())
			expect(parseRelation(relation), relation).toBeDefined();
		expect(parseRelation("clients_edit")).toBeUndefined();
		expect(parseRelation("clients_view_own_clinical")).toMatchObject({
			scope: "own",
			def: { key: "clients_view_clinical" },
		});
		expect(parseRelation("clients_view_all_custom-abc")).toBeUndefined();
	});

	it("is the vocabulary of every route: each key exists and its target is a type it is checked on", () => {
		for (const route of ROUTES) {
			if (!("permission" in route) || route.permission === undefined) continue;
			if (route.permission.key === "record:dynamic") {
				expect(route.permission.target.kind, route.id).toBe("dynamic");
				continue;
			}
			const def = permissionOf(route.permission.key);
			expect(def, route.id).toBeDefined();
			const target = route.permission.target;
			if (target.kind === "app") expect(def?.scopes.includes("all"), route.id).toBe(true);
			else if (target.kind === "dynamic") {
				// Every candidate is a key of the catalogue, checked on the target's type or (held app-wide) on the app.
				for (const candidate of target.candidates) {
					const held = permissionOf(candidate);
					expect(held, `${route.id} ${candidate}`).toBeDefined();
					expect(
						held?.objects.includes(target.type) || held?.objects.includes("sched_app"),
						`${route.id} ${candidate}`,
					).toBe(true);
				}
			} else expect(def?.objects, route.id).toContain(target.type);
		}
	});

	it("keeps every seed role inside the catalogue, and the Owner holds every relation", () => {
		const all = new Set(allAppRelations());
		for (const role of seedRoles())
			for (const r of role.permissions) expect(all.has(r), `${role.slug}: ${r}`).toBe(true);
		// The Owner holds every relation in the end: its own keys and every role it includes, transitively.
		const seeds = seedRoles();
		const byId = new Map(
			seeds.map((r) => [r.slug, { id: r.slug, permissions: r.permissions, includes: r.includes }]),
		);
		expect(new Set(effectiveOf("owner", byId).keys)).toEqual(all);
		for (const role of seeds)
			for (const inc of role.includes)
				expect(byId.has(inc), `${role.slug} includes ${inc}`).toBe(true);
	});

	it("gives the platform administrators no clinical access: their permissions have no field group", () => {
		for (const d of CATALOGUE.filter((x) => x.platformAdmin === true))
			expect(d.group).toBeUndefined();
	});

	it("a key without a group is identity only: each group has its own relation", () => {
		const identity = new Set(
			allAppRelations().filter((r) => !/_(core|contact|guardian|money|clinical)$/.test(r)),
		);
		expect(identity.has("clients_view_all")).toBe(true);
		expect(identity.has("clients_view_all_clinical")).toBe(false);
	});
});
