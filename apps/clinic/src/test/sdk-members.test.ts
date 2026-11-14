import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actionById } from "../actions/engine";
import { ACTIONS } from "../actions/registry";
import { summaryOf } from "../pages/member-summary";
import { MemberDetailSchema } from "../port/schema-members";
import { ORIGIN, type SdkConsole, type Session, startSdkConsole } from "./sdk-harness";

let k: SdkConsole;
let olga: Session;
beforeAll(async () => {
	k = await startSdkConsole();
	olga = await k.as("olga");
});
afterAll(async () => {
	await k.close();
});

const A = "/v1/apps/psizone";
const form = { "content-type": "application/x-www-form-urlencoded" };
const encode = (values: Record<string, string | string[]>): URLSearchParams =>
	new URLSearchParams(
		Object.entries(values).flatMap(([key, v]) =>
			Array.isArray(v) ? v.map((x) => [key, x]) : [[key, v]],
		),
	);
/** One form post, redirects not followed: what the console answers first. */
const send = (s: Session, path: string, values: Record<string, string | string[]> = {}) =>
	s.raw(path, { method: "POST", body: encode(values), headers: form });
const api = (method: string, path: string, body?: unknown) =>
	k.api.world.call("olga", method, `${A}${path}`, body);
const role = (name: string): string => k.api.world.ids.roles[name] ?? name;
const html = async (s: Session, path: string): Promise<string> => (await s.get(path)).text();
const detail = async (subject: string) => {
	const r = await api("GET", `/members/${subject}`);
	expect(r.status, subject).toBe(200);
	return MemberDetailSchema.parse(r.json);
};
/** The relations a member holds in the end, as the service answers them. */
const held = async (subject: string): Promise<Set<string>> =>
	new Set(
		(await detail(subject)).matrix.flatMap((r) =>
			r.held.map((s) =>
				r.fieldGroup === undefined
					? `${r.key}_${s}`
					: `${r.resource}_${r.action}_${s}_${r.fieldGroup}`,
			),
		),
	);
const permissionsOf = async (id: string): Promise<Set<string>> =>
	new Set(((await api("GET", `/roles/${id}`)).json.role as { permissions: string[] }).permissions);
const saveRoles = (s: Session, subject: string, roles: string[], name = `${subject} test`) =>
	send(s, `/settings/members/${subject}/save`, { displayName: name, roles });

describe("presence: Setări → Membri", () => {
	it("is in the organisation settings of whoever sees the team, and nowhere for the others", async () => {
		expect(await html(olga, "/settings")).toContain('href="/settings/members"');
		const vera = await k.as("vera");
		expect(await html(vera, "/settings")).not.toContain('href="/settings/members"');
		expect((await vera.raw("/settings/members")).status).toBe(403);
	});

	it("lists every member with a chip for each role they hold", async () => {
		await api("PUT", "/members/cora", {
			displayName: "cora test",
			roles: [role("coordinator"), role("reception")],
			coordinates: [k.api.world.ids.dora, k.api.world.ids.elena],
		});
		const page = await html(olga, "/settings/members");
		const row = page.slice(page.indexOf('data-member="cora"'));
		const chips = row.slice(0, row.indexOf("</li>"));
		expect(chips).toContain("Coordonator");
		expect(chips).toContain("Recepție");
		expect(page).toContain('data-member="rita"');
		expect(page).toContain("Adaugă membru");
	});

	it("the top bar names every role at once", async () => {
		await api("PUT", "/members/rita", {
			displayName: "rita test",
			roles: [role("reception"), role("coordinator")],
			coordinates: [],
		});
		const rita = await k.as("rita");
		expect(await html(rita, "/calendar")).toContain("Recepție + Coordonator");
		await api("PUT", "/members/rita", {
			displayName: "rita test",
			roles: [role("reception")],
			coordinates: [],
		});
	});

	it("registers the member actions for the assistant, each gated by its permission", () => {
		const needs = Object.fromEntries(
			ACTIONS.filter((a) => a.id.startsWith("member.")).map((a) => [a.id, a.needs.write]),
		);
		expect(needs).toEqual({
			"member.new": ["members_create"],
			"member.invite": ["members_create"],
			"member.link": ["members_create"],
			"member.edit": ["members_edit"],
			"member.overrides": ["members_edit"],
			"member.calendar": ["people_edit"],
			"member.remove": ["members_delete"],
		});
		expect(actionById("member.remove")?.confirm).toBe("confirm");
		expect(actionById("member.invite")?.privateResult).toBe(true);
	});
});

