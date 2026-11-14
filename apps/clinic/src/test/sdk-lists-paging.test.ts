import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SdkConsole, type Session, startSdkConsole } from "./sdk-harness";

/**
 * Requests, the blacklist, a day's reminders and the team over the real service, as numbered pages: every row once
 * across the pages, the service's total in "1–50 din N", the last partial page, a page past the end showing the last,
 * a size change keeping the first row in view, the in-place answer, a live update re-rendering the page shown, an
 * empty list saying so with no pager, and each list refused to who may not see it.
 */
const A = "/v1/apps/psizone";
const DATASTAR = { headers: { "datastar-request": "true" } };
/** 2026-11-19 in Bucharest: the busy reminders day (the populated world has none on it). */
const DAY = "2026-11-19";
const MORNING = Date.UTC(2026, 10, 19, 6);
const EXTRA = 57;
let k: SdkConsole;

beforeAll(async () => {
	k = await startSdkConsole();
	const w = k.api.world;
	for (let i = 0; i < EXTRA; i++) {
		const r = await w.callKey("psizone-web", "POST", `${A}/book/callback-requests`, {
			contact: { name: `Callback ${i}`, phone: `07330${String(i).padStart(5, "0")}` },
			locale: "ro",
		});
		expect(r.status, JSON.stringify(r.json)).toBe(200);
	}
	for (let i = 0; i < EXTRA; i++) {
		const r = await w.call("olga", "PUT", `${A}/members/paged-${String(i).padStart(3, "0")}`, {
			displayName: `Membru Pagină ${String(i).padStart(3, "0")}`,
			roles: [w.ids.roles.reception ?? "reception"],
			coordinates: [],
		});
		expect(r.status, JSON.stringify(r.json)).toBe(200);
	}
	const people = [w.ids.dora, w.ids.elena];
	for (let i = 0; i < EXTRA; i++) {
		const client = String(
			(await w.call("olga", "POST", `${A}/clients`, { name: `Listed Client ${i}` })).json.id,
		);
		// Booked first: a flagged client's booking would wait for an acknowledgement.
		const start = MORNING + Math.floor(i / people.length) * 1_200_000;
		const made = await w.call("olga", "POST", `${A}/appointments`, {
			practitionerId: people[i % people.length],
			clientId: client,
			start,
			end: start + 1_200_000,
		});
		expect(made.status, JSON.stringify(made.json)).toBe(200);
		const flagged = await w.call("olga", "POST", `${A}/blacklist`, {
			client,
			reason: `synthetic reason ${i}`,
			category: "other",
			severity: "warn",
		});
		expect(flagged.status, JSON.stringify(flagged.json)).toBe(200);
	}
});
afterAll(() => k.close());

/** What a live stream carries until `needle` arrives (or a few seconds pass). */
async function until(res: Response, needle: string, ms = 4000): Promise<string> {
	const reader = res.body?.getReader();
	if (reader === undefined) throw new Error("no stream");
	const decoder = new TextDecoder();
	let seen = "";
	const deadline = Date.now() + ms;
	try {
		while (Date.now() < deadline && !seen.includes(needle)) {
			const next = await Promise.race([
				reader.read(),
				new Promise<undefined>((r) => setTimeout(() => r(undefined), 200)),
			]);
			if (next === undefined) continue;
			if (next.done) break;
			seen += decoder.decode(next.value, { stream: true });
		}
	} finally {
		await reader.cancel().catch(() => undefined);
	}
	return seen;
}

const range = (html: string): string => /data-range[^>]*>([^<]+)</.exec(html)?.[1] ?? "";
const current = (html: string): string => /aria-current="page"[^>]*>(\d+)</.exec(html)?.[1] ?? "";
const rowsOf = (html: string, row: RegExp): string[] =>
	[...html.matchAll(row)].map((x) => x[1] ?? "");

/** Every row of a numbered list, page after page at `size`, and the pages it took. */
async function walk(s: Session, path: string, size: number, row: RegExp) {
	const sep = path.includes("?") ? "&" : "?";
	const first = await (await s.get(`${path}${sep}page=1&size=${size}`)).text();
	const total = Number(/din (\d+)/.exec(range(first))?.[1] ?? "0");
	const pages = Math.max(1, Math.ceil(total / size));
	const all = rowsOf(first, row);
	let last = first;
	for (let p = 2; p <= pages; p++) {
		last = await (await s.get(`${path}${sep}page=${p}&size=${size}`)).text();
		expect(current(last)).toBe(String(p));
		all.push(...rowsOf(last, row));
	}
	return { first, last, total, pages, all };
}

const REQ = /id="req-([^"]+)"/g;
const LISTED = /data-listed="([^"]+)"/g;
const REM = /id="rem-([^"-]+)"/g;
const MEM = /data-member="([^"]+)"/g;

