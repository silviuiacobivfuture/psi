import { beforeEach, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";

const ME = "/v1/apps/psizone/me";
type Me = {
	app: string;
	appName: string;
	timeZone: string;
	subject: string;
	displayName?: string;
	roles: string[];
	permissions: Record<string, string[]>;
	fieldGroups: string[];
	platformAdmin: boolean;
};
const meOf = async (w: Populated, who: string): Promise<Me> => {
	const r = await w.call(who, "GET", ME);
	expect(r.status, JSON.stringify(r.json)).toBe(200);
	return r.json as unknown as Me;
};

describe("GET /v1/apps/:app/me: who the caller is in this app and what they may do", () => {
	let w: Populated;
	beforeEach(async () => {
		w = await createWorld();
	});

	it("the owner holds everything, in every field group, including roles and the audit log", async () => {
		const me = await meOf(w, "olga");
		expect(me).toMatchObject({
			app: "psizone",
			appName: "Psizone",
			timeZone: "Europe/Bucharest",
			subject: "olga",
			roles: ["psizone-owner"],
			platformAdmin: false,
		});
		expect(me.permissions.roles_edit).toEqual([]);
		expect(me.permissions.audit_view).toEqual([]);
		expect(me.permissions.clients_view).toEqual(["all", "assigned", "own"]);
		expect(me.fieldGroups).toEqual(["contact", "guardian", "money", "clinical"]);
	});

	it("reception sees money and contact but holds no clinical group, no roles, no audit", async () => {
		const me = await meOf(w, "rita");
		expect(me.fieldGroups).toEqual(["contact", "guardian", "money"]);
		expect(me.permissions.clients_clinical_view).toBeUndefined();
		expect(me.permissions.roles_view).toBeUndefined();
		expect(me.permissions.audit_view).toBeUndefined();
		expect(me.permissions.requests_view).toEqual([]);
		expect(me.permissions.appointments_create).toEqual(["all"]);
	});

	it("a therapist holds the clinical group and only their own scope", async () => {
		const me = await meOf(w, "dora");
		expect(me.fieldGroups).toContain("clinical");
		expect(me.fieldGroups).not.toContain("money");
		expect(me.permissions.calendar_view).toEqual(["own"]);
		expect(me.permissions.requests_view).toBeUndefined();
	});

	it("a coordinator holds the assigned scope, a volunteer almost nothing", async () => {
		expect((await meOf(w, "cora")).permissions.calendar_view).toEqual(["assigned"]);
		const vera = await meOf(w, "vera");
		expect(Object.keys(vera.permissions).sort()).toEqual([
			"leave_create",
			"leave_view",
			"roster_view",
		]);
		expect(vera.fieldGroups).toEqual([]);
	});

	it("an individual denial takes the permission, and its field group, away", async () => {
		await w.call("olga", "PUT", "/v1/apps/psizone/members/rita/overrides", {
			grant: [],
			deny: ["clients_contact_view"],
		});
		const me = await meOf(w, "rita");
		expect(me.permissions.clients_contact_view).toBeUndefined();
		expect(me.fieldGroups).not.toContain("contact");
	});

	it("an individual grant is reflected", async () => {
		await w.call("olga", "PUT", "/v1/apps/psizone/members/vera/overrides", {
			grant: ["requests_view"],
			deny: [],
		});
		expect((await meOf(w, "vera")).permissions.requests_view).toEqual([]);
	});

	it("a member with no role is told, truthfully, that they hold nothing (not refused)", async () => {
		await w.call("olga", "PUT", "/v1/apps/psizone/members/blank", {
			displayName: "Blank",
			roles: [],
			coordinates: [],
		});
		const me = await meOf(w, "blank");
		expect(me).toMatchObject({ roles: [], permissions: {}, fieldGroups: [], displayName: "Blank" });
	});

	it("is per app: the same person is a stranger to another app", async () => {
		const r = await w.call("olga", "GET", "/v1/apps/hemisync/me");
		expect(r.status).toBe(404);
		expect(r.json.error).toMatchObject({ code: "not_found" });
	});

	it("refuses a service key and an anonymous call, and writes nothing", async () => {
		const before = w.fingerprint();
		expect((await w.callKey("psizone-web", "GET", ME)).status).toBe(403);
		expect((await w.call(null, "GET", ME)).status).toBe(401);
		expect(w.fingerprint()).toBe(before);
	});
});
