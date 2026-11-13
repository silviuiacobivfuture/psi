import { describe, expect, it } from "vitest";
import {
	coerceAnswer,
	type FormDefinition,
	formDefinitionSchema,
	LONGTEXT_MAX,
	SEED_FORM_TEMPLATES,
	TABLE_CELL_MAX,
	TEMPLATE_RESOURCE,
	TEXT_MAX,
	validateResponse,
} from "../clinic";
import { isPermissionKey } from "../permissions";

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
			"table",
			"text",
		]);
	});
});

describe("validating a response against the version it was written with", () => {
	const aba = template("aba-session-report");

	it("accepts a partial response (every seeded field is optional)", () => {
		const check = validateResponse(aba, {
			programs: [{ name: "Test program 1", success: "3/5" }],
			intervention_efficiency: "Eficient",
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

describe("the table field", () => {
	const base = { key: "form-t", version: 1, kind: "report", title: { ro: "a", en: "a" } };
	const label = { ro: "a", en: "a" };
	const table = (extra: Record<string, unknown> = {}) => ({
		key: "rows",
		label,
		type: "table",
		options: [],
		required: false,
		group: "clinical",
		columns: [
			{ key: "name", label, type: "text" },
			{ key: "score", label, type: "number" },
		],
		...extra,
	});

	it("needs distinct columns, and only a table has them; learned options only on a choice", () => {
		expect(formDefinitionSchema.safeParse({ ...base, fields: [table()] }).success).toBe(true);
		for (const bad of [
			table({ columns: [] }),
			table({ columns: undefined }),
			table({
				columns: [
					{ key: "a", label, type: "text" },
					{ key: "a", label, type: "text" },
				],
			}),
			{ ...table(), type: "text" },
			{ ...table({ columns: undefined }), type: "text", learnOptions: true },
		]) {
			expect(formDefinitionSchema.safeParse({ ...base, fields: [bad] }).success).toBe(false);
		}
	});

	it("validates a list of rows against its columns, naming the field and never the value", () => {
		const def = formDefinitionSchema.parse({ ...base, fields: [table()] });
		expect(validateResponse(def, { rows: [{ name: "a", score: 3 }, { name: "b" }] }).ok).toBe(true);
		expect(validateResponse(def, { rows: [] }).ok).toBe(true);
		for (const bad of [[{ name: 1 }], [{ other: "x" }], ["x"], "x", [{ score: "3" }]]) {
			expect(validateResponse(def, { rows: bad })).toEqual({
				ok: false,
				problems: [{ field: "rows", code: "invalid" }],
			});
		}
	});

	it("reads rows from a list or JSON text, drops empty cells and rows, refuses an unknown filled cell", () => {
		const columns = [
			{ key: "name", label, type: "text" as const },
			{ key: "score", label, type: "number" as const },
		];
		expect(
			coerceAnswer("table", [{ name: "a", score: "3" }, { name: "", score: null }, {}], columns),
		).toEqual({
			ok: true,
			value: [{ name: "a", score: 3 }],
		});
		expect(coerceAnswer("table", '[{"name":"a"}]', columns)).toEqual({
			ok: true,
			value: [{ name: "a" }],
		});
		expect(coerceAnswer("table", [], columns)).toEqual({ ok: true, value: undefined });
		expect(coerceAnswer("table", "", columns)).toEqual({ ok: true, value: undefined });
		expect(coerceAnswer("table", [{ stray: "x" }], columns)).toEqual({ ok: false });
		expect(coerceAnswer("table", [{ stray: "" }], columns)).toEqual({ ok: true, value: undefined });
		expect(coerceAnswer("table", "{bad", columns)).toEqual({ ok: false });
	});
});

describe("length caps: enforced by the builder, never applied to what an import brings", () => {
	const label = { ro: "a", en: "a" };
	const field = (key: string, type: string, extra: Record<string, unknown> = {}) => ({
		key,
		label,
		type,
		options: [],
		required: false,
		group: "clinical",
		...extra,
	});
	const def = formDefinitionSchema.parse({
		key: "caps",
		version: 1,
		kind: "report",
		title: label,
		fields: [
			field("t", "text"),
			field("l", "longtext"),
			field("c", "choice"),
			field("m", "multichoice"),
			field("tab", "table", {
				columns: [
					{ key: "name", label, type: "text" },
					{ key: "pick", label, type: "choice" },
					{ key: "notes", label, type: "longtext" },
				],
			}),
		],
	});
	const text = (n: number) => "x".repeat(n);
	const cases: Array<[string, number, (v: string) => Record<string, unknown>]> = [
		["text", TEXT_MAX, (v) => ({ t: v })],
		["longtext", LONGTEXT_MAX, (v) => ({ l: v })],
		["choice", TEXT_MAX, (v) => ({ c: v })],
		["multichoice item", TEXT_MAX, (v) => ({ m: [v] })],
		["table text cell", TABLE_CELL_MAX, (v) => ({ tab: [{ name: v }] })],
		["table choice cell", TABLE_CELL_MAX, (v) => ({ tab: [{ pick: v }] })],
		["table longtext cell", LONGTEXT_MAX, (v) => ({ tab: [{ notes: v }] })],
	];

	it("the caps are the agreed ones", () => {
		expect([TEXT_MAX, LONGTEXT_MAX, TABLE_CELL_MAX]).toEqual([4_000, 50_000, 20_000]);
	});

	it.each(cases)("%s: cap-1 and cap pass, cap+1 is refused by the builder", (_n, cap, make) => {
		expect(validateResponse(def, make(text(cap - 1))).ok).toBe(true);
		expect(validateResponse(def, make(text(cap))).ok).toBe(true);
		expect(validateResponse(def, make(text(cap + 1))).ok).toBe(false);
	});

	it.each(cases)("%s: uncapped keeps cap+1 whole", (_n, cap, make) => {
		const check = validateResponse(def, make(text(cap + 1)), { uncapped: true });
		expect(check.ok).toBe(true);
		expect(JSON.stringify(check.ok ? check.values : {})).toContain(text(cap + 1));
	});
});
