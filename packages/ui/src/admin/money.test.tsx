/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { describe, expect, it } from "vitest";
import { Money, MoneyBar } from "./money";

describe("Money", () => {
	it("lays the number and the lighter currency apart", () => {
		const html = (<Money value="1.350,00" currency="lei" />).toString();
		expect(html).toContain('adm-money__value">1.350,00<');
		expect(html).toContain("adm-money__cur");
	});
	it("omits the currency when none is given and carries a tone", () => {
		const html = (<Money value="5" tone="danger" />).toString();
		expect(html).not.toContain("adm-money__cur");
		expect(html).toContain("adm-money--danger");
	});
});

describe("MoneyBar", () => {
	const w = (paid: number, total: number): string =>
		(<MoneyBar paid={paid} total={total} label="x" />).toString();
	it.each([
		[0, 100, "0.00%", "none"],
		[25, 100, "25.00%", "part"],
		[100, 100, "100.00%", "settled"],
		[150, 100, "100.00%", "over"],
		[0, 0, "0.00%", "settled"],
		[10, 0, "100.00%", "over"],
	])("paid %i of %i fills %s (%s)", (paid, total, width, state) => {
		const html = w(paid, total);
		expect(html).toContain(`width:${width}`);
		expect(html).toContain(`adm-moneybar--${state}`);
	});
	it("is one image with a spoken value and never a non-finite number", () => {
		const html = w(33, 100);
		expect(html).toContain('role="img"');
		expect(html).toContain('aria-label="x"');
		expect(html).not.toMatch(/NaN|undefined|Infinity/);
	});
});
