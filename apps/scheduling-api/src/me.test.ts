import { VIEW_AS_HEADER } from "@psi/scheduling-sdk/contract";
import { beforeEach, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";

const A = "/v1/apps/psizone";
type Me = {
	app: string;
	appName: string;
	timeZone: string;
	subject: string;
	displayName?: string;
	roles: string[];
	permissions: Record<string, string[]>;
	denied: string[];
	fieldGroups: string[];
	reach: { own: string[]; assigned: string[] };
	platformAdmin: boolean;
	viewAs?: { kind: string; id: string };
};
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});
const meOf = async (who: string, query = ""): Promise<Me> => {
	const r = await w.call(who, "GET", `${A}/me${query}`);
	expect(r.status, JSON.stringify(r.json)).toBe(200);
	return r.json as unknown as Me;
};
const auditActions = async (): Promise<string[]> =>
	((await w.call("olga", "GET", `${A}/audit`)).json.items as { action: string }[]).map(
		(e) => e.action,
	);

describe("GET /v1/apps/:app/me: who the caller is in this app and what they may do", () => {
	it("the owner holds everything, in every field group, including roles and the audit log", async () => {
		const me = await meOf("olga");
		expect(me).toMatchObject({
			app: "psizone",
			appName: "Psizone",
			timeZone: "Europe/Bucharest",
			subject: "olga",
			roles: [w.ids.roles.owner],
			platformAdmin: false,
			denied: [],
		});
		expect(me.permissions.roles_edit).toEqual(["all"]);
		expect(me.permissions.audit_log_view).toEqual(["all"]);
		expect(me.permissions.clients_view).toEqual(["all", "assigned", "own"]);
		expect(me.permissions.clients_view_clinical).toEqual(["all", "assigned", "own"]);
		expect(me.fieldGroups).toEqual(["core", "contact", "guardian", "money", "clinical"]);
	});

	it("reception sees money and contact but holds no clinical group, no roles, no audit", async () => {
		const me = await meOf("rita");
		expect(me.fieldGroups).toEqual(["core", "contact", "guardian", "money"]);
		expect(me.permissions.clients_view_clinical).toBeUndefined();
		expect(me.permissions.roles_view).toBeUndefined();
		expect(me.permissions.audit_log_view).toBeUndefined();
		expect(me.permissions.web_requests_view).toEqual(["all"]);
		expect(me.permissions.appointments_create).toEqual(["all"]);
	});

	it("a therapist holds the clinical group and only their own scope, and reaches their own person", async () => {
		const me = await meOf("dora");
		expect(me.fieldGroups).toContain("clinical");
		expect(me.fieldGroups).not.toContain("money");
		expect(me.permissions.calendars_view).toEqual(["own"]);
		expect(me.permissions.web_requests_view).toBeUndefined();
		expect(me.reach).toEqual({ own: [w.ids.dora], assigned: [] });
	});

	it("a coordinator holds the assigned scope and reaches the people they coordinate; a volunteer almost nothing", async () => {
		const cora = await meOf("cora");
		expect(cora.permissions.calendars_view).toEqual(["assigned"]);
		expect(cora.reach.assigned.sort()).toEqual([w.ids.dora, w.ids.elena].sort());
		const vera = await meOf("vera");
		expect(Object.keys(vera.permissions).sort()).toEqual([
			"leave_cancel",
			"leave_create",
			"leave_view",
			"notice_board_view",
			"roster_view",
		]);
		expect(vera.fieldGroups).toEqual([]);
	});

	it("an individual denial takes that relation away (not the others), and its field group when none is left", async () => {
		await w.call("olga", "PUT", `${A}/members/rita/overrides`, {
			grant: [],
			deny: ["clients_view_all_contact"],
		});
		const me = await meOf("rita");
		expect(me.permissions.clients_view_contact).toBeUndefined();
		expect(me.fieldGroups).not.toContain("contact");
		expect(me.denied).toEqual(["clients_view_all_contact"]);
		expect(me.permissions.clients_view_guardian).toEqual(["all"]);
	});

	it("an individual grant is reflected", async () => {
		await w.call("olga", "PUT", `${A}/members/vera/overrides`, {
			grant: ["web_requests_view_all"],
			deny: [],
		});
		expect((await meOf("vera")).permissions.web_requests_view).toEqual(["all"]);
	});

	it("a member with no role is told, truthfully, that they hold nothing (not refused)", async () => {
		await w.call("olga", "PUT", `${A}/members/blank`, {
			displayName: "Blank",
			roles: [],
			coordinates: [],
		});
		expect(await meOf("blank")).toMatchObject({
			roles: [],
			permissions: {},
			fieldGroups: [],
			displayName: "Blank",
		});
	});

	it("is per app: the same person is a stranger to another app", async () => {
		const r = await w.call("olga", "GET", "/v1/apps/hemisync/me");
		expect(r.status).toBe(404);
		expect(r.json.error).toMatchObject({ code: "not_found" });
	});

	it("refuses a service key and an anonymous call, and writes nothing", async () => {
		const before = await w.fingerprint();
		expect((await w.callKey("psizone-web", "GET", `${A}/me`)).status).toBe(403);
		expect((await w.call(null, "GET", `${A}/me`)).status).toBe(401);
		expect(await w.fingerprint()).toBe(before);
	});
});

