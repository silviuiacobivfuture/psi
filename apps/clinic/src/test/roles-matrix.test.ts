import { parsePermissionKey } from "@psi/scheduling/permissions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actionById, listActions, runAction } from "../actions/engine";
import type { ActionCtx } from "../actions/types";
import { roleName } from "../chrome";
import { canOf } from "../lib/can";
import { createSdkPort } from "../port/sdk/index";
import { type SdkConsole, type Session, startSdkConsole } from "./sdk-harness";

let k: SdkConsole;
let olga: Session;
let rita: Session;
beforeAll(async () => {
	k = await startSdkConsole();
	olga = await k.as("olga");
	rita = await k.as("rita");
});
afterAll(async () => {
	await k.close();
});

const A = "/v1/apps/psizone";
const api = (method: string, path: string, body?: unknown) =>
	k.api.world.call("olga", method, `${A}${path}`, body);
const role = (name: string): string => k.api.world.ids.roles[name] ?? name;
const html = async (s: Session, path: string): Promise<string> => {
	const res = await s.get(path);
	expect(res.status, path).toBe(200);
	return res.text();
};
/** The desktop table of a page (the phone list repeats the marks of the role it shows). */
const tableOf = (page: string): string => {
	const start = page.indexOf('data-view="table"');
	const end = page.indexOf('data-view="list"');
	expect(start, "the table is there").toBeGreaterThan(-1);
	return page.slice(start, end < 0 ? undefined : end);
};
const listOf = (page: string): string => page.slice(page.indexOf('data-view="list"'));
/** `row|column` → mark, for every cell of the table. */
const cells = (page: string): Map<string, string> =>
	new Map(
		[...tableOf(page).matchAll(/data-cell="([^"]+)" data-col="([^"]+)" data-mark="([^"]+)"/g)].map(
			(x) => [`${x[1]}|${x[2]}`, x[3] ?? ""],
		),
	);
const heads = (page: string): string[] =>
	[...tableOf(page).matchAll(/<th scope="col" data-col="([^"]+)"/g)].map((x) => x[1] ?? "");
const rows = (page: string): string[] =>
	[...tableOf(page).matchAll(/<tr class="rm-action" data-row="([^"]+)"/g)].map((x) => x[1] ?? "");
const permissionsOf = async (id: string): Promise<string[]> =>
	((await api("GET", `/roles/${id}`)).json.role as { permissions: string[] }).permissions;

const WIDTH: Readonly<Record<string, number>> = { own: 1, assigned: 2, all: 3 };
/** The marks a role's stored keys mean, by row, read straight from the service's role definition. */
async function expectedOf(id: string): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	for (const relation of await permissionsOf(id)) {
		const p = parsePermissionKey(relation);
		if (p === undefined) continue;
		const row =
			p.fieldGroup === undefined
				? `${p.resource}.${p.action}`
				: `${p.resource}.${p.action}.${p.fieldGroup}`;
		const had = out.get(row);
		if (had === undefined || (WIDTH[p.scope] ?? 0) > (WIDTH[had] ?? 0)) out.set(row, p.scope);
	}
	return out;
}

const SEEDS = [
	"admin",
	"owner",
	"coordinator",
	"reception",
	"therapist",
	"accountant",
	"volunteer",
];
/** The seed roles in the console's own Romanian words (the top bar's and the team list's). */
const SEED_NAMES = SEEDS.map((s) => roleName(s, "ro"));

describe("presence: every member reaches the role matrix", () => {
	it("the person menu offers it on every screen, to reception as to the owner", async () => {
		for (const s of [rita, olga]) {
			const page = await html(s, "/calendar");
			expect(page).toContain('href="/roles/matrix"');
			expect(page).toContain('data-action="nav.roles-matrix"');
		}
	});

	it("the profile leads to it from the roles one holds, and so does the roles settings tab", async () => {
		expect(await html(rita, "/me/profile")).toContain("data-roles-matrix-link");
		expect(await html(olga, "/settings/roles")).toContain("data-roles-matrix-link");
	});

	it("reception opens it while the roles editor stays closed to her", async () => {
		expect((await rita.raw("/settings/roles")).status).toBe(403);
		const page = await html(rita, "/roles/matrix");
		expect(page).toContain("data-roles-matrix");
		expect(page).toContain("Matricea rolurilor");
	});

	it("a member who holds no role at all still reads it", async () => {
		await api("PUT", "/members/nobody", { displayName: "Nobody Test", roles: [], coordinates: [] });
		const nobody = await k.as("nobody");
		expect(heads(await html(nobody, "/roles/matrix")).length).toBe(8);
	});

	it("the assistant can open it: a registered action that needs nothing but membership", async () => {
		const action = actionById("nav.roles-matrix");
		expect(action?.needs).toEqual({});
		expect(action?.route).toEqual({ method: "GET", path: "/roles/matrix" });
	});
});

