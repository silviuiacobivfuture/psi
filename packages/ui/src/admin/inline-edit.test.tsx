/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { describe, expect, it } from "vitest";
import { InlineEdit, inlineValue, signalKey } from "./inline-edit";

const base = {
	id: "k1-total",
	label: "Total price",
	value: "1350,00",
	display: <b>1.350 lei</b>,
	action: "/x/save",
	save: "Save",
	cancel: "Cancel",
	hint: "Click to edit",
};

describe("InlineEdit", () => {
	it("reads as a real button with the label for assistive technology, and starts closed", () => {
		const html = (<InlineEdit {...base} />).toString();
		expect(html).toContain('<button type="button" id="ie-k1_total-view"');
		expect(html).toContain("Total price: ");
		expect(html).toContain("&quot;o&quot;:false");
		expect(html).toContain("1.350 lei");
	});
	it("opens with the raw value, saves on submit with one POST, cancels with Escape", () => {
		const html = (<InlineEdit {...base} />).toString();
		expect(html).toContain("$ie.k1_total.o = true");
		expect(html).toContain("$ie.k1_total.v = &quot;1350,00&quot;");
		expect(html).toContain('data-on:submit__prevent="@post(&#39;/x/save&#39;)');
		expect(html).toContain("evt.key === &#39;Escape&#39;");
		expect(html.match(/@post/g)).toHaveLength(1);
		expect(html).toContain('aria-label="Save"');
		expect(html).toContain('aria-label="Cancel"');
	});
	it.each([
		["text", 'type="text"'],
		["number", 'type="number"'],
		["money", 'inputmode="decimal"'],
		["textarea", "<textarea"],
	] as const)("%s uses the right control", (kind, needle) => {
		expect((<InlineEdit {...base} kind={kind} />).toString()).toContain(needle);
	});
	it("shows the quiet check only when it was just saved", () => {
		expect((<InlineEdit {...base} />).toString()).not.toContain("adm-inline__saved");
		const saved = (<InlineEdit {...base} saved savedLabel="Saved" />).toString();
		expect(saved).toContain("adm-inline__saved");
		expect(saved).toContain("Saved");
	});
	it("quotes a value with quotes and unicode safely", () => {
		const html = (<InlineEdit {...base} value={'a"b ă🙂'} />).toString();
		expect(html).not.toContain('a"b');
		expect(html).toContain("ă🙂");
	});
});

describe("inlineValue", () => {
	it("reads the typed value of one field", () => {
		expect(inlineValue({ ie: { k1_total: { o: true, v: "5" } } }, "k1-total")).toBe("5");
	});
	it.each([
		null,
		5,
		{},
		{ ie: 3 },
		{ ie: { k1_total: { o: "yes", v: 1 } } },
		{ ie: {} },
	])("gives null for %j", (body) => expect(inlineValue(body, "k1-total")).toBeNull());
	it("refuses an oversized value", () => {
		expect(inlineValue({ ie: { a: { o: true, v: "x".repeat(2001) } } }, "a")).toBeNull();
	});
	it("makes a key safe for a signal path", () => expect(signalKey("a-b.c d")).toBe("a_b_c_d"));
});
