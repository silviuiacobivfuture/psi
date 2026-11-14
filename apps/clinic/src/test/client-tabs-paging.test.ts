import { afterEach, describe, expect, it } from "vitest";
import { addDays } from "../lib/dates";
import { tabHref } from "../pages/client-tab-pager";
import { DEFAULT_PAGE_SIZE } from "../port/port";
import { type Console, MEMBER, startConsole } from "./harness";

/**
 * A client's appointments, notes, records and packages as numbered pages (the shared pager), over the in-memory
 * clinic: each tab's own address (`/clients/:id/<tab>?page=&size=`), every row once across the pages, the last page
 * partial, an exact multiple filling its last page, a page past the end showing the last, a size change keeping the
 * first row in view, an in-place fetch patching only the tab's body and moving the address, and a tab refused (nothing
 * answered) to who may not see it.
 */
let c: Console;
afterEach(() => c.close());

const DATASTAR = { headers: { "datastar-request": "true" } };
const ids = (html: string, attr: string): string[] =>
	[...html.matchAll(new RegExp(`${attr}="([^"]+)"`, "g"))].map((x) => x[1] ?? "");
const range = (html: string): string => /data-range[^>]*>([^<]+)</.exec(html)?.[1] ?? "";
const current = (html: string): string => /aria-current="page"[^>]*>(\d+)</.exec(html)?.[1] ?? "";
const get = async (path: string): Promise<string> => {
	const res = await c.get(path);
	expect(res.status).toBe(200);
	return res.text();
};

async function withAppointments(n: number): Promise<number> {
	c = await startConsole(MEMBER);
	await c.signIn();
	for (let i = 0; i < n; i++)
		await c.port.createAppointments("psizone", {
			date: addDays("2027-01-04", i),
			startMin: 600,
			columnId: "p1",
			clientId: "c1",
			serviceId: "s1",
		});
	return (await c.port.clientAppointments("psizone", "c1")).length;
}

describe("a client's appointments as numbered pages", () => {
	it("walks every page once, the last partial, past the end showing the last", async () => {
		const total = await withAppointments(DEFAULT_PAGE_SIZE + 6);
		const first = await get("/clients/c1/appointments");
		expect(ids(first, "data-appointment")).toHaveLength(DEFAULT_PAGE_SIZE);
		expect(range(first)).toBe(`1–${DEFAULT_PAGE_SIZE} din ${total}`);
		expect(first).toContain(
			`href="${tabHref("c1", "appointments", 2, 50).replaceAll("&", "&amp;")}"`,
		);
		const seen: string[] = [];
		const pages = Math.ceil(total / 25);
		for (let p = 1; p <= pages; p++)
			seen.push(
				...ids(await get(`/clients/c1/appointments?page=${p}&size=25`), "data-appointment"),
			);
		expect(seen).toHaveLength(total);
		expect(new Set(seen).size).toBe(total);
		const last = await get(`/clients/c1/appointments?page=${pages}&size=25`);
		expect(ids(last, "data-appointment")).toHaveLength(total - (pages - 1) * 25);
		expect(last).not.toContain('rel="next"');
		const past = await get("/clients/c1/appointments?page=99&size=25");
		expect(current(past)).toBe(String(pages));
	});

	it("a size change opens the page holding the first row shown", async () => {
		await withAppointments(DEFAULT_PAGE_SIZE + 6);
		expect(current(await get("/clients/c1/appointments?from=50&size=25&via=size"))).toBe("3");
		expect(current(await get("/clients/c1/appointments?from=50&size=50&via=size"))).toBe("2");
	});

	it("fetched in place patches only the tab's body, pushes the address and moves the focus", async () => {
		await withAppointments(DEFAULT_PAGE_SIZE + 6);
		const res = await c.get("/clients/c1/appointments?page=2&size=25", DATASTAR);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const body = await res.text();
		expect(body).toContain('id="cl-tab-appointments"');
		expect(body).not.toContain("cl-head");
		expect(ids(body, "data-appointment")).toHaveLength(25);
		expect(body).toContain(
			'history.pushState(null, "", "/clients/c1/appointments?page=2&size=25")',
		);
		expect(body).toContain('getElementById("cl-tab-appointments")?.focus');
	});

	it("one page has no page links; none is the empty state with no pager", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		const few = await get("/clients/c1/appointments");
		expect(ids(few, "data-appointment").length).toBeGreaterThan(0);
		expect(few).not.toContain('class="adm-pager__pages"');
		const made = await c.port.createClient("psizone", {
			name: "Fără Programări",
			phone: null,
			guardian: null,
		});
		const none = await get(`/clients/${made.id}/appointments`);
		expect(ids(none, "data-appointment")).toEqual([]);
		expect(none).not.toContain("cl-pager-appointments");
	});

	it("the page opened at becomes the canonical address, and Back follows it in place", async () => {
		await withAppointments(3);
		const html = await get("/clients/c1/appointments");
		expect(html).toContain(
			"history.replaceState(null, &quot;&quot;, &quot;/clients/c1/appointments?page=1&amp;size=50&quot;)",
		);
		expect(html).toContain('data-on:popstate__window="@get(location.pathname + location.search)"');
	});
});