describe("the columns: the platform role, every seed role and every custom role", () => {
	it("shows Administrator sistem first, then the seven seed roles in Romanian, in their order", async () => {
		const page = await html(rita, "/roles/matrix");
		expect(heads(page)).toEqual(["platform", ...SEEDS.map(role)]);
		const head = tableOf(page).slice(0, tableOf(page).indexOf("</thead>"));
		let at = head.indexOf("Administrator sistem");
		expect(at).toBeGreaterThan(-1);
		for (const name of SEED_NAMES) {
			const next = head.indexOf(`>${name}<`, at);
			expect(next, name).toBeGreaterThan(at);
			at = next;
		}
	});

	it("explains the platform role: it manages the system and reads no clinical content", async () => {
		const page = await html(rita, "/roles/matrix");
		expect(page).toContain("data-platform-note");
		expect(page).toContain("Nu citește conținut clinic");
		const c = cells(await html(rita, "/roles/matrix?detail=all"));
		expect(c.get("roles.edit|platform")).toBe("all");
		expect(c.get("members.view|platform")).toBe("all");
		expect(c.get("clients.view|platform")).toBe("none");
		expect(c.get("clients.view.clinical|platform")).toBe("none");
		expect(c.get("notes.view|platform")).toBe("none");
	});

	it("a custom role appears as soon as it is made, named as made and told apart", async () => {
		const made = (await api("POST", "/roles", { name: "Stagiar Ăîș" })).json.id as string;
		await api("PUT", `/roles/${made}/permissions`, { permissions: ["clients_view_own"] });
		const page = await html(rita, "/roles/matrix?detail=all");
		expect(heads(page)).toContain(made);
		expect(page).toContain("Stagiar Ăîș");
		expect(page).toContain("rol personalizat");
		expect(cells(page).get(`clients.view|${made}`)).toBe("own");
		await api("DELETE", `/roles/${made}`);
		expect(heads(await html(rita, "/roles/matrix"))).not.toContain(made);
	});

	it("marks the viewer's own role, in words as well as colour, and no other", async () => {
		const page = await html(rita, "/roles/matrix");
		const reception = role("reception");
		expect(tableOf(page)).toContain(`data-col="${reception}" class="rm-yours"`);
		const yours = [
			...tableOf(page).matchAll(/<th scope="col" data-col="([^"]+)" class="rm-yours"/g),
		];
		expect(yours.map((x) => x[1])).toEqual([reception]);
		expect(tableOf(page).slice(0, tableOf(page).indexOf("</thead>"))).toContain("rolul tău");
		const owner = await html(olga, "/roles/matrix");
		expect(
			[...tableOf(owner).matchAll(/<th scope="col" data-col="([^"]+)" class="rm-yours"/g)].map(
				(x) => x[1],
			),
		).toEqual([role("owner")]);
	});

	it("marks every role of someone who holds two", async () => {
		await api("PUT", "/members/cora", {
			displayName: "cora test",
			roles: [role("coordinator"), role("reception")],
			coordinates: [],
		});
		try {
			const cora = await k.as("cora");
			const page = await html(cora, "/roles/matrix");
			expect(
				[...tableOf(page).matchAll(/<th scope="col" data-col="([^"]+)" class="rm-yours"/g)]
					.map((x) => x[1])
					.sort(),
			).toEqual([role("coordinator"), role("reception")].sort());
		} finally {
			await api("PUT", "/members/cora", {
				displayName: "cora test",
				roles: [role("coordinator")],
				coordinates: [],
			});
		}
	});

	it("marks the platform column for the system administrator", async () => {
		// The estate administrator opens a clinic's console as one of its members (holding no clinic role here).
		await api("PUT", "/members/root", { displayName: "root test", roles: [], coordinates: [] });
		const root = await k.as("root");
		const page = await html(root, "/roles/matrix");
		const yours = [
			...tableOf(page).matchAll(/<th scope="col" data-col="([^"]+)" class="rm-yours"/g),
		].map((x) => x[1]);
		expect(yours).toContain("platform");
		const head = tableOf(page).slice(0, tableOf(page).indexOf("</thead>"));
		const platform = head.slice(head.indexOf('data-col="platform"'));
		expect(platform.slice(0, platform.indexOf("</th>"))).toContain("rolul tău");
	});

	it("has a legend for every mark", async () => {
		const page = await html(rita, "/roles/matrix");
		const legend = page.slice(page.indexOf("data-legend"));
		for (const word of ["Toate", "Doar ale sale", "Ale celor coordonați", "Parțial", "Nu"])
			expect(legend, word).toContain(word);
	});
});

