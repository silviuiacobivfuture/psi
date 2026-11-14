import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LIST_PAGE } from "../port/port";
import { type SdkConsole, type Session, startSdkConsole } from "./sdk-harness";

/**
 * Requests, the blacklist and a day's reminders over the real service, a page at a time: one page and a "show more"
 * that appends the next, gone on the last page; an empty list says so with no control; one page has no control.
 */
const A = "/v1/apps/psizone";
const DATASTAR = { headers: { "datastar-request": "true" } };
/** 2026-11-19 in Bucharest: the busy reminders day (the populated world has none on it). */
const DAY = "2026-11-19";
const MORNING = Date.UTC(2026, 10, 19, 6);
const EXTRA = LIST_PAGE + 7;
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

/** The `…/more` address a page carries, or null. */
const moreOf = (html: string, path: string): string | null => {
	const at = new RegExp(`(${path.replaceAll("/", "\\/")}\\?[^'"]*?)(?:'|&#39;)`).exec(html)?.[1];
	return at === undefined ? null : at.replaceAll("&amp;", "&");
};

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

/** Every row of a list, page after page through its "show more", and how many answers it took. */
async function walk(
	s: Session,
	page: string,
	more: string,
	rows: RegExp,
): Promise<{ first: number; all: string[]; answers: number; last: string }> {
	const html = await (await s.get(page)).text();
	const all = [...html.matchAll(rows)].map((x) => x[1] ?? "");
	const first = all.length;
	let next = moreOf(html, more);
	let answers = 0;
	let last = html;
	while (next !== null) {
		const res = await s.raw(next, DATASTAR);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		last = await res.text();
		expect(last).toContain("mode append");
		all.push(...[...last.matchAll(rows)].map((x) => x[1] ?? ""));
		next = moreOf(last, more);
		answers++;
	}
	return { first, all, answers, last };
}

describe("requests, a page at a time", () => {
	it("many open: one page, then the rest appended, the control gone with the last page", async () => {
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
		expect(open).toBeGreaterThan(LIST_PAGE);
		const { first, all, answers, last } = await walk(
			s,
			"/requests",
			"/requests/more",
			/id="req-([^"]+)"/g,
		);
		expect(first).toBe(LIST_PAGE);
		expect(all).toHaveLength(open);
		expect(new Set(all).size).toBe(all.length);
		expect(answers).toBe(Math.ceil(open / LIST_PAGE) - 1);
		expect(last).toContain('id="requests-more"');
		expect(moreOf(last, "/requests/more")).toBeNull();
	});

	it("the open count says '50+' while more follow", async () => {
		const html = await (await (await k.as("olga")).get("/requests")).text();
		expect(html).toContain(`(${LIST_PAGE}+)`);
	});

	it("handled: none yet, the empty state and no control", async () => {
		const html = await (await (await k.as("olga")).get("/requests?show=handled")).text();
		expect(html).toContain("requests-live");
		expect(html).not.toContain('id="req-');
		expect(moreOf(html, "/requests/more")).toBeNull();
	});

	it("a live update re-renders the first page (what was appended folds back)", async () => {
		const s = await k.as("olga");
		const stream = await s.open("/live?screen=requests&show=open");
		await new Promise((r) => setTimeout(r, 300));
		await k.api.world.callKey("psizone-web", "POST", `${A}/book/callback-requests`, {
			contact: { name: "Callback live", phone: "0733099999" },
			locale: "ro",
		});
		const seen = await until(stream, 'id="requests-more"');
		expect(seen).toContain('id="requests-live"');
		expect([...seen.matchAll(/id="req-([^"]+)"/g)]).toHaveLength(LIST_PAGE);
		expect(moreOf(seen, "/requests/more")).not.toBeNull();
	});

	it("the control is refused to who may not see the requests", async () => {
		const res = await (await k.as("dora")).raw(
			"/requests/more?show=open&cursor=x&shown=50",
			DATASTAR,
		);
		expect(res.status).toBe(403);
	});
});

describe("the blacklist, a page at a time", () => {
	it("many: one page, the rest appended, every client once, named", async () => {
		const s = await k.as("olga");
		const { first, all, last } = await walk(
			s,
			"/settings/blacklist",
			"/settings/blacklist/more",
			/data-listed="([^"]+)"/g,
		);
		expect(first).toBe(LIST_PAGE);
		expect(all.length).toBeGreaterThanOrEqual(EXTRA);
		expect(new Set(all).size).toBe(all.length);
		expect(moreOf(last, "/settings/blacklist/more")).toBeNull();
		const html = await (await s.get("/settings/blacklist")).text();
		// Named, never by their ids.
		expect(html).toContain("Listed Client ");
	});
});

describe("a day's reminders, a page at a time", () => {
	it("many: one page, the rest appended, the control gone with the last", async () => {
		const s = await k.as("olga");
		const { first, all, last } = await walk(
			s,
			`/reminders?date=${DAY}`,
			"/reminders/more",
			/id="rem-([^"-]+)"/g,
		);
		expect(first).toBe(LIST_PAGE);
		expect(all).toHaveLength(EXTRA);
		expect(new Set(all).size).toBe(EXTRA);
		expect(moreOf(last, "/reminders/more")).toBeNull();
	});

	it("one page: a quiet day has no control", async () => {
		const html = await (await (await k.as("olga")).get("/reminders?date=2026-11-14")).text();
		expect(moreOf(html, "/reminders/more")).toBeNull();
	});

	it("empty: a day with none says so", async () => {
		const html = await (await (await k.as("olga")).get("/reminders?date=2028-03-01")).text();
		expect(html).not.toContain('id="rem-');
		expect(moreOf(html, "/reminders/more")).toBeNull();
	});
});