describe("several roles: the permissions add up", () => {
	it("two roles from the editor: both are held, the summary is the service's union", async () => {
		const r = await saveRoles(olga, "vera", [role("volunteer"), role("accountant")]);
		expect(r.status).toBe(303);
		expect(r.headers.get("location")).toBe("/settings/members?edit=vera&saved=1");
		const d = await detail("vera");
		expect(d.roles.sort()).toEqual([role("volunteer"), role("accountant")].sort());
		const mine = await held("vera");
		for (const p of [
			...(await permissionsOf(role("volunteer"))),
			...(await permissionsOf(role("accountant"))),
		])
			expect(mine.has(p), p).toBe(true);
		const page = await html(olga, "/settings/members?edit=vera");
		const effective = page.slice(page.indexOf("data-effective"));
		for (const g of summaryOf(d.matrix, "ro").groups)
			for (const line of g.lines) expect(effective).toContain(line.resource);
	});

	it("removing one role keeps the other's permissions", async () => {
		await saveRoles(olga, "vera", [role("volunteer"), role("accountant")]);
		const accountant = await permissionsOf(role("accountant"));
		const onlyVolunteer = [...(await permissionsOf(role("volunteer")))].filter(
			(p) => !accountant.has(p),
		);
		expect(onlyVolunteer.length).toBeGreaterThan(0);
		expect((await saveRoles(olga, "vera", [role("accountant")])).status).toBe(303);
		const mine = await held("vera");
		for (const p of accountant) expect(mine.has(p), p).toBe(true);
		for (const p of onlyVolunteer) expect(mine.has(p), p).toBe(false);
	});
});