describe("requests in numbered pages", () => {
	it("every open request once, the service's count, the last page partial", async () => {
		const s = await k.as("olga");
		const open = (
			(
				await k.api.world.call(
					"olga",
					"GET",
					`${A}/requests?from=0&to=${Date.now() * 2}&state=open&limit=500`,
				)
			).json.items as unknown[]
		).length;
		expect(open).toBeGreaterThan(25);
		const { first, last, total, pages, all } = await walk(s, "/requests", 25, REQ);
		expect(total).toBe(open);
		expect(rowsOf(first, REQ)).toHaveLength(25);
		expect(rowsOf(last, REQ)).toHaveLength(open - 25 * (pages - 1));
		expect(new Set(all).size).toBe(open);
		expect(last).not.toContain('rel="next"');
		expect(first).toContain(`(${open})`);
	});

	it("handled: none yet, the empty state and no pager", async () => {
		const html = await (await (await k.as("olga")).get("/requests?show=handled")).text();
		expect(html).toContain("requests-live");
		expect(html).not.toContain('id="req-');
		expect(html).not.toContain('id="requests-pager"');
	});

	it("a live update re-renders the page shown, not the first", async () => {
		const s = await k.as("olga");
		const stream = await s.open("/live?screen=requests&show=open&page=2&size=25");
		await new Promise((r) => setTimeout(r, 300));
		await k.api.world.callKey("psizone-web", "POST", `${A}/book/callback-requests`, {
			contact: { name: "Callback live", phone: "0733099999" },
			locale: "ro",
		});
		const seen = await until(stream, 'id="requests-pager"');
		expect(seen).toContain('id="requests-live"');
		expect(current(seen)).toBe("2");
		expect(rowsOf(seen, REQ)).toHaveLength(25);
	});

	it("is refused to who may not see the requests, answering none of them", async () => {
		const res = await (await k.as("dora")).raw("/requests?page=2&size=25", DATASTAR);
		expect(res.status).toBe(403);
		expect(await res.text()).not.toContain('id="req-');
	});
});

describe("the blacklist in numbered pages", () => {
	it("every listed client once, named, counted as the clients listed (never a phone-only entry)", async () => {
		const s = await k.as("olga");
		await k.api.world.call("olga", "POST", `${A}/blacklist`, {
			phone: "0733 777 777",
			reason: "synthetic phone-only",
			category: "other",
			severity: "warn",
		});
		const { first, total, all } = await walk(s, "/settings/blacklist", 25, LISTED);
		expect(all).toHaveLength(total);
		expect(new Set(all).size).toBe(total);
		expect(total).toBeGreaterThanOrEqual(EXTRA);
		expect(first).toContain("Listed Client ");
	});
});

describe("a day's reminders in numbered pages", () => {
	it("every reminder once, the day kept in every page's address, past the end the last", async () => {
		const s = await k.as("olga");
		const { total, pages, all, last } = await walk(s, `/reminders?date=${DAY}`, 25, REM);
		expect(total).toBe(EXTRA);
		expect(new Set(all).size).toBe(EXTRA);
		expect(last).toContain(`/reminders?date=${DAY}&amp;page=1&amp;size=25`);
		const past = await (await s.get(`/reminders?date=${DAY}&page=99&size=25`)).text();
		expect(current(past)).toBe(String(pages));
	});

	it("a quiet day fits one page; a day with none says so with no pager", async () => {
		const s = await k.as("olga");
		expect(await (await s.get("/reminders?date=2026-11-14")).text()).not.toContain(
			'class="adm-pager__pages"',
		);
		const none = await (await s.get("/reminders?date=2028-03-01")).text();
		expect(none).not.toContain('id="rem-');
		expect(none).not.toContain('id="reminders-pager"');
	});
});

describe("the team in numbered pages", () => {
	it("every member once, by name, the service's count", async () => {
		const s = await k.as("olga");
		const team = (
			(await k.api.world.call("olga", "GET", `${A}/members?limit=500`)).json.items as {
				subject: string;
			}[]
		).map((m) => m.subject);
		const { total, all } = await walk(s, "/settings/members", 25, MEM);
		expect(total).toBe(team.length);
		expect(all).toEqual(team);
	});

	it("a size change keeps the first row in view; the in-place answer patches and pushes", async () => {
		const s = await k.as("olga");
		const html = await (await s.get("/settings/members?from=50&size=25&via=size")).text();
		expect(current(html)).toBe("3");
		const res = await s.raw("/settings/members?page=2&size=25", DATASTAR);
		const body = await res.text();
		expect(body).toContain('id="members-region"');
		expect(body).toContain('history.pushState(null, "", "/settings/members?page=2&size=25")');
	});

	it("is refused to who may not see the team, answering nothing of it", async () => {
		const res = await (await k.as("vera")).raw("/settings/members?page=1&size=25", DATASTAR);
		expect(res.status).toBe(403);
		expect(await res.text()).not.toContain("data-member=");
	});
});
