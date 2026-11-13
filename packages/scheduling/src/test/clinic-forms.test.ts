import { describe, expect, it } from "vitest";
import {
	ACTION_PLACEMENTS,
	actionDefinitionSchema,
	coerceAnswer,
	customFieldSchema,
	customValueStorage,
	type FormDefinition,
	formDefinitionSchema,
	parseDefinition,
	SEED_FORM_TEMPLATES,
	TEMPLATE_RESOURCE,
	validateResponse,
	viewDefinitionSchema,
	visibleActions,
} from "../clinic";
import {
	can,
	effectivePermissions,
	isPermissionKey,
	RECEPTION,
	SEED_ROLES,
	THERAPIST,
} from "../permissions";

const template = (key: string): FormDefinition => {
	const found = SEED_FORM_TEMPLATES.find((t) => t.key === key);
	if (found === undefined) throw new Error(`no template ${key}`);
	return found;
};

describe("the four seeded templates", () => {
	const EXPECTED: Record<string, ReadonlyArray<string>> = {
		"aba-session-report": [
			"programs",
			"rewards_used",
			"reward_types",
			"reward_quality",
			"other_details",
			"receptive_to",
			"gaps_observed",
			"retained_skills",
			"improvements_needed",
			"emotional_states",
			"emotional_notes",
			"behaviours",
			"other_behaviour",
			"strategies",
			"other_strategy",
			"intervention_efficiency",
			"triggers",
			"parent_feedback",
			"recommendations",
		],
		"race-me-up-report": [
			"posts",
			"emotional_states",
			"emotional_notes",
			"behaviours",
			"other_behaviour",
			"strategies",
			"other_strategy",
			"intervention_efficiency",
			"triggers",
			"parent_feedback",
			"recommendations",
		],
		"psychotherapy-report": [
			"format",
			"presence",
			"session_number",
			"duration_min",
			"mood_start",
			"predominant_emotions",
			"emotions_notes",
			"homework_check",
			"homework_notes",
			"session_content",
			"techniques_used",
			"nfb_method",
			"nfb_protocol",
			"nfb_duration",
			"nfb_tolerance",
			"nfb_client_feedback",
			"clinical_observations",
			"homework_assigned",
			"recommendations_next",
			"mood_end",
			"next_session_date",
		],
		"parent-questionnaire": [
			"mood",
			"sleep_quality",
			"energy",
			"behavioural_crises",
			"crises_context",
			"rules_reaction",
			"focus_level",
			"follows_instructions",
			"social_interaction",
			"anxiety_frequency",
			"positive_changes",
			"concerns",
			"therapist_questions",
			"overall_evolution",
			"reception_rating",
			"staff_rating",
			"space_rating",
			"feels_informed",
			"schedule_fits",
			"would_recommend",
			"suggestions",
		],
	};

	it("carry exactly the fields of the old app, in order", () => {
		expect(SEED_FORM_TEMPLATES.map((t) => t.key)).toEqual(Object.keys(EXPECTED));
		for (const t of SEED_FORM_TEMPLATES)
			expect(t.fields.map((f) => f.key)).toEqual(EXPECTED[t.key]);
	});

	it("are version 1, valid, bilingual, clinical and optional, and governed by a real permission", () => {
		for (const t of SEED_FORM_TEMPLATES) {
			expect(formDefinitionSchema.safeParse(t).success).toBe(true);
			expect(t.version).toBe(1);
			for (const f of t.fields) {
				expect(f.group).toBe("clinical");
				expect(f.required).toBe(false);
				expect(f.label.ro.length).toBeGreaterThan(0);
				expect(f.label.en.length).toBeGreaterThan(0);
			}
			expect(
				isPermissionKey(`${TEMPLATE_RESOURCE[t.key as keyof typeof TEMPLATE_RESOURCE]}_view_own`),
			).toBe(true);
		}
	});

	it("use every field type the builder names across the seeds and customs", () => {
		const used = new Set(SEED_FORM_TEMPLATES.flatMap((t) => t.fields.map((f) => f.type)));
		expect([...used].sort()).toEqual([
			"choice",
			"date",
			"longtext",
			"multichoice",
			"number",
			"rating",
			"text",
		]);
	});
});