describe("per-person permissions", () => {
	it("an extra permission opens what the roles do not, and a withdrawn one beats it", async () => {
		await saveRoles(olga, "ana", [role("accountant")], "ana test");
		const before = (await held("ana")).has("audit_log_view_all");
		const ana = await k.as("ana");
		const granted = await send(olga, "/settings/members/ana/overrides", {
			grant: ["audit_log_view_all", ""],
		});
		expect(granted.status).toBe(303);
		expect((await detail("ana")).grant).toContain("audit_log_view_all");
		expect((await held("ana")).has("audit_log_view_all")).toBe(true);
		expect((await ana.raw("/settings/audit")).status).toBe(200);
		await send(olga, "/settings/members/ana/overrides", {
			grant: ["audit_log_view_all"],
			deny: ["audit_log_view"],
		});
		const d = await detail("ana");
		expect(d.grant).toContain("audit_log_view_all");
		expect(d.deny).toContain("audit_log_view_all");
		expect((await held("ana")).has("audit_log_view_all")).toBe(false);
		expect((await ana.raw("/settings/audit")).status).toBe(403);
		const effective =
			(await html(olga, "/settings/members?edit=ana")).split("data-effective")[1] ?? "";
		expect(effective.slice(0, effective.indexOf("</section>"))).not.toContain("Jurnal: Vezi");
		// the editor shows both choices back, and the summary no longer has it
		const page = await html(olga, "/settings/members?edit=ana");
		expect(page).toMatch(/value="audit_log_view_all"[^>]*selected/);
		expect(page).toMatch(
			/data-deny="audit_log_view"[^>]*checked|checked[^>]*data-deny="audit_log_view"/,
		);
		await send(olga, "/settings/members/ana/overrides", {});
		expect((await held("ana")).has("audit_log_view_all")).toBe(before);
	});

	it("a withdrawal of one scope survives an untouched save, and the journal counts permissions", async () => {
		await api("PUT", "/members/nina/overrides", { grant: [], deny: ["clients_view_all"] });
		const page = await html(olga, "/settings/members?edit=nina");
		expect(page).toMatch(
			/data-deny="clients_view"[^>]*checked|checked[^>]*data-deny="clients_view"/,
		);
		// the form as the browser sends it untouched: the box stays ticked, every "Nu" is empty
		expect(
			(
				await send(olga, "/settings/members/nina/overrides", {
					grant: [""],
					deny: ["clients_view"],
				})
			).status,
		).toBe(303);
		expect((await detail("nina")).deny).toEqual(["clients_view_all"]);
		const journal = await html(olga, "/settings/audit");
		expect(journal).toContain(
			"A schimbat permisiunile individuale ale lui nina test: 0 în plus, 1 retrase",
		);
		await api("PUT", "/members/nina/overrides", { grant: [], deny: [] });
	});

	it("a permission the picker does not offer is refused, not dropped", async () => {
		const before = await k.api.world.fingerprint();
		const r = await send(olga, "/settings/members/vera/overrides", { grant: ["people_view_all"] });
		expect(r.headers.get("location")).toContain("problem=invalid");
		expect(await k.api.world.fingerprint()).toBe(before);
	});

	it("a calendar bound to someone else is not offered and cannot be taken", async () => {
		const dora = k.api.world.ids.dora;
		const page = await html(olga, "/settings/members?edit=vera");
		const calendar = page.slice(page.indexOf("data-calendar"));
		expect(calendar).not.toContain(`value="${dora}"`);
		const before = await k.api.world.fingerprint();
		const r = await send(olga, "/settings/members/vera/calendar", { personId: dora });
		expect(r.headers.get("location")).toContain("problem=conflict");
		expect(await k.api.world.fingerprint()).toBe(before);
		expect((await detail("dora")).calendars).toEqual([dora]);
	});

	it("a calendar column is bound to the member's sign-in", async () => {
		const mara = k.api.world.ids.mara;
		expect((await send(olga, "/settings/members/vera/calendar", { personId: mara })).status).toBe(
			303,
		);
		expect((await detail("vera")).calendars).toEqual([mara]);
		expect(await html(olga, "/settings/members?edit=vera")).toContain("Mara Test");
	});
});

describe("adding and removing", () => {
	it("adds a sign-in account with several roles, then removes it", async () => {
		const r = await send(olga, "/settings/members/save", {
			subject: "newbie",
			displayName: "Nou Venit",
			email: "",
			roles: [role("reception"), role("coordinator")],
		});
		expect(r.status).toBe(303);
		expect((await detail("newbie")).roles.sort()).toEqual(
			[role("reception"), role("coordinator")].sort(),
		);
		expect(await html(olga, "/settings/members")).toContain("Nou Venit");
		expect((await send(olga, "/settings/members/newbie/remove")).status).toBe(303);
		expect((await api("GET", "/members/newbie")).status).toBe(404);
	});
});

describe("the journal says it in a sentence", () => {
	it("a role change names the roles; a removal names who left", async () => {
		// two roles neither of which holds all the other does (an Administrator would make Coordonator redundant)
		await saveRoles(olga, "nina", [role("reception"), role("coordinator")], "nina test");
		await send(olga, "/settings/members/save", {
			subject: "leaver",
			displayName: "Plecat Test",
			roles: [],
		});
		await send(olga, "/settings/members/leaver/remove");
		const journal = await html(olga, "/settings/audit");
		// the service keeps the role ids sorted: the sentence names them in that order
		const names = [
			[role("reception"), "Recepție"],
			[role("coordinator"), "Coordonator"],
		]
			.sort(([a = ""], [b = ""]) => a.localeCompare(b))
			.map(([, n]) => n)
			.join(" + ");
		expect(journal).toContain(`A schimbat rolurile lui nina test: ${names}`);
		expect(journal).toContain("A scos din echipă: Plecat Test");
		expect(journal).toContain("A adăugat în echipă: Plecat Test");
	});
});

