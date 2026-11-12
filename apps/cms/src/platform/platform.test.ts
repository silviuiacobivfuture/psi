import { describe, expect, it } from "vitest";
import { interimAuthorizer } from "../authz/interim";
import { RELATIONS, type Subject } from "../authz/types";
import { pickBrand } from "./access";
import { decideAction } from "./http";
import { SECTIONS, type Section } from "./sections";

/**
 * Each section's allow/deny paths, decided by the interim adapter over authz.manifest.json (the
 * same roles Polaris holds), never by a role the CMS keeps.
 */
const a = interimAuthorizer(
	[
		"admin@psi.test=cms:admin",
		"editor@psi.test=cms:editor@psizone",
		"reception@psi.test=cms:calendar_manager@psizone",
		"viewer@psi.test=cms:calendar_viewer@eqsync",
		"dpo@psi.test=cms:privacy_officer@psizone",
		"ops@psi.test=cms:ai_operator@hemisync+cms:notifications_admin@blog",
		"aiadmin@psi.test=cms:ai_admin@eqsync",
		"owner@psi.test=cms:site_manager@psizone",
	].join(";"),
	() => {},
);
const who = (email: string): Subject => ({ userId: "9", sub: `sub-${email}`, email, groups: [] });

async function may(
	email: string,
	section: Section,
	kind: "view" | "act",
	brand: string,
): Promise<number> {
	const relation = SECTIONS[section][kind];
	if (relation === null) return 405;
	const d = decideAction("9", await a.brands(who(email), relation), brand);
	return "status" in d ? d.status : 200;
}

describe("the control plane's sections, per relation and brand", () => {
	it("needs every section relation to exist in the manifest", () => {
		for (const s of Object.values(SECTIONS)) {
			expect(RELATIONS).toContain(s.view);
			if (s.act !== null) expect(RELATIONS).toContain(s.act);
		}
	});
	it("lets the administrator act everywhere", async () => {
		for (const section of [
			"ai",
			"scheduling",
			"accounts",
			"notifications",
			"siteSettings",
		] as const) {
			for (const brand of ["psizone", "eqsync", "hemisync", "blog"]) {
				expect(await may("admin@psi.test", section, "act", brand)).toBe(200);
			}
		}
	});
	it("lets an editor see the overview and the AI page of their brand only, and act nowhere", async () => {
		expect(await may("editor@psi.test", "overview", "view", "psizone")).toBe(200);
		expect(await may("editor@psi.test", "overview", "view", "eqsync")).toBe(403);
		expect(await may("editor@psi.test", "ai", "act", "psizone")).toBe(403);
		expect(await may("editor@psi.test", "scheduling", "view", "psizone")).toBe(403);
		expect(await may("editor@psi.test", "accounts", "view", "psizone")).toBe(403);
		expect(await may("editor@psi.test", "siteSettings", "act", "psizone")).toBe(403);
	});
	it("separates seeing the calendar from deciding on it", async () => {
		expect(await may("reception@psi.test", "scheduling", "act", "psizone")).toBe(200);
		expect(await may("reception@psi.test", "scheduling", "act", "eqsync")).toBe(403);
		expect(await may("viewer@psi.test", "scheduling", "view", "eqsync")).toBe(200);
		expect(await may("viewer@psi.test", "scheduling", "act", "eqsync")).toBe(403);
	});
	it("keeps accounts to the privacy officer, on their brand", async () => {
		expect(await may("dpo@psi.test", "accounts", "act", "psizone")).toBe(200);
		expect(await may("dpo@psi.test", "accounts", "act", "blog")).toBe(403);
		expect(await may("ops@psi.test", "accounts", "view", "blog")).toBe(403);
	});
	it("binds the AI operator and the notifications admin to their own brands", async () => {
		expect(await may("ops@psi.test", "ai", "act", "hemisync")).toBe(200);
		expect(await may("ops@psi.test", "ai", "act", "psizone")).toBe(403);
		expect(await may("ops@psi.test", "notifications", "act", "blog")).toBe(200);
		expect(await may("ops@psi.test", "notifications", "act", "hemisync")).toBe(403);
		// The AI administrator also operates the guide on their brand.
		expect(await may("aiadmin@psi.test", "ai", "act", "eqsync")).toBe(200);
	});
	it("lets the site manager change their brand's settings only", async () => {
		expect(await may("owner@psi.test", "siteSettings", "act", "psizone")).toBe(200);
		expect(await may("owner@psi.test", "siteSettings", "act", "eqsync")).toBe(403);
	});
	it("refuses the anonymous and an unknown brand", () => {
		expect(decideAction(null, ["psizone"], "psizone")).toEqual({ status: 401, error: "sign in" });
		expect(decideAction("1", ["psizone"], "acme")).toEqual({ status: 400, error: "brand" });
	});
	it("shows the brand asked for only when it is allowed", () => {
		expect(pickBrand(["eqsync"], "psizone", null)).toBe("eqsync");
		expect(pickBrand(["psizone", "eqsync"], "eqsync", "psizone")).toBe("eqsync");
		expect(pickBrand(["psizone", "eqsync"], undefined, "eqsync")).toBe("eqsync");
		expect(pickBrand([], "psizone", "psizone")).toBeNull();
	});
});
