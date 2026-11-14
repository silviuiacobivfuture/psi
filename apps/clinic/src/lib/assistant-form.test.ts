import { type AssistantCeilingsType, BUILT_IN_CEILINGS } from "@psi/scheduling-sdk/contract";
import { describe, expect, it } from "vitest";
import {
	ceilingShown,
	orgDocFromForm,
	patchFromForm,
	platformDocFromForm,
	SETTING_FIELDS,
	shown,
	valueAt,
} from "./assistant-form";

describe("the settings form, read back", () => {
	it("an empty form changes nothing: every setting inherited", () => {
		expect(patchFromForm({}, "staff", "staff")).toEqual({});
		expect(orgDocFromForm({}, undefined, 0, [])).toEqual({
			ok: true,
			doc: { revision: 0, staff: {}, visitor: {}, skills: [], roles: {}, people: {} },
		});
	});
	it("reads each kind: numbers, dollars to micro-dollars, switches, lists, text kept as written", () => {
		const patch = patchFromForm(
			{
				"staff.maxToolCalls": "6",
				"staff.temperature": "0.4",
				"staff.budget.monthlyMicroUsd": "7.25",
				"staff.budget.hardStop": "off",
				"staff.model.fallbacks": " a/b , c/d ,",
				"staff.prompt.append": "Linia 1\r\nLinia 2",
				"staff.tone": "formal",
				"staff.handoff.contact": "  ",
			},
			"staff",
			"staff",
		);
		expect(patch).toEqual({
			maxToolCalls: 6,
			temperature: 0.4,
			budget: { monthlyMicroUsd: 7_250_000, hardStop: false },
			model: { fallbacks: ["a/b", "c/d"] },
			prompt: { append: "Linia 1\nLinia 2" },
			tone: "formal",
		});
	});
	it("the booking settings belong to the site's assistant only", () => {
		expect(patchFromForm({ "staff.booking.horizonDays": "9" }, "staff", "staff")).toEqual({});
		expect(patchFromForm({ "visitor.booking.horizonDays": "9" }, "visitor", "visitor")).toEqual({
			booking: { horizonDays: 9 },
		});
	});
	it("a value that is not one is refused by the schema, naming where", () => {
		const out = orgDocFromForm({ "staff.maxToolCalls": "multe" }, undefined, 0, []);
		expect(out.ok).toBe(false);
		if (!out.ok) expect(out.fields).toContain("staff.maxToolCalls");
	});
	it("skills: the empty new row is skipped, a removed one dropped, a new one named from its title; unicode kept", () => {
		const out = orgDocFromForm(
			{
				"skill.0.id": "keep",
				"skill.0.name": "Păstrată",
				"skill.0.instructions": "x",
				"skill.0.enabled": "on",
				"skill.1.id": "gone",
				"skill.1.name": "Ștearsă",
				"skill.1.remove": "on",
				"skill.2.name": "Ședință nouă",
				"skill.2.instructions": "y",
				"skill.2.triggers": "ședință, terapie",
				"skill.2.surface.visitor": "on",
				"skill.3.name": "",
			},
			undefined,
			0,
			[],
		);
		expect(out.ok).toBe(true);
		if (!out.ok) return;
		expect(out.doc.skills.map((s) => [s.id, s.name, s.enabled, s.surfaces])).toEqual([
			["keep", "Păstrată", true, ["staff"]],
			["sedinta-noua", "Ședință nouă", false, ["visitor"]],
		]);
		expect(out.doc.skills[1]?.triggers).toEqual(["ședință", "terapie"]);
	});
	it("roles: only the roles of the organisation, only what is filled in; people overrides kept as they were", () => {
		const held = {
			revision: 2,
			staff: {},
			visitor: {},
			skills: [],
			roles: {},
			people: { p1: { enabled: false } },
		};
		const out = orgDocFromForm(
			{
				"role.role-1.maxToolCalls": "3",
				"role.role-1.enabled": "off",
				"role.role-2.model": "",
				"role.zz.maxToolCalls": "9",
			},
			held,
			2,
			["role-1", "role-2"],
		);
		expect(out).toEqual({
			ok: true,
			doc: { ...held, roles: { "role-1": { maxToolCalls: 3, enabled: false } } },
		});
	});
	it("every setting the screens edit is a path of the settings", () => {
		for (const field of SETTING_FIELDS)
			expect(field.key.startsWith("as_f_"), field.path).toBe(true);
		expect(valueAt({ a: { b: 3 } }, "a.b")).toBe(3);
		expect(valueAt({ a: 1 }, "a.b")).toBeUndefined();
		expect(shown("usd", 1_500_000)).toBe("1.5");
		expect(shown("bool", false)).toBe("off");
		expect(shown("list", ["x", "y"])).toBe("x, y");
		expect(shown("int", undefined)).toBe("");
	});
});

describe("the platform's form, read back", () => {
	const ceilings = (surface: "staff" | "visitor"): Record<string, string> =>
		Object.fromEntries(
			Object.keys(BUILT_IN_CEILINGS[surface])
				.filter((k): k is keyof AssistantCeilingsType =>
					Object.hasOwn(BUILT_IN_CEILINGS[surface], k),
				)
				.map((k) => [`ceilings.${surface}.${k}`, ceilingShown(k, BUILT_IN_CEILINGS[surface])]),
		);
	it("the ceilings as shown read back as they were", () => {
		const out = platformDocFromForm({ ...ceilings("staff"), ...ceilings("visitor") }, 4);
		expect(out).toEqual({
			ok: true,
			doc: { revision: 4, defaults: { staff: {}, visitor: {} }, ceilings: BUILT_IN_CEILINGS },
		});
	});
	it("a missing ceiling is refused", () => {
		expect(platformDocFromForm(ceilings("staff"), 0).ok).toBe(false);
	});
});
