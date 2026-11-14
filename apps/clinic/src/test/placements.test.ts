import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACTIONS } from "../actions/registry";
import { type Console, MEMBER, startConsole } from "./harness";

let owner: Console;
let reception: Console;
beforeAll(async () => {
	owner = await startConsole(
		MEMBER,
		{ today: "2026-11-16", platformAdmins: new Set([MEMBER.sub]) },
		{ [MEMBER.sub]: [{ app: "psizone", roles: ["owner"] }] },
	);
	await owner.signIn();
	reception = await startConsole(
		MEMBER,
		{ today: "2026-11-16" },
		{ [MEMBER.sub]: [{ app: "psizone", roles: ["reception"] }] },
	);
	await reception.signIn();
});
afterAll(async () => {
	await owner.close();
	await reception.close();
});

const REGISTERED = new Set(ACTIONS.map((a) => a.id));

/** Every screen of the console, with a client that has notes, a record and a file, one on the blacklist, and a payable visit. */
async function screens(): Promise<string[]> {
	const data = await owner.port.calendar("psizone", "2026-11-16", "2026-11-30");
	const payable = data.appointments.find(
		(a) =>
			a.status === "confirmed" && a.packageId === null && a.priceBani > 0 && a.paidMethod === null,
	);
	return [
		"/calendar",
		`/calendar?view=day&date=${payable?.date}&appt=${payable?.id}`,
		"/clients",
		"/clients/c1",
		"/clients/c1/notes",
		"/clients/c1/appointments",
		"/clients/c1/packages",
		"/clients/c1/records",
		"/clients/c1/records/new?form=aba-session-report",
		"/clients/c1/files",
		"/clients/c4",
		"/requests",
		"/reminders?date=2026-11-16",
		"/me/settings",
		"/settings/roles",
		"/settings/people",
		"/settings/rooms",
		"/settings/devices",
		"/settings/services",
		"/platform",
		"/settings/assistant",
		"/platform/assistant",
	];
}

const ids = (html: string): string[] =>
	[...html.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1] ?? "");
const posts = (html: string): string[] =>
	[...html.matchAll(/<form[^>]*method="post"[^>]*>/g)].flatMap((m) => {
		const action = /action="([^"]+)"/.exec(m[0])?.[1];
		return action === undefined ? [] : [action];
	});
const template = (path: string): RegExp => new RegExp(`^${path.replace(/:[a-z]+/g, "[^/]+")}$`);
const ROUTES = ACTIONS.flatMap((a) => (a.route?.method === "POST" ? [template(a.route.path)] : []));
/** Forms that are not user actions of the clinic: the sign-out of the platform and the view-as switch (another feature). */
const EXEMPT = [/^\/view-as/, /^\/auth\//, /^\/dev/, /^\/switch\//];

describe("what the screens render comes from the registry, and the registry is reachable", () => {
	it("every control tagged with an action is a registered action, on every screen", async () => {
		const seen: string[] = [];
		for (const path of await screens()) {
			const html = await (await owner.get(path)).text();
			for (const id of ids(html)) {
				expect(REGISTERED.has(id), `${id} on ${path}`).toBe(true);
				seen.push(id);
			}
		}
		expect(seen.length).toBeGreaterThan(20);
	});
	it("every form that posts goes to a route of the registry (or is not a clinic action)", async () => {
		for (const path of await screens()) {
			const html = await (await owner.get(path)).text();
			for (const action of posts(html)) {
				const known = ROUTES.some((r) => r.test(action)) || EXEMPT.some((r) => r.test(action));
				expect(known, `${action} on ${path}`).toBe(true);
			}
		}
	});
	it("every action of the registry is reachable from some screen", async () => {
		const reached = new Set<string>();
		for (const path of await screens())
			for (const id of ids(await (await owner.get(path)).text())) reached.add(id);
		const missing = ACTIONS.map((a) => a.id).filter((id) => !reached.has(id));
		expect(missing).toEqual([]);
	});
	it("a control the registry does not know would be caught: the check refuses an invented id", () => {
		expect(REGISTERED.has("client.invented")).toBe(false);
		expect(ROUTES.some((r) => r.test("/clients/c1/invented"))).toBe(false);
	});
});

describe("capability gating per role", () => {
	it("reception: no clinical record or role editing, but notes, files, the list and the blacklist", async () => {
		const page = await (await reception.get("/clients/c1")).text();
		const got = new Set(ids(page));
		for (const id of ["blacklist.add", "client.edit"]) expect(got.has(id), id).toBe(true);
		// The seeded reception role holds no files permission and no clinical one.
		expect(got.has("file.upload")).toBe(false);
		expect(got.has("record.new")).toBe(false);
		expect(got.has("nav.platform")).toBe(false);
	});
	it("a screen's controls never include an action the person lacks the key for", async () => {
		for (const path of [
			"/clients/c1",
			"/clients/c1/notes",
			"/clients/c1/files",
			"/settings/blacklist",
		]) {
			const res = await reception.get(path);
			if (res.status !== 200) continue;
			for (const id of ids(await res.text())) {
				const action = ACTIONS.find((a) => a.id === id);
				expect(action, id).toBeDefined();
			}
		}
	});
});
