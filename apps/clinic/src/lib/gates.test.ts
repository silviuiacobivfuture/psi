import { describe, expect, it } from "vitest";
import { canOf } from "./can";
import { judge } from "./gates";

const caps = (keys: string[]) => ({
	app: "psizone" as const,
	appName: "Psizone",
	timeZone: "Europe/Bucharest",
	subject: "s",
	roles: [],
	permissions: Object.fromEntries(keys.map((k) => [k, ["all" as const]])),
	fieldGroups: [],
	reach: { own: [], assigned: [] },
	platformAdmin: false,
});

const WRITES = [
	["POST", "/calendar/editor/save", "appointments_create"],
	["POST", "/calendar/editor/clients", "clients_create"],
	["POST", "/appointments/a1/attended", "appointments_edit"],
	["POST", "/appointments/a1/no-show", "appointments_edit"],
	["POST", "/appointments/a1/cancel", "appointments_cancel"],
	["POST", "/appointments/a1/pay", "payments_create"],
	["POST", "/clients/c1/packages", "packages_create"],
	["POST", "/clients/c1/packages/p1/field/name", "packages_edit"],
	["POST", "/clients/c1/packages/p1/payments", "payments_create"],
] as const;

describe("the gate table covers the appointment and package writes", () => {
	for (const [method, path, key] of WRITES) {
		it(`${method} ${path}: refused without ${key}`, () => {
			expect(judge(method, path, canOf(caps([]), false))).toBe("forbidden");
		});
		it(`${method} ${path}: allowed with ${key}`, () => {
			expect(judge(method, path, canOf(caps([key]), false))).toBe("allowed");
		});
		it(`${method} ${path}: read-only while viewing as someone else`, () => {
			expect(judge(method, path, canOf(caps([key]), true))).toBe("read-only");
		});
	}
});
