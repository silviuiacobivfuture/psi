import { describe, expect, it } from "vitest";
import { actionLabel } from "./labels";

describe("the journal names the new actions in words", () => {
	it.each([
		["file.rename", "Fișier redenumit", "File renamed"],
		["settings.update", "Setări personale schimbate", "Personal settings changed"],
		["visitor.reschedule", "Vizitator a mutat programarea", "Visitor moved the appointment"],
	])("%s", (code, ro, en) => {
		expect(actionLabel(code, "ro")).toBe(ro);
		expect(actionLabel(code, "en")).toBe(en);
	});
});
