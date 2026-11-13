import { describe, expect, it } from "vitest";
import {
	ACTION_PLACEMENTS,
	actionDefinitionSchema,
	customFieldSchema,
	customValueStorage,
	parseDefinition,
	viewDefinitionSchema,
	visibleActions,
} from "../clinic";
import { can, effectivePermissions, RECEPTION, SEED_ROLES, THERAPIST } from "../permissions";

describe("custom fields and what they store", () => {
	const custom = {
		key: "school",
		label: { ro: "Școala", en: "School" },
		type: "text",
		options: [],
		required: false,
		group: "contact",
		entity: "client",
		order: 1,
	};

	it("validate for the four entities and refuse others", () => {
		for (const entity of ["client", "appointment", "package", "staff"]) {
			expect(customFieldSchema.safeParse({ ...custom, entity }).success).toBe(true);
		}
		expect(customFieldSchema.safeParse({ ...custom, entity: "room" }).success).toBe(false);
		expect(customFieldSchema.safeParse({ ...custom, order: -1 }).success).toBe(false);
	});

	it("clinical-group values are encrypted, every other group is plain", () => {
		expect(customValueStorage("clinical")).toBe("encrypted");
		for (const g of ["core", "contact", "guardian", "money", "custom-school"]) {
			expect(customValueStorage(g)).toBe("plain");
		}
	});
});

describe("views and actions are validated data that cannot widen a permission", () => {
	const calendar = {
		key: "reception-week",
		title: { ro: "Săptămâna", en: "Week" },
		forRoles: ["Reception"],
		body: {
			surface: "calendar",
			columns: [{ kind: "practitioner", ref: "p1", color: "teal", hidden: false }],
		},
	};

	it("accepts a calendar, list and client-page view", () => {
		expect(viewDefinitionSchema.safeParse(calendar).success).toBe(true);
		expect(
			viewDefinitionSchema.safeParse({
				...calendar,
				body: {
					surface: "list",
					entity: "client",
					columns: ["name"],
					filters: [{ field: "status", equals: "active" }],
				},
			}).success,
		).toBe(true);
		expect(
			viewDefinitionSchema.safeParse({
				...calendar,
				body: {
					surface: "client_page",
					sections: [{ key: "main", title: { ro: "a", en: "a" }, fields: ["name"] }],
				},
			}).success,
		).toBe(true);
	});

	it.each([
		[
			"a raw colour",
			{
				...calendar,
				body: {
					surface: "calendar",
					columns: [{ kind: "practitioner", ref: "p1", color: "#ff0000", hidden: false }],
				},
			},
		],
		["no columns", { ...calendar, body: { surface: "calendar", columns: [] } }],
		["an unknown surface", { ...calendar, body: { surface: "map", columns: [] } }],
		[
			"an unknown column kind",
			{
				...calendar,
				body: { surface: "calendar", columns: [{ kind: "client", ref: "p1", hidden: false }] },
			},
		],
		["a bad key", { ...calendar, key: "Not Valid" }],
	])("refuses %s", (_label, input) => {
		expect(viewDefinitionSchema.safeParse(input).success).toBe(false);
	});

	const send = {
		key: "send_reminder",
		label: { ro: "Trimite memento", en: "Send reminder" },
		placement: "calendar_appointment",
		forRoles: [],
		requires: { resource: "reminders", action: "send" },
		confirm: true,
	};

	it("an action must name a permission the catalogue has", () => {
		expect(actionDefinitionSchema.safeParse(send).success).toBe(true);
		expect(
			actionDefinitionSchema.safeParse({
				...send,
				requires: { resource: "reminders", action: "delete" },
			}).success,
		).toBe(false);
		expect(
			actionDefinitionSchema.safeParse({
				...send,
				requires: { resource: "nothing", action: "send" },
			}).success,
		).toBe(false);
		expect(actionDefinitionSchema.safeParse({ ...send, placement: "footer" }).success).toBe(false);
		expect(ACTION_PLACEMENTS).toContain("calendar_appointment");
	});

	it("a button shows only where the person may actually do it, whatever the definition says", () => {
		const defs = [
			actionDefinitionSchema.parse(send),
			actionDefinitionSchema.parse({
				...send,
				key: "add_payment",
				requires: { resource: "payments", action: "create" },
			}),
			actionDefinitionSchema.parse({ ...send, key: "reception_only", forRoles: ["Reception"] }),
		];
		const role = (n: string) => SEED_ROLES.find((r) => r.name === n);
		const reception = effectivePermissions([role(RECEPTION) ?? { name: "x", permissions: [] }]);
		const therapist = effectivePermissions([role(THERAPIST) ?? { name: "x", permissions: [] }]);
		const facts = { own: true, assigned: false } as const;
		expect(
			visibleActions(defs, "calendar_appointment", [RECEPTION], reception, facts).map((d) => d.key),
		).toEqual(["send_reminder", "add_payment", "reception_only"]);
		// A therapist may send reminders for their own, but payments are not theirs, and the
		// reception-only button names a role they lack.
		expect(
			visibleActions(defs, "calendar_appointment", [THERAPIST], therapist, facts).map((d) => d.key),
		).toEqual(["send_reminder"]);
		// Not their own appointment: nothing shows, although the definition lists them.
		expect(
			visibleActions(defs, "calendar_appointment", [THERAPIST], therapist, {
				own: false,
				assigned: false,
			}),
		).toEqual([]);
		// Another placement shows nothing.
		expect(visibleActions(defs, "client_page", [RECEPTION], reception, facts)).toEqual([]);
		// And can() is what decided: the same refusal the API will give.
		expect(can(therapist, "payments", "create", facts).allowed).toBe(false);
	});

	it("parses stored JSON and names paths, not content, when it is wrong", () => {
		expect(parseDefinition(actionDefinitionSchema, JSON.stringify(send))).toMatchObject({
			ok: true,
		});
		expect(parseDefinition(actionDefinitionSchema, "{not json")).toEqual({
			ok: false,
			paths: ["(json)"],
		});
		expect(
			parseDefinition(actionDefinitionSchema, JSON.stringify({ ...send, confirm: "yes SECRET" })),
		).toEqual({ ok: false, paths: ["confirm"] });
	});
});