describe("validating a response against the version it was written with", () => {
	const aba = template("aba-session-report");

	it("accepts a partial response (every seeded field is optional)", () => {
		const check = validateResponse(aba, {
			programs: ["Test program 1"],
			intervention_efficiency: 4,
			parent_feedback: "Test feedback",
		});
		expect(check).toMatchObject({ ok: true });
	});

	it("names the field and a code for each problem, and never the value", () => {
		const check = validateResponse(aba, {
			intervention_efficiency: 11,
			programs: "not a list",
			nonsense: "SECRET CLINICAL TEXT",
		});
		expect(check.ok).toBe(false);
		if (!check.ok) {
			expect(check.problems).toEqual([
				{ field: "nonsense", code: "unknown_field" },
				{ field: "programs", code: "invalid" },
				{ field: "intervention_efficiency", code: "invalid" },
			]);
			expect(JSON.stringify(check.problems)).not.toContain("SECRET");
		}
	});

	it("an old response stays valid under its own version after a new version tightens a field", () => {
		const v1 = template("parent-questionnaire");
		const v2 = formDefinitionSchema.parse({
			...v1,
			version: 2,
			fields: v1.fields.map((f) => (f.key === "mood" ? { ...f, required: true } : f)),
		});
		const old = { suggestions: "Test suggestion" };
		expect(validateResponse(v1, old).ok).toBe(true);
		expect(validateResponse(v2, old)).toEqual({
			ok: false,
			problems: [{ field: "mood", code: "required" }],
		});
	});

	it("enforces options where a definition has them, and every field type", () => {
		const def = formDefinitionSchema.parse({
			key: "all-types",
			version: 1,
			kind: "questionnaire",
			title: { ro: "Toate", en: "All" },
			fields: [
				{
					key: "a_text",
					label: { ro: "a", en: "a" },
					type: "text",
					options: [],
					required: true,
					group: "core",
				},
				{
					key: "a_long",
					label: { ro: "a", en: "a" },
					type: "longtext",
					options: [],
					required: false,
					group: "core",
				},
				{
					key: "a_num",
					label: { ro: "a", en: "a" },
					type: "number",
					options: [],
					required: false,
					group: "core",
					min: 1,
					max: 3,
				},
				{
					key: "a_money",
					label: { ro: "a", en: "a" },
					type: "money",
					options: [],
					required: false,
					group: "money",
				},
				{
					key: "a_date",
					label: { ro: "a", en: "a" },
					type: "date",
					options: [],
					required: false,
					group: "core",
				},
				{
					key: "a_choice",
					label: { ro: "a", en: "a" },
					type: "choice",
					required: false,
					group: "core",
					options: [{ value: "x", label: { ro: "x", en: "x" } }],
				},
				{
					key: "a_multi",
					label: { ro: "a", en: "a" },
					type: "multichoice",
					required: false,
					group: "core",
					options: [
						{ value: "x", label: { ro: "x", en: "x" } },
						{ value: "y", label: { ro: "y", en: "y" } },
					],
				},
				{
					key: "a_yes",
					label: { ro: "a", en: "a" },
					type: "yesno",
					options: [],
					required: false,
					group: "core",
				},
				{
					key: "a_file",
					label: { ro: "a", en: "a" },
					type: "file",
					options: [],
					required: false,
					group: "core",
				},
				{
					key: "a_rate",
					label: { ro: "a", en: "a" },
					type: "rating",
					options: [],
					required: false,
					group: "core",
					min: 1,
					max: 5,
				},
			],
		});
		const good = {
			a_text: "t",
			a_long: "l",
			a_num: 2,
			a_money: 1500,
			a_date: "2026-10-25",
			a_choice: "x",
			a_multi: ["x", "y"],
			a_yes: false,
			a_file: "files/1",
			a_rate: 5,
		};
		expect(validateResponse(def, good)).toMatchObject({ ok: true });
		const bad = {
			a_num: 4,
			a_money: 1.5,
			a_date: "2026-02-30",
			a_choice: "z",
			a_multi: ["x", "z"],
			a_yes: "yes",
			a_file: "",
			a_rate: 0,
		};
		const result = validateResponse(def, bad);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.problems.map((p) => `${p.field}:${p.code}`).sort()).toEqual(
				[
					"a_choice:invalid",
					"a_date:invalid",
					"a_file:invalid",
					"a_money:invalid",
					"a_multi:invalid",
					"a_num:invalid",
					"a_rate:invalid",
					"a_text:required",
					"a_yes:invalid",
				].sort(),
			);
		}
	});
});

