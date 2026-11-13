import { readFileSync } from "node:fs";
import { ROUTES } from "@psi/scheduling-sdk/contract";
import { describe, expect, it } from "vitest";
import { allAppRelations, CATALOGUE, parseRelation, permissionOf } from "./catalogue";
import { buildManifest } from "./manifest";
import { buildModel, PLATFORM_CLAUSE, render } from "./model";
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

	it("permissions.generated.ts lists exactly the catalogue's keys", () => {
		const generated = Object.values(PERMISSIONS)
			.flatMap((r) => Object.keys(r))
			.sort();
		expect(generated).toEqual(CATALOGUE.map((d) => d.key).sort());
	});
});

describe("the catalogue", () => {
	it("has unique keys, and every scoped permission is defined on objects that can resolve its scopes", () => {
		expect(new Set(CATALOGUE.map((d) => d.key)).size).toBe(CATALOGUE.length);
		const model = buildModel();
		for (const d of CATALOGUE) {
			for (const type of d.objects) {
				if (type === "sched_app") continue;
				expect(Object.keys(model[type] ?? {}), `${type} defines ${d.key}`).toContain(d.key);
			}
		}
	});

	it("names every relation it holds on the app, and parses each back", () => {
		for (const relation of allAppRelations())
			expect(parseRelation(relation), relation).toBeDefined();
		expect(parseRelation("clients_edit")).toBeUndefined();
		expect(parseRelation("clients_edit_own")?.scope).toBe("own");
	});

	it("is the vocabulary of every route: each permission key exists and its target type is one it is defined on", () => {
		for (const route of ROUTES) {
			if (!("permission" in route) || route.permission === undefined) continue;
			const def = permissionOf(route.permission.key);
			expect(def, route.id).toBeDefined();
			const target = route.permission.target;
			if (target.kind === "app")
				expect(def?.scopes.length === 0 || def?.scopes.includes("all"), route.id).toBe(true);
			else expect(def?.objects, route.id).toContain(target.type);
		}
	});

	it("keeps every seed role inside the catalogue", () => {
		const all = new Set(allAppRelations());
		for (const role of seedRoles())
			for (const r of role.permissions) expect(all.has(r), `${role.slug}: ${r}`).toBe(true);
	});

	it("gives no role the platform administrators' clinical access: platformAdmin permissions are never clinical", () => {
		for (const d of CATALOGUE.filter((x) => x.platformAdmin === true))
			expect(d.fieldGroup).toBeUndefined();
	});
});