describe("the marks are the role definitions themselves", () => {
	it("every cell of every role says what the service stores for that role", async () => {
		const c = cells(await html(rita, "/roles/matrix?detail=all"));
		for (const seed of SEEDS) {
			const id = role(seed);
			const expected = await expectedOf(id);
			const mine = [...c].filter(([key]) => key.endsWith(`|${id}`));
			expect(mine.length, seed).toBeGreaterThan(100);
			for (const [key, mark] of mine) {
				const row = key.slice(0, key.lastIndexOf("|"));
				expect(mark, `${seed} ${row}`).toBe(expected.get(row) ?? "none");
			}
		}
	});

	it("tells the roles apart where a clinic expects them to differ", async () => {
		const c = cells(await html(rita, "/roles/matrix?detail=all"));
		const at = (row: string, seed: string) => c.get(`${row}|${role(seed)}`);
		expect(at("clients.view", "reception")).toBe("all");
		expect(at("clients.view.clinical", "reception")).toBe("none");
		expect(at("clients.view", "therapist")).toBe("own");
		expect(at("clients.view.clinical", "therapist")).toBe("own");
		expect(at("clients.view", "coordinator")).toBe("assigned");
		expect(at("audit_log.view", "owner")).toBe("all");
		expect(at("audit_log.view", "admin")).toBe("none");
		expect(at("roster.view", "volunteer")).toBe("own");
		expect(at("payments.export", "accountant")).toBe("all");
	});

	it("a permission added to a role shows in the matrix at once, and goes when it is taken away", async () => {
		const id = role("reception");
		const before = await permissionsOf(id);
		expect(cells(await html(rita, "/roles/matrix?detail=all")).get(`builder.view|${id}`)).toBe(
			"none",
		);
		await api("PUT", `/roles/${id}/permissions`, { permissions: [...before, "builder_view_all"] });
		try {
			const c = cells(await html(rita, "/roles/matrix?detail=all"));
			expect(c.get(`builder.view|${id}`)).toBe("all");
			// Nothing else of the role moved.
			expect(c.get(`builder.edit|${id}`)).toBe("none");
			expect(c.get(`clients.view|${id}`)).toBe("all");
		} finally {
			await api("PUT", `/roles/${id}/permissions`, { permissions: before });
		}
		expect(cells(await html(rita, "/roles/matrix?detail=all")).get(`builder.view|${id}`)).toBe(
			"none",
		);
	});

	it("folds a resource into one mark: full, partial or none", async () => {
		const page = await html(rita, "/roles/matrix");
		const fold = (resource: string, seed: string) =>
			new RegExp(`data-fold="${resource}" data-col="${role(seed)}" data-mark="([a-z]+)"`).exec(
				tableOf(page),
			)?.[1];
		expect(fold("audit_log", "owner")).toBe("full");
		expect(fold("clients", "reception")).toBe("partial");
		expect(fold("audit_log", "reception")).toBe("none");
		// Folded, the actions wait behind their resource's button.
		expect(tableOf(page)).toContain('data-show="$rmoClients" style="display:none"');
		expect(tableOf(page)).toContain('aria-expanded="false"');
	});
});