describe("form definitions refuse unsound builds", () => {
	const field = {
		key: "a",
		label: { ro: "a", en: "a" },
		type: "text",
		options: [],
		required: false,
		group: "core",
	};
	const base = { key: "form-x", version: 1, kind: "report", title: { ro: "a", en: "a" } };

	it.each([
		["no fields", { ...base, fields: [] }],
		["duplicate keys", { ...base, fields: [field, field] }],
		["a bad key", { ...base, fields: [{ ...field, key: "Bad Key" }] }],
		[
			"options on a text field",
			{ ...base, fields: [{ ...field, options: [{ value: "x", label: { ro: "x", en: "x" } }] }] },
		],
		[
			"duplicate options",
			{
				...base,
				fields: [
					{
						...field,
						type: "choice",
						options: [
							{ value: "x", label: { ro: "x", en: "x" } },
							{ value: "x", label: { ro: "y", en: "y" } },
						],
					},
				],
			},
		],
		["an unknown group", { ...base, fields: [{ ...field, group: "secrets" }] }],
		["a missing english label", { ...base, fields: [{ ...field, label: { ro: "a", en: "" } }] }],
		["an unknown type", { ...base, fields: [{ ...field, type: "signature" }] }],
		["min above max", { ...base, fields: [{ ...field, type: "number", min: 5, max: 1 }] }],
		["version zero", { ...base, version: 0, fields: [field] }],
	])("refuses %s", (_label, input) => {
		expect(formDefinitionSchema.safeParse(input).success).toBe(false);
	});

	it("accepts a custom group", () => {
		expect(
			formDefinitionSchema.safeParse({ ...base, fields: [{ ...field, group: "custom-school" }] })
				.success,
		).toBe(true);
	});
});

describe("reading loose source values", () => {
	it.each([
		["text", "abc", "abc"],
		["text", 5, "5"],
		["text", "  ", undefined],
		["text", null, undefined],
		["longtext", "x\ny", "x\ny"],
		["choice", true, "yes"],
		["choice", 7, "7"],
		["number", "12,5", 12.5],
		["number", 3, 3],
		["rating", "4", 4],
		["rating", 4.4, 4],
		["date", "2026-10-25T03:30:00+00:00", "2026-10-25"],
		["yesno", "Da", true],
		["yesno", 0, false],
		["multichoice", ["a", " ", "b"], ["a", "b"]],
		["multichoice", '["a","b"]', ["a", "b"]],
		["multichoice", "just one", ["just one"]],
		["multichoice", [], undefined],
		["multichoice", "", undefined],
	] as const)("%s from %j", (type, raw, value) => {
		expect(coerceAnswer(type, raw)).toEqual({ ok: true, value });
	});

	it.each([
		["number", "abc"],
		["number", true],
		["number", { a: 1 }],
		["rating", "high"],
		["date", "tomorrow"],
		["date", 20261025],
		["yesno", "maybe"],
		["multichoice", [{ a: 1 }]],
		["multichoice", "[not json"],
		["multichoice", { a: 1 }],
		["text", { a: 1 }],
		["text", ["a"]],
	] as const)("refuses %s from %j", (type, raw) => {
		expect(coerceAnswer(type, raw)).toEqual({ ok: false });
	});
});

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
