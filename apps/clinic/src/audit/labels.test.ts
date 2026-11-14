import { describe, expect, it } from "vitest";
import { actionLabel } from "./labels";

describe("the journal names the new actions in words", () => {
	it.each([
		["file.rename", "Fișier redenumit", "File renamed"],
		["settings.update", "Setări personale schimbate", "Personal settings changed"],
		[
			"client.account_link",
			"Contul online a fost legat de client",
			"Online account linked to the client",
		],
		[
			"client.account_link_dismiss",
			"Contul online nu este al acestor clienți",
			"Online account is none of these clients",
		],
		["visitor.reschedule", "Vizitator a mutat programarea", "Visitor moved the appointment"],
	])("%s", (code, ro, en) => {
		expect(actionLabel(code, "ro")).toBe(ro);
		expect(actionLabel(code, "en")).toBe(en);
	});
});
