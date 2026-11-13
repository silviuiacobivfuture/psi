import { describe, expect, it } from "vitest";
import { roleLabel, roleName } from "./chrome";

const OPAQUE = "p575js6nw200mthsy0215kwmjn8j43wb";

describe("a role's name for people", () => {
	it("translates a seed role told by its id", () => {
		expect(roleName("psizone-owner", "ro")).toBe("Proprietar");
		expect(roleName("psizone-reception", "en")).toBe("Reception");
	});

	it("translates a seed role whose id is opaque, from the name the service gives", () => {
		expect(roleName(OPAQUE, "ro", { [OPAQUE]: "Owner" })).toBe("Proprietar");
		expect(roleName(OPAQUE, "ro", { [OPAQUE]: "Reception" })).toBe("Recepție");
		expect(roleName(OPAQUE, "ro", { [OPAQUE]: "Therapist" })).toBe("Terapeut");
		expect(roleName(OPAQUE, "en", { [OPAQUE]: "Owner" })).toBe("Owner");
	});

	it("shows a custom role by its own name, and only then by its id", () => {
		expect(roleName(OPAQUE, "ro", { [OPAQUE]: "Contabil extern" })).toBe("Contabil extern");
		expect(roleName(OPAQUE, "ro")).toBe(OPAQUE);
		expect(roleName(OPAQUE, "ro", { other: "Owner" })).toBe(OPAQUE);
	});

	it("labels a role of the roles list the same way", () => {
		expect(roleLabel({ id: OPAQUE, name: "Owner" }, "ro")).toBe("Proprietar");
		expect(roleLabel({ id: OPAQUE, name: "Contabil extern" }, "ro")).toBe("Contabil extern");
	});
});
