import { SEED_FORM_TEMPLATES, validateResponse } from "@psi/scheduling/clinic";
import { describe, expect, it } from "vitest";
import { cellName, formToData } from "./record-form";

const template = (key: string) => {
	const found = SEED_FORM_TEMPLATES.find((t) => t.key === key);
	if (found === undefined) throw new Error(`no template ${key}`);
	return found;
};
const ABA_SESSION_REPORT = template("aba-session-report");
const PSYCHOTHERAPY_REPORT = template("psychotherapy-report");

describe("a posted form becomes a record's values", () => {
	it("keeps only what was filled in, typed by the definition", () => {
		const data = formToData(ABA_SESSION_REPORT, {
			"f.recommendations": "  Continuăm.  ",
			"f.other_details": "",
			"f.rewards_used": ["bule", "gustări"],
		});
		expect(data).toEqual({ recommendations: "Continuăm.", rewards_used: ["bule", "gustări"] });
	});
	it("reads a table's rows in order, numbers as numbers, and drops a blank row", () => {
		const data = formToData(ABA_SESSION_REPORT, {
			[cellName("programs", 0, "name")]: "Imitație",
			[cellName("programs", 0, "success")]: "70%",
			[cellName("programs", 1, "name")]: "",
			[cellName("programs", 2, "name")]: "Contact vizual",
		});
		expect(data.programs).toEqual([
			{ name: "Imitație", success: "70%" },
			{ name: "Contact vizual" },
		]);
		expect(validateResponse(ABA_SESSION_REPORT, data).ok).toBe(true);
	});
	it("never produces NaN or an empty string", () => {
		const data = formToData(PSYCHOTHERAPY_REPORT, { "f.anything": "x" });
		expect(data).toEqual({});
		expect(JSON.stringify(data)).not.toContain("NaN");
	});
	it("ignores a posted field the definition does not have, so it can never reach the record", () => {
		expect(formToData(ABA_SESSION_REPORT, { "f.nope": "x", "f.recommendations": "ok" })).toEqual({
			recommendations: "ok",
		});
	});
	it("unicode survives", () => {
		expect(formToData(ABA_SESSION_REPORT, { "f.other_details": "ăîâșț 🙂" }).other_details).toBe(
			"ăîâșț 🙂",
		);
	});
});
