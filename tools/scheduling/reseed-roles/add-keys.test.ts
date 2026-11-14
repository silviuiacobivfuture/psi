import { effectiveOf, SEED_ROLES, seedEffective } from "@psi/scheduling/permissions";
import type { RoleRow } from "@psi/scheduling-api/store-types";
import { describe, expect, it } from "vitest";
import { keysToAdd, planReseed, type Step } from "./plan";

/** The keys the availability editor and the booking pause brought (2026-11-14): new to every stored role. */
const NEW = [
	...new Set(
		SEED_ROLES.flatMap((s) => seedEffective(s.name)).filter((k) =>
			/^(availability|booking_pause)_/.test(k),
		),
	),
].sort();

/** Every seed role, stored composed as the seed has it, but from before `drop` existed. */
const storedBefore = (drop: ReadonlyArray<string>): RoleRow[] =>
	SEED_ROLES.map((s) => ({
		id: `id-${s.name}`,
		app: "a",
		name: s.name,
		system: true,
		permissions: s.permissions.filter((k) => !drop.includes(k)),
		includes: s.includes.map((n) => `id-${n}`),
		createdAt: 0,
		updatedAt: 0,
	}));
const apply = (roles: RoleRow[], steps: Step[]): RoleRow[] =>
	roles.map((r) => {
		const s = steps.find((x) => x.kind !== "missing" && x.role.id === r.id);
		return s !== undefined &&
			(s.kind === "rewrite" || s.kind === "not_contained") &&
			s.next !== undefined
			? s.next
			: r;
	});
const holds = (roles: RoleRow[]) => {
	const byId = new Map(
		roles.map((r) => [r.id, { id: r.id, permissions: r.permissions, includes: r.includes }]),
	);
	return (name: string) => [...effectiveOf(`id-${name}`, byId).keys].sort();
};

describe("--add-keys: keys new to the seed reach the roles whose seed holds them", () => {
	it("the new keys exist and several roles' seeds hold them", () => {
		expect(NEW.length).toBeGreaterThanOrEqual(3);
		expect(NEW.some((k) => k.startsWith("booking_pause_"))).toBe(true);
	});

	it("without --add-keys a re-seed grants nothing (it keeps what each role holds)", () => {
		const roles = storedBefore(NEW);
		const steps = planReseed(roles, 1);
		const heldNow = holds(apply(roles, steps));
		for (const s of SEED_ROLES) expect(heldNow(s.name).filter((k) => NEW.includes(k))).toEqual([]);
	});

	it("each seed role ends holding exactly what its seed holds, the includer through what it includes", () => {
		const roles = storedBefore(NEW);
		const steps = planReseed(roles, 1, NEW);
		const heldNow = apply(roles, steps);
		for (const s of SEED_ROLES)
			expect(holds(heldNow)(s.name)).toEqual([...seedEffective(s.name)].sort());
		// The Owner holds them through the Administrator it includes, not as its own keys.
		const owner = heldNow.find((r) => r.name === "Owner");
		expect(owner?.permissions.filter((k) => NEW.includes(k))).toEqual([]);
		const gained = steps.flatMap((x) =>
			x.kind === "rewrite" || x.kind === "not_contained" ? x.added : [],
		);
		expect(gained.length).toBeGreaterThan(0);
	});

	it("is idempotent: a second run finds every role current", () => {
		const roles = storedBefore(NEW);
		const once = apply(roles, planReseed(roles, 1, NEW));
		expect(planReseed(once, 2, NEW).map((s) => s.kind)).toEqual(SEED_ROLES.map(() => "current"));
	});

	it("a key the owners took away is not given back unless it is named", () => {
		const reception = SEED_ROLES.find((s) => s.name === "Reception");
		const removed = reception?.permissions.find((k) => !NEW.includes(k));
		expect(removed).toBeDefined();
		const roles = storedBefore(NEW).map((r) =>
			r.name === "Reception"
				? { ...r, permissions: r.permissions.filter((k) => k !== removed) }
				: r,
		);
		const heldNow = holds(apply(roles, planReseed(roles, 1, NEW)));
		expect(heldNow("Reception")).not.toContain(removed);
		expect(heldNow("Reception")).toEqual(
			expect.arrayContaining(NEW.filter((k) => seedEffective("Reception").includes(k))),
		);
	});

	it("a key no seed role holds is refused, so a misspelling does not pass silently", () => {
		expect(() => keysToAdd(storedBefore([]), ["availability_edit_everyone"])).toThrow(
			/no seed role holds/,
		);
	});
});
