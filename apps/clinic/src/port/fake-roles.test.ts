import { describe, expect, it } from "vitest";
import { roleFromForm } from "../pages/role-form";
import { createFakePort } from "./fake";
import { PortError } from "./port";

const port = () => createFakePort({ today: "2026-11-16", members: {} });
const refusal = async (f: () => Promise<unknown>): Promise<PortError> => {
	try {
		await f();
	} catch (error) {
		if (error instanceof PortError) return error;
		throw error;
	}
	throw new Error("not refused");
};

describe("the fake's roles include one another as the service's do", () => {
	it("a role that includes another holds its cells, marked with where they come from", async () => {
		const p = port();
		const roles = await p.roles("psizone");
		const included = roles.find((r) => r.id === "accountant");
		const made = await p.createRole("psizone", { name: "Birou", description: "", copyFrom: null });
		const saved = await p.saveRole("psizone", { ...made, includes: ["accountant"] });
		expect(saved.includes).toEqual(["accountant"]);
		const [resource, actions] = Object.entries(included?.grants ?? {})[0] ?? [];
		const [action] = Object.keys(actions ?? {});
		expect(resource).toBeDefined();
		expect(saved.inherited?.[resource ?? ""]?.[action ?? ""]?.from).toBe("accountant");
		expect(saved.effective?.length).toBeGreaterThan(0);
	});

	it.each([
		["itself", (id: string) => [id], "self"],
		["an unknown role", () => ["nope"], "unknown"],
	] as const)("refuses including %s and keeps the role as it was", async (_w, list, kind) => {
		const p = port();
		const made = await p.createRole("psizone", { name: "Birou", description: "", copyFrom: null });
		const e = await refusal(() => p.saveRole("psizone", { ...made, includes: [...list(made.id)] }));
		expect(e.code).toBe("invalid");
		expect(e.message).toContain(kind);
		expect((await p.roles("psizone")).find((r) => r.id === made.id)?.includes).toEqual([]);
	});

	it("refuses a cycle, and deleting a role another includes", async () => {
		const p = port();
		const a = await p.createRole("psizone", { name: "A", description: "", copyFrom: null });
		const b = await p.createRole("psizone", { name: "B", description: "", copyFrom: null });
		await p.saveRole("psizone", { ...b, includes: [a.id] });
		expect(
			(await refusal(() => p.saveRole("psizone", { ...a, includes: [b.id] }))).message,
		).toContain("cycle");
		expect((await refusal(() => p.deleteRole("psizone", a.id))).code).toBe("conflict");
	});
});

describe("the role sheet's form sends the roles it includes", () => {
	it("every ticked role, once, never the role itself; none ticked is none", async () => {
		const role = (await port().roles("psizone")).find((r) => r.id === "reception");
		if (role === undefined) throw new Error("no reception");
		expect(
			roleFromForm(role, { include: ["accountant", "therapist", "accountant", "reception"] })
				.includes,
		).toEqual(["accountant", "therapist"]);
		expect(roleFromForm(role, { include: "accountant" }).includes).toEqual(["accountant"]);
		expect(roleFromForm(role, {}).includes).toEqual([]);
	});
});