describe("refusals: nothing is written", () => {
	const unchanged = async (what: () => Promise<Response>, status: number): Promise<void> => {
		const before = await k.api.world.fingerprint();
		expect((await what()).status).toBe(status);
		expect(await k.api.world.fingerprint()).toBe(before);
	};

	it("someone without members_edit can change nobody", async () => {
		const rita = await k.as("rita");
		await unchanged(() => saveRoles(rita, "vera", [role("owner")]), 403);
		await unchanged(
			() => send(rita, "/settings/members/vera/overrides", { grant: ["audit_log_view_all"] }),
			403,
		);
		await unchanged(() => send(rita, "/settings/members/vera/remove"), 403);
		await unchanged(
			() =>
				send(rita, "/settings/members/save", { subject: "intruder", displayName: "X", roles: [] }),
			403,
		);
	});

	it("nobody changes their own roles or permissions, nor removes themselves", async () => {
		await unchanged(() => saveRoles(olga, "olga", []), 403);
		await unchanged(
			() => send(olga, "/settings/members/olga/overrides", { deny: ["roles_edit"] }),
			403,
		);
		await unchanged(() => send(olga, "/settings/members/olga/remove"), 403);
		const page = await html(olga, "/settings/members?edit=olga");
		expect(page).toContain("Nu îți poți schimba propriile roluri și permisiuni.");
	});

	it("an unknown role refuses the whole change", async () => {
		const before = await k.api.world.fingerprint();
		const r = await saveRoles(olga, "vera", [role("accountant"), "ghost"]);
		expect(r.status).toBe(303);
		expect(r.headers.get("location")).toContain("problem=invalid");
		expect(await k.api.world.fingerprint()).toBe(before);
	});

	it("members_edit alone may change roles but neither add nor remove anyone", async () => {
		const made = await api("POST", "/roles", { name: "Editor echipă" });
		const id = String(made.json.id);
		// neither the roles nor the people may be read: the editor still sends back everything held
		await api("PUT", `/roles/${id}/permissions`, {
			permissions: ["members_view_all", "members_edit_all"],
		});
		await api("PUT", "/members/elena", { displayName: "elena test", roles: [id], coordinates: [] });
		const elena = await k.as("elena");
		const cora = await detail("cora");
		expect(cora.coordinates.length).toBeGreaterThan(0);
		const editor = await html(elena, "/settings/members?edit=cora");
		const form = editor.slice(editor.indexOf('data-form="member-save"'));
		const sent = form.slice(0, form.indexOf("</form>"));
		for (const held of [...cora.roles, ...cora.coordinates])
			expect(sent, held).toMatch(new RegExp(`value="${held}"[^>]*checked`));
		await unchanged(
			() =>
				send(elena, "/settings/members/save", { subject: "other", displayName: "O", roles: [] }),
			403,
		);
		await unchanged(() => send(elena, "/settings/members/vera/remove"), 403);
		expect((await saveRoles(elena, "vera", [role("accountant"), role("volunteer")])).status).toBe(
			303,
		);
		expect((await detail("vera")).roles.sort()).toEqual(
			[role("accountant"), role("volunteer")].sort(),
		);
	});

	it("looking at the app as someone else is read-only here too", async () => {
		// "Vezi ca…" is the estate administrator's alone
		await k.api.world.platformAdmin("olga", true);
		const s = await k.as("olga");
		const r = await s.raw("/view-as", {
			method: "POST",
			body: new URLSearchParams({ as: `role:${role("owner")}` }),
			headers: form,
		});
		expect(r.status).toBe(303);
		for (const line of r.headers.getSetCookie()) {
			const [pair] = line.split(";");
			const [name, ...value] = (pair ?? "").split("=");
			if (name) s.browser.cookies(ORIGIN).set(name, value.join("="));
		}
		await unchanged(() => saveRoles(s, "vera", [role("owner")]), 403);
		await k.api.world.platformAdmin("olga", false);
	});
});
