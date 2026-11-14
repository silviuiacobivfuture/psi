import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	ADMIN,
	ALL_PERMISSION_KEYS,
	type ComposedRole,
	effectiveOf,
	inclusionProblem,
	MAX_INCLUDE_DEPTH,
	OWNER,
	OWNER_ONLY_KEYS,
	redundantRoles,
	SEED_ROLES,
	seedEffective,
	withoutRedundant,
} from "../permissions";

/** Every seed role's keys as they were before roles could include others (frozen on 2026-11-14, before this change). */
const BEFORE = z
	.record(z.array(z.string()))
	.parse(
		JSON.parse(
			readFileSync(new URL("../../seed/roles-before-inclusion.json", import.meta.url), "utf8"),
		),
	);

const byName = new Map<string, ComposedRole>(
	SEED_ROLES.map((r) => [r.name, { id: r.name, permissions: r.permissions, includes: r.includes }]),
);
const effective = (name: string): string[] => [...effectiveOf(name, byName).keys].sort();

describe("the seed roles, composed of one another, hold what they held", () => {
	it("every seed role but the Owner holds exactly its keys of before", () => {
		for (const name of Object.keys(BEFORE).filter((n) => n !== OWNER))
			expect(effective(name), name).toEqual(BEFORE[name]);
	});

	it("the Owner holds what it held plus the Owner's own new powers, and nothing else", () => {
		const added = OWNER_ONLY_KEYS.filter((k) => !(BEFORE[OWNER] ?? []).includes(k));
		expect(effective(OWNER)).toEqual([...(BEFORE[OWNER] ?? []), ...added].sort());
		expect(effective(OWNER)).toEqual([...ALL_PERMISSION_KEYS].sort());
	});

	it("the Owner is a strict superset of the Administrator: the difference is roles, the audit log and the Owner's own keys", () => {
		const owner = new Set(effective(OWNER));
		const admin = effective(ADMIN);
		expect(admin.every((k) => owner.has(k))).toBe(true);
		const only = [...owner].filter((k) => !admin.includes(k)).sort();
		expect(only.length).toBeGreaterThan(0);
		expect(
			only.every(
				(k) => k.startsWith("roles_") || k.startsWith("audit_log_") || OWNER_ONLY_KEYS.includes(k),
			),
		).toBe(true);
		for (const k of OWNER_ONLY_KEYS) expect(only).toContain(k);
	});

	it("no seed role but the Owner holds an Owner-only key", () => {
		for (const r of SEED_ROLES.filter((x) => x.name !== OWNER))
			for (const k of OWNER_ONLY_KEYS) expect(effective(r.name), `${r.name} ${k}`).not.toContain(k);
	});

	it("is composed: Owner > Administrator > the desk and clinical roles; Terapeut > Voluntar; Coordonator alone", () => {
		const includes = Object.fromEntries(SEED_ROLES.map((r) => [r.name, [...r.includes].sort()]));
		expect(includes).toEqual({
			Owner: ["Admin"],
			Admin: ["Accountant", "Coordinator", "Reception", "Therapist"],
			Reception: [],
			Therapist: ["Volunteer"],
			Coordinator: [],
			Volunteer: [],
			Accountant: [],
		});
	});

	it("each role's own keys are only what its included roles do not give it", () => {
		for (const r of SEED_ROLES) {
			const inherited = new Set(r.includes.flatMap((n) => effective(n)));
			expect(
				r.permissions.some((k) => inherited.has(k)),
				r.name,
			).toBe(false);
			expect(seedEffective(r.name)).toEqual(effective(r.name));
		}
	});
});

const role = (id: string, permissions: string[], includes: string[] = []): ComposedRole => ({
	id,
	permissions,
	includes,
});
const mapOf = (...roles: ComposedRole[]) => new Map(roles.map((r) => [r.id, r]));

describe("what a composed role holds in the end", () => {
	it("its own keys, then every included role's, transitively, and says where each came from", () => {
		const roles = mapOf(role("a", ["x"], ["b"]), role("b", ["y"], ["c"]), role("c", ["z", "x"]));
		const e = effectiveOf("a", roles);
		expect([...e.keys].sort()).toEqual(["x", "y", "z"]);
		// x is a's own; y comes from b, z from c (the nearest that holds it as its own)
		expect(Object.fromEntries(e.from)).toEqual({ y: "b", z: "c" });
	});

	it("a role that includes nothing holds its own keys; an empty role holds nothing; an unknown id holds nothing", () => {
		const roles = mapOf(role("a", ["x"]), role("e", []));
		expect([...effectiveOf("a", roles).keys]).toEqual(["x"]);
		expect([...effectiveOf("e", roles).keys]).toEqual([]);
		expect([...effectiveOf("nobody", roles).keys]).toEqual([]);
	});

	it("stored data with a cycle or a dangling inclusion adds nothing further and never loops", () => {
		const roles = mapOf(role("a", ["x"], ["b", "gone"]), role("b", ["y"], ["a"]));
		expect([...effectiveOf("a", roles).keys].sort()).toEqual(["x", "y"]);
	});
});