describe("view as: the estate administrator sees the app as a role or a member", () => {
	it("reception: money and contact, no clinical group, no roles", async () => {
		const me = await meOf("root", `?as=${encodeURIComponent(`role:${w.ids.roles.reception}`)}`);
		expect(me.fieldGroups).toEqual(["core", "contact", "guardian", "money"]);
		expect(me.permissions.roles_view).toBeUndefined();
		expect(me.permissions.clients_view_clinical).toBeUndefined();
		expect(me.viewAs).toEqual({ kind: "role", id: w.ids.roles.reception });
		expect(me.reach).toEqual({ own: [], assigned: [] });
	});

	it("a member is seen through their roles, personal grants and denials", async () => {
		await w.call("olga", "PUT", `${A}/members/rita/overrides`, {
			grant: ["audit_log_view_all"],
			deny: ["clients_view_all_contact"],
		});
		const me = await meOf("root", "?as=member:rita");
		expect(me.subject).toBe("rita");
		expect(me.permissions.audit_log_view).toEqual(["all"]);
		expect(me.permissions.clients_view_contact).toBeUndefined();
		expect(me.viewAs).toEqual({ kind: "member", id: "rita" });
		// a bare subject is a member too
		expect((await meOf("root", "?as=rita")).subject).toBe("rita");
	});

	it("matches what that person really sees when they sign in", async () => {
		for (const who of ["dora", "cora", "rita", "ana"]) {
			const own = await meOf(who);
			const seen = await meOf("root", `?as=member:${who}`);
			expect(seen.permissions, who).toEqual(own.permissions);
			expect(seen.fieldGroups, who).toEqual(own.fieldGroups);
			expect(seen.reach, who).toEqual(own.reach);
		}
	});

	it("a role seen from its stored relations equals the same set held by a member through it", async () => {
		const role = await meOf("root", `?as=role:${w.ids.roles.accountant}`);
		const ana = await meOf("ana");
		expect(role.permissions).toEqual(ana.permissions);
	});

	it.each([
		"olga",
		"nina",
		"rita",
		"dora",
		"vera",
	])("%s (not the estate administrator, the owner and the admin included): refused, nothing written or audited", async (who) => {
		const before = await w.fingerprint();
		const as = `role:${w.ids.roles.reception}`;
		const get = await w.call(who, "GET", `${A}/me?as=${encodeURIComponent(as)}`);
		expect([get.status, (get.json.error as { code: string }).code]).toEqual([403, "forbidden"]);
		const start = await w.call(who, "POST", `${A}/view-as`, { as });
		expect([start.status, (start.json.error as { code: string }).code]).toEqual([403, "forbidden"]);
		expect((await w.call(who, "DELETE", `${A}/view-as`)).status).toBe(403);
		// a malformed target is still refused for who is calling, before what they sent
		expect((await w.call(who, "POST", `${A}/view-as`, { as: "x y" })).status).toBe(403);
		expect(await w.fingerprint()).toBe(before);
		expect(await auditActions()).not.toContain("view_as.start");
	});

	it("an estate administrator stops being one: refused from then on", async () => {
		await w.platformAdmin("olga", true);
		const as = `role:${w.ids.roles.reception}`;
		expect((await w.call("olga", "POST", `${A}/view-as`, { as })).status).toBe(200);
		await w.platformAdmin("olga", false);
		const before = await w.fingerprint();
		expect((await w.call("olga", "GET", `${A}/me?as=${encodeURIComponent(as)}`)).status).toBe(403);
		expect((await w.call("olga", "POST", `${A}/view-as`, { as })).status).toBe(403);
		expect(await w.fingerprint()).toBe(before);
	});

	it("the estate administrator is still held to the app: an app that does not exist is not found", async () => {
		const as = `role:${w.ids.roles.reception}`;
		expect((await w.call("root", "POST", "/v1/apps/nosuchapp/view-as", { as })).status).toBe(404);
		expect((await w.call("root", "GET", `/v1/apps/nosuchapp/me?as=${as}`)).status).toBe(404);
	});

	it("an unknown role or member is not found; a malformed target is invalid", async () => {
		expect((await w.call("root", "GET", `${A}/me?as=role:nope-nope`)).status).toBe(404);
		expect((await w.call("root", "GET", `${A}/me?as=member:ghost`)).status).toBe(404);
		expect((await w.call("root", "GET", `${A}/me?as=banana:x`)).status).toBe(400);
		expect((await w.call("root", "POST", `${A}/view-as`, { as: "x y" })).status).toBe(400);
	});

	it("writes start and stop as audit events of the administrator", async () => {
		const as = `role:${w.ids.roles.reception}`;
		await w.call("root", "POST", `${A}/view-as`, { as });
		await w.call("root", "DELETE", `${A}/view-as`);
		const events = (await w.call("olga", "GET", `${A}/audit`)).json.items as {
			action: string;
			actor: { subject: string };
			target: { id: string };
		}[];
		expect(events.find((e) => e.action === "view_as.start")).toMatchObject({
			actor: { subject: "root" },
			target: { id: as },
		});
		expect(events.some((e) => e.action === "view_as.stop")).toBe(true);
	});

	it("refuses every write that carries the view-as header, and writes nothing", async () => {
		const header = { [VIEW_AS_HEADER]: `role:${w.ids.roles.reception}` };
		const before = await w.fingerprint();
		const post = await w.call(
			"olga",
			"POST",
			`${A}/clients`,
			{ name: "Nobody Test" },
			{ headers: header },
		);
		expect(post.status).toBe(403);
		expect(post.json.error).toMatchObject({
			code: "forbidden",
			detail: { reason: "view_as_readonly" },
		});
		expect((await w.call("olga", "PATCH", A, { name: "x" }, { headers: header })).status).toBe(403);
		expect(
			(await w.call("olga", "POST", `${A}/view-as`, { as: "role:x" }, { headers: header })).status,
		).toBe(403);
		expect(await w.fingerprint()).toBe(before);
		expect(await auditActions()).not.toContain("view_as.start");
	});

	it("still reads with the header, and may stop", async () => {
		const header = { [VIEW_AS_HEADER]: `role:${w.ids.roles.reception}` };
		expect(
			(await w.call("olga", "GET", `${A}/clients`, undefined, { headers: header })).status,
		).toBe(200);
		expect(
			(await w.call("root", "DELETE", `${A}/view-as`, undefined, { headers: header })).status,
		).toBe(200);
	});
});
