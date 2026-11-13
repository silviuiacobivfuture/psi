import { VIEW_AS_HEADER } from "@psi/scheduling-sdk/contract";
import { beforeEach, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";

const A = "/v1/apps/psizone";
type Me = {
	subject: string;
	roles: string[];
	permissions: Record<string, string[]>;
	fieldGroups: string[];
};
const viewAs = async (w: Populated, who: string, as: string): Promise<Me> => {
	const r = await w.call(who, "GET", `${A}/me?as=${encodeURIComponent(as)}`);
	expect(r.status, JSON.stringify(r.json)).toBe(200);
	return r.json as unknown as Me;
};
const auditActions = async (w: Populated): Promise<string[]> =>
	(((await w.call("olga", "GET", `${A}/audit`)).json.items as { action: string }[]) ?? []).map(
		(e) => e.action,
	);

describe("view as: a roles administrator sees the app as a role or a member", () => {
	let w: Populated;
	beforeEach(async () => {
		w = await createWorld();
	});

	it("reception: money and contact, no clinical group, no roles", async () => {
		const me = await viewAs(w, "olga", "role:psizone-reception");
		expect(me.fieldGroups).toEqual(["contact", "guardian", "money"]);
		expect(me.permissions.roles_view).toBeUndefined();
		expect(me.permissions.clients_clinical_view).toBeUndefined();
	});

	it("therapist sees only their own calendar; volunteer only the roster", async () => {
		expect((await viewAs(w, "olga", "role:psizone-therapist")).permissions.calendar_view).toEqual([
			"own",
		]);
		const vera = await viewAs(w, "olga", "role:psizone-volunteer");
		expect(Object.keys(vera.permissions).sort()).toEqual([
			"leave_create",
			"leave_view",
			"roster_view",
		]);
	});

	it("a member is seen through their roles, personal grants and denials", async () => {
		await w.call("olga", "PUT", `${A}/members/rita/overrides`, {
			grant: ["audit_view"],
			deny: ["clients_contact_view"],
		});
		const me = await viewAs(w, "olga", "member:rita");
		expect(me.subject).toBe("rita");
		expect(me.permissions.audit_view).toEqual([]);
		expect(me.permissions.clients_contact_view).toBeUndefined();
		expect(me.fieldGroups).not.toContain("contact");
	});

	it("matches what that person really sees when they sign in", async () => {
		const own = (await w.call("dora", "GET", `${A}/me`)).json as unknown as Me;
		const seen = await viewAs(w, "olga", "member:dora");
		expect(seen.permissions).toEqual(own.permissions);
		expect(seen.fieldGroups).toEqual(own.fieldGroups);
	});

	it("refuses anyone without roles administration, and writes nothing", async () => {
		for (const who of ["nina", "rita", "dora", "vera"]) {
			const before = w.fingerprint();
			const get = await w.call(who, "GET", `${A}/me?as=role:psizone-owner`);
			expect([get.status, (get.json.error as { code: string }).code]).toEqual([403, "forbidden"]);
			const start = await w.call(who, "POST", `${A}/view-as`, { as: "role:psizone-owner" });
			expect(start.status).toBe(403);
			expect((await w.call(who, "DELETE", `${A}/view-as`)).status).toBe(403);
			expect(w.fingerprint()).toBe(before);
		}
	});

	it("an unknown role or member is not found; a malformed target is invalid", async () => {
		expect((await w.call("olga", "GET", `${A}/me?as=role:nope-nope`)).status).toBe(404);
		expect((await w.call("olga", "GET", `${A}/me?as=member:ghost`)).status).toBe(404);
		expect((await w.call("olga", "GET", `${A}/me?as=everyone`)).status).toBe(400);
		expect((await w.call("olga", "POST", `${A}/view-as`, { as: "x" })).status).toBe(400);
	});

	it("writes start and stop as audit events of the administrator", async () => {
		await w.call("olga", "POST", `${A}/view-as`, { as: "role:psizone-reception" });
		await w.call("olga", "DELETE", `${A}/view-as`);
		const events = (await w.call("olga", "GET", `${A}/audit`)).json.items as {
			action: string;
			actor: { subject: string };
			target: { id: string };
		}[];
		const start = events.find((e) => e.action === "view_as.start");
		expect(start).toMatchObject({
			actor: { subject: "olga" },
			target: { id: "role:psizone-reception" },
		});
		expect(events.some((e) => e.action === "view_as.stop")).toBe(true);
	});

	it("refuses every write that carries the view-as header, and writes nothing", async () => {
		const header = { [VIEW_AS_HEADER]: "role:psizone-reception" };
		const before = w.fingerprint();
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
			(
				await w.call(
					"olga",
					"POST",
					`${A}/view-as`,
					{ as: "role:psizone-owner" },
					{ headers: header },
				)
			).status,
		).toBe(403);
		expect(w.fingerprint()).toBe(before);
		expect(await auditActions(w)).not.toContain("view_as.start");
	});

	it("still reads with the header, and may stop", async () => {
		const header = { [VIEW_AS_HEADER]: "role:psizone-reception" };
		expect(
			(await w.call("olga", "GET", `${A}/clients`, undefined, { headers: header })).status,
		).toBe(200);
		expect(
			(await w.call("olga", "DELETE", `${A}/view-as`, undefined, { headers: header })).status,
		).toBe(200);
	});
});

describe("view as: whose rows a narrowed scope reaches", () => {
	it("a member reaches their own person record and the people they coordinate; a role reaches none", async () => {
		const w = await createWorld();
		const dora = (await w.call("olga", "GET", `${A}/me?as=member:dora`)).json as unknown as {
			reach: { own: string[]; assigned: string[] };
		};
		expect(dora.reach.own).toEqual([w.ids.dora]);
		const cora = (await w.call("olga", "GET", `${A}/me?as=member:cora`)).json as unknown as {
			reach: { own: string[]; assigned: string[] };
		};
		expect(cora.reach.assigned.length).toBeGreaterThan(0);
		const role = (await w.call("olga", "GET", `${A}/me?as=role:psizone-therapist`))
			.json as unknown as {
			reach: { own: string[]; assigned: string[] };
		};
		expect(role.reach).toEqual({ own: [], assigned: [] });
		const mine = (await w.call("dora", "GET", `${A}/me`)).json as unknown as {
			reach: { own: string[] };
		};
		expect(mine.reach.own).toEqual([w.ids.dora]);
	});
});