describe("what a role may include", () => {
	const roles = mapOf(role("a", [], ["b"]), role("b", [], ["c"]), role("c", []), role("d", []));

	it("another role, several, or none", () => {
		expect(inclusionProblem("d", ["a"], roles)).toBeUndefined();
		expect(inclusionProblem("d", ["b", "c"], roles)).toBeUndefined();
		expect(inclusionProblem("d", [], roles)).toBeUndefined();
	});

	it.each([
		["itself", "d", ["d"], { kind: "self" }],
		["an unknown role", "d", ["zz"], { kind: "unknown", id: "zz" }],
		["a role that includes it back (directly)", "b", ["a"], { kind: "cycle", through: "b" }],
		["a role that includes it back (through another)", "c", ["a"], { kind: "cycle", through: "c" }],
	] as const)("refuses %s", (_what, id, includes, problem) => {
		expect(inclusionProblem(id, includes, roles)).toEqual(problem);
	});

	it(`refuses a chain deeper than ${MAX_INCLUDE_DEPTH}, allows one exactly that deep`, () => {
		// r0 > r1 > ... > rMAX: MAX inclusions deep, saved one link at a time.
		const chain = Array.from({ length: MAX_INCLUDE_DEPTH + 1 }, (_, i) =>
			role(`r${i}`, [], i < MAX_INCLUDE_DEPTH ? [`r${i + 1}`] : []),
		);
		const map = mapOf(...chain, role("top", []), role("below", []));
		expect(inclusionProblem("r0", ["r1"], map)).toBeUndefined();
		// one more above, or one more below the bottom: MAX + 1
		expect(inclusionProblem("top", ["r0"], map)).toEqual({ kind: "too_deep" });
		expect(inclusionProblem(`r${MAX_INCLUDE_DEPTH}`, ["below"], map)).toEqual({ kind: "too_deep" });
	});
});

describe("roles that add nothing to the others held", () => {
	it("a role fully contained in another picked one is redundant, named by the one that stays", () => {
		const roles = mapOf(
			role("owner", ["o"], ["admin"]),
			role("admin", ["a"], ["desk"]),
			role("desk", ["d"]),
			role("other", ["q"]),
		);
		expect(Object.fromEntries(redundantRoles(["desk", "owner", "admin", "other"], roles))).toEqual({
			admin: "owner",
			desk: "owner",
		});
		expect(withoutRedundant(["desk", "owner", "admin", "other"], roles)).toEqual([
			"owner",
			"other",
		]);
	});

	it("is computed from the keys, not the inclusions: a flat role with a subset of another's keys is redundant too", () => {
		const roles = mapOf(role("big", ["a", "b"]), role("small", ["b"]));
		expect(Object.fromEntries(redundantRoles(["big", "small"], roles))).toEqual({ small: "big" });
	});

	it("two roles with the same keys keep exactly one (the first in id order)", () => {
		const roles = mapOf(role("b", ["k"]), role("a", ["k"]));
		expect(withoutRedundant(["b", "a"], roles)).toEqual(["a"]);
	});

	it("disjoint roles, one role, none, a duplicate and an unknown id are kept as they are", () => {
		const roles = mapOf(role("a", ["x"]), role("b", ["y"]));
		expect(withoutRedundant(["a", "b"], roles)).toEqual(["a", "b"]);
		expect(withoutRedundant(["a"], roles)).toEqual(["a"]);
		expect(withoutRedundant([], roles)).toEqual([]);
		expect(withoutRedundant(["a", "a"], roles)).toEqual(["a"]);
		expect(redundantRoles(["a", "zz"], roles).size).toBe(0);
	});

	it("an empty role is contained in any other", () => {
		const roles = mapOf(role("a", ["x"]), role("empty", []));
		expect(Object.fromEntries(redundantRoles(["a", "empty"], roles))).toEqual({ empty: "a" });
	});
});
