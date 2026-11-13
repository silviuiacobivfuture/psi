import { describe, expect, it } from "vitest";
import {
	coerceAnswer,
	formDefinitionSchema,
	LONGTEXT_MAX,
	TABLE_CELL_MAX,
	TEXT_MAX,
	validateResponse,
} from "../clinic";

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
