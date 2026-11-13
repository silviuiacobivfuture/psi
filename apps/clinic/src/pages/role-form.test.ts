import { describe, expect, it } from "vitest";
import { seedApp } from "../port/seed";
import { roleFromForm } from "./role-form";

const role = seedApp("psizone", "2026-11-13").roles.find((r) => r.id === "reception");
if (role === undefined) throw new Error("seed has no reception role");

describe("roleFromForm", () => {
	it("takes the scopes and field groups the form sends", () => {
		const next = roleFromForm(role, {
			"perm.appointments.view": "own",
			"perm.appointments.edit": "none",
			"field.contact": "on",
		});
		expect(next.grants.appointments).toEqual({ view: "own" });
		expect(next.fieldGroups).toEqual(["contact"]);
	});
	it("drops an action the resource does not offer and a scope that does not exist", () => {
		const next = roleFromForm(role, {
			"perm.prices.create": "all",
			"perm.clients.view": "everything",
			"perm.nonsense.view": "all",
		});
		expect(next.grants).toEqual({});
	});
	it("keeps the role's identity: name, description, members", () => {
		const next = roleFromForm(role, {});
		expect({ id: next.id, name: next.name, members: next.members }).toEqual({
			id: role.id,
			name: role.name,
			members: role.members,
		});
		expect(next.grants).toEqual({});
		expect(next.fieldGroups).toEqual([]);
	});
});
