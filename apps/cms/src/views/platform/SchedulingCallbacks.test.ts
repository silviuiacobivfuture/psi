import type { CallbackRow } from "@psi/scheduling";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { schedulingEn, schedulingRo } from "../../i18n-scheduling";
import { CallbacksTable } from "./SchedulingCallbacks";

const NOW = Date.parse("2026-11-16T08:00:00Z");

const fresh: CallbackRow = {
	id: "k57abcdefgh12",
	status: "new",
	createdAt: NOW,
	audience: "child",
	when: "morning",
	locale: "ro",
	channel: "form",
	page: "/contact",
	contact: { name: "DEMO Ana", phone: "0700 123 456", email: "ana@example.test" },
};
const done: CallbackRow = {
	...fresh,
	id: "k57zzzzzzzz99",
	status: "handled",
	handledAt: NOW + 60_000,
	handledBy: "cms:someone",
};
const erased: CallbackRow = { ...done, id: "k57erased0000", contact: undefined };

function html(rows: ReadonlyArray<CallbackRow>, manager = true, onlyNew = false): string {
	return renderToStaticMarkup(
		createElement(CallbacksTable, {
			brand: "psizone",
			rows,
			timeZone: "Europe/Bucharest",
			manager,
			onlyNew,
			say: (k) => `«${k}»`,
		}),
	);
}

describe("the callback requests list", () => {
	it("an empty list says so and shows no table", () => {
		const out = html([]);
		expect(out).toContain("«cbNone»");
		expect(out).not.toContain("<table");
	});

	it("a new request shows a tel and a mailto link and ONE handled form that posts its id and brand", () => {
		const out = html([fresh]);
		expect(out).toContain('href="tel:0700123456"');
		expect(out).toContain('href="mailto:ana@example.test"');
		expect(out.match(/method="post"/g)).toHaveLength(1);
		expect(out).toContain('action="/api/platform/scheduling/callback-handled"');
		expect(out).toContain('name="id" value="k57abcdefgh12"');
		expect(out).toContain('name="brand" value="psizone"');
	});

	it("a handled request has no form; an erased contact says so and shows no link", () => {
		const out = html([done, erased]);
		expect(out).not.toContain("callback-handled");
		expect(out).toContain("«cbContactErased»");
		expect(out.match(/href="tel:/g)).toHaveLength(1);
	});

	it("without the manager role nobody can mark anything, and the actions column is gone", () => {
		const out = html([fresh], false);
		expect(out).not.toContain("callback-handled");
		expect(out).not.toContain("«colActions»");
	});

	it("the filter box keeps its state and the tab", () => {
		const box = (out: string) => /<input[^>]*name="only"[^>]*>/.exec(out)?.[0] ?? "";
		expect(box(html([fresh], true, true))).toMatch(/\bchecked\b/);
		expect(box(html([fresh], true, false))).not.toMatch(/\bchecked\b/);
		expect(html([fresh])).toContain('name="tab" value="callbacks"');
	});

	it("a typed script in a name or page is escaped, never markup", () => {
		const out = html([{ ...fresh, contact: { name: "<script>x</script>" }, page: "/a<b" }]);
		expect(out).not.toContain("<script>");
		expect(out).toContain("&lt;script&gt;");
	});
});

describe("the strings", () => {
	it("every callback string exists in both languages, with the same keys", () => {
		const keys = (o: Record<string, string>) =>
			Object.keys(o)
				.filter((k) => k.startsWith("cb") || k === "scTabCallbacks")
				.sort();
		expect(keys(schedulingEn)).toEqual(keys(schedulingRo));
		expect(keys(schedulingRo).length).toBeGreaterThan(10);
	});
});
