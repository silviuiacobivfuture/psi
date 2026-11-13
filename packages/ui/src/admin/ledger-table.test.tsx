/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { describe, expect, it } from "vitest";
import { LedgerTable } from "./ledger-table";

const columns = [
	{ key: "date", label: "Date", slot: "start" as const },
	{
		key: "amount",
		label: "Amount",
		align: "end" as const,
		slot: "end" as const,
	},
	{ key: "method", label: "Method" },
];

describe("LedgerTable", () => {
	it("is a named table with a header row and a row per entry, every cell in its column", () => {
		const html = (
			<LedgerTable
				caption="Payments"
				columns={columns}
				empty="none"
				rows={[
					{ key: "a", cells: { date: "1 Nov", amount: "10", method: "cash" } },
					{ key: "b", cells: { date: "2 Nov", amount: "20", method: "card" } },
				]}
			/>
		).toString();
		expect(html).toContain('<table class="adm-ledger__table" aria-label="Payments">');
		expect(html.match(/<th /g)).toHaveLength(3);
		expect(html.match(/class="adm-ledger__row"/g)).toHaveLength(2);
		expect(html.match(/<td /g)).toHaveLength(6);
		expect(html).toContain('data-slot="end" data-col="amount"');
	});
	it("right-aligns numeric columns, header and cells", () => {
		const html = (
			<LedgerTable caption="p" columns={columns} empty="e" rows={[{ key: "a", cells: {} }]} />
		).toString();
		expect(html.match(/is-end/g)).toHaveLength(2);
	});
	it("says so when there are no entries, and still shows the footer row", () => {
		const html = (
			<LedgerTable
				caption="p"
				columns={columns}
				empty="No payments yet"
				rows={[]}
				footer={<b>ADD</b>}
			/>
		).toString();
		expect(html).toContain("No payments yet");
		expect(html).not.toContain("adm-ledger__row");
		expect(html).toContain("<b>ADD</b>");
	});
	it("renders a missing cell as empty, never as 'undefined'", () => {
		const html = (
			<LedgerTable
				caption="p"
				columns={columns}
				empty="e"
				rows={[{ key: "a", cells: { date: "x" } }]}
			/>
		).toString();
		expect(html).not.toMatch(/undefined|NaN/);
	});
});