describe("a client's notes: an exact multiple fills its last page", () => {
	it("fifty notes at 25 a page are two full pages, the second the last", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		const made = await c.port.createClient("psizone", {
			name: "Cu Note",
			phone: null,
			guardian: null,
		});
		for (let i = 0; i < 50; i++)
			await c.port.addNote(
				"psizone",
				made.id,
				{ body: `Notă ${i}`, category: "general" },
				{ subject: MEMBER.sub, name: "Test" },
			);
		const second = await get(`/clients/${made.id}/notes?page=2&size=25`);
		expect([ids(second, "data-note").length, range(second), current(second)]).toEqual([
			25,
			"26–50 din 50",
			"2",
		]);
		expect(second).not.toContain('rel="next"');
		const first = ids(await get(`/clients/${made.id}/notes?page=1&size=25`), "data-note");
		expect(new Set([...first, ...ids(second, "data-note")]).size).toBe(50);
	});
});

describe("a client's packages as numbered pages", () => {
	it("cuts the cards a page at a time, the total said", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		const made = await c.port.createClient("psizone", {
			name: "Cu Pachete",
			phone: null,
			guardian: null,
		});
		for (let i = 0; i < 27; i++)
			await c.port.createPackage("psizone", made.id, {
				name: `Pachet ${i}`,
				sessions: 4,
				bonus: 0,
				totalBani: 1000,
				note: "",
			});
		const html = await get(`/clients/${made.id}/packages?page=2&size=25`);
		expect([(html.match(/class="adm-card pk"/g) ?? []).length, range(html)]).toEqual([
			2,
			"26–27 din 27",
		]);
	});
});

describe("a client tab is refused to who may not see it, answering none of it", () => {
	it.each([
		"/clients/c1/appointments?page=2&size=25",
		"/clients/c1/records?page=2&size=25",
		"/clients/c1/files?page=2&size=25",
		"/clients/c1/packages?page=2&size=25",
	])("%s", async (path) => {
		c = await startConsole(MEMBER, {}, { [MEMBER.sub]: [{ app: "psizone", roles: ["nope"] }] });
		await c.signIn();
		const res = await c.get(path, DATASTAR);
		expect(res.status).toBe(403);
		const body = await res.text();
		expect(body).not.toContain("cl-tab-");
		expect(body).not.toContain("data-appointment=");
	});
});

const BY = { subject: MEMBER.sub, name: "Ana Test" };
const addFiles = async (client: string, n: number): Promise<void> => {
	for (let i = 0; i < n; i++)
		await c.port.uploadFile(
			"psizone",
			client,
			{
				name: `fisier-${i}.txt`,
				contentType: "text/plain",
				bytes: new TextEncoder().encode(`${i}`),
			},
			BY,
		);
};

describe("a client's files as numbered pages (counted by the service)", () => {
	it("walks every page once; a file on a later page still opens its rename sheet", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		await addFiles("c3", DEFAULT_PAGE_SIZE + 5);
		const files = await c.port.files("psizone", "c3");
		const first = await get("/clients/c3/files");
		expect(range(first)).toBe(`1–50 din ${files.length}`);
		const second = await get("/clients/c3/files?page=2&size=50");
		const seen = [...ids(first, "data-file"), ...ids(second, "data-file")];
		expect(new Set(seen).size).toBe(files.length);
		const late = files[files.length - 1];
		expect(first).not.toContain(`data-file="${late?.id}"`);
		const html = await get(`/clients/c3/files?rename=${late?.id}`);
		expect(html).toContain(`/clients/c3/files/${late?.id}/rename`);
	});

	it("none: the empty state and no pager", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		const made = await c.port.createClient("psizone", {
			name: "Fără Fișiere",
			phone: null,
			guardian: null,
		});
		const none = await get(`/clients/${made.id}/files`);
		expect(ids(none, "data-file")).toEqual([]);
		expect(none).not.toContain("cl-pager-files");
	});
});