describe("only the differences, and two roles side by side", () => {
	it("the differences filter keeps exactly the rows where the roles shown disagree", async () => {
		const full = cells(await html(rita, "/roles/matrix?detail=all"));
		const page = await html(rita, "/roles/matrix?diff=1");
		const shown = rows(page);
		expect(shown.length).toBeGreaterThan(0);
		const columns = heads(page);
		const allRows = [...new Set([...full.keys()].map((k) => k.slice(0, k.lastIndexOf("|"))))];
		for (const row of allRows) {
			const marks = new Set(columns.map((c) => full.get(`${row}|${c}`)));
			expect(shown.includes(row), row).toBe(marks.size > 1);
		}
		// The differences are shown open, not folded.
		expect(tableOf(page)).not.toContain('style="display:none"');
	});

	it("compares two roles: only their columns, only where they differ", async () => {
		const a = role("reception");
		const b = role("therapist");
		const page = await html(rita, `/roles/matrix?a=${a}&b=${b}&diff=1`);
		expect(heads(page)).toEqual([a, b]);
		const c = cells(page);
		for (const row of rows(page)) expect(c.get(`${row}|${a}`), row).not.toBe(c.get(`${row}|${b}`));
		expect(rows(page)).toContain("clients.view.clinical");
		expect(rows(page)).not.toContain("audit_log.view");
		// The phone shows the same two roles, one line per action.
		expect(listOf(page)).toContain(`data-col="${a}"`);
		expect(listOf(page)).toContain(`data-col="${b}"`);
	});

	it("two roles with the same rights: says so instead of an empty table", async () => {
		const copy = (
			await api("POST", "/roles", { name: "Recepție bis", copyFrom: role("reception") })
		).json.id as string;
		try {
			const page = await html(rita, `/roles/matrix?a=${role("reception")}&b=${copy}&diff=1`);
			expect(page).toContain("data-no-diff");
			expect(page).toContain("exact aceleași drepturi");
			expect(page).not.toContain('data-view="table"');
		} finally {
			await api("DELETE", `/roles/${copy}`);
		}
	});

	it("a pair that is not two known, different roles shows every role", async () => {
		for (const q of [
			`a=${role("reception")}&b=${role("reception")}`,
			`a=${role("reception")}&b=unknown-role`,
			`a=${role("reception")}`,
			"a=&b=",
			"diff=yes&detail=everything",
		])
			expect(heads(await html(rita, `/roles/matrix?${q}`)).length, q).toBe(8);
	});

	it("the platform role can be compared too", async () => {
		const page = await html(rita, `/roles/matrix?a=platform&b=${role("owner")}&diff=1`);
		expect(heads(page)).toEqual(["platform", role("owner")]);
		expect(rows(page)).toContain("clients.view");
		expect(rows(page)).not.toContain("roles.edit");
	});
});

describe("the phone list", () => {
	it("shows the viewer's own role by default, and the one picked otherwise", async () => {
		const own = listOf(await html(rita, "/roles/matrix"));
		expect(own).toContain(`data-col="${role("reception")}"`);
		expect(own).not.toContain(`data-col="${role("owner")}"`);
		const picked = listOf(await html(rita, `/roles/matrix?role=${role("therapist")}`));
		expect(picked).toContain(`data-col="${role("therapist")}"`);
		expect(picked).not.toContain(`data-col="${role("reception")}"`);
	});

	it("offers every role in its picker and in both compare pickers", async () => {
		const page = await html(rita, "/roles/matrix");
		const from = page.indexOf("data-filters");
		const form = page.slice(from, page.indexOf("</form>", from));
		for (const name of ["role", "a", "b"]) expect(form).toContain(`name="${name}"`);
		for (const seed of SEEDS) expect(form.split(`value="${role(seed)}"`).length - 1).toBe(3);
		expect(form.split('value="platform"').length - 1).toBe(3);
	});
});

describe("the assistant runs it through the same registry and the same service", () => {
	it("reception's assistant is offered the action and gets the roles' definitions", async () => {
		const port = createSdkPort({
			baseUrl: k.api.url,
			bearer: () => k.api.tokenFor("rita"),
		});
		const caps = await port.capabilities("rita", "psizone");
		const ctx: ActionCtx = {
			port,
			app: "psizone",
			can: canOf(caps, false),
			actor: { subject: "rita", name: "rita test" },
			locale: "ro",
			today: "2026-11-16",
		};
		expect(listActions(ctx, { screen: "global" }).map((a) => a.id)).toContain("nav.roles-matrix");
		const result = await runAction(ctx, "nav.roles-matrix", {}, { via: "assistant" });
		expect(result.status).toBe("ok");
		if (result.status !== "ok") return;
		expect(result.to).toBe("/roles/matrix");
		const summary = await port.roleSummary("psizone");
		expect(result.data).toEqual({
			roles: summary.roles.map((r) => ({ id: r.id, name: r.name, system: r.system })),
			platform: "Administrator sistem",
		});
		expect(JSON.stringify(result.data).length).toBeLessThan(2000);
		expect(JSON.stringify(result.data)).not.toContain('"members"');
	});
});
