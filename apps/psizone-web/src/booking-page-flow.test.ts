import { encodeSlot } from "@psi/scheduling";
import { describe, expect, it } from "vitest";

/**
 * The booking page and the picker's route through the app's own routes. The first block runs with
 * no store at all (scheduling off: the callback form, and no input ever breaks the route). The
 * second runs against the real scheduling backend (the local Convex with its demo calendar) when
 * `CONVEX_URL` and `PSI_SCHEDULING_KEY` are set (`set -a; . ./.env; set +a` first).
 */
const LIVE = Boolean(process.env.CONVEX_URL && process.env.PSI_SCHEDULING_KEY);

type App = { request: (u: string, i?: RequestInit) => Response | Promise<Response> };

const decode = (s: string): string =>
	s
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&");

async function post(app: App, path: string, body: Record<string, string>): Promise<string> {
	const res = await app.request(path, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded", "datastar-request": "true" },
		body: new URLSearchParams(body).toString(),
	});
	expect(res.status).toBe(200);
	return decode(await res.text());
}

function inputs(html: string, name: string): ReadonlyArray<string> {
	return (html.match(/<input[^>]*>/g) ?? []).filter((tag) => tag.includes(`name="${name}"`));
}

const value = (tag: string | undefined): string => /value="([^"]*)"/.exec(tag ?? "")?.[1] ?? "";
const checked = (tag: string): boolean => /\bchecked\b/.test(tag);

describe("the picker's route and the booking page, scheduling off", () => {
	it("the booking page renders the callback form, never an error, and never the picker", async () => {
		if (LIVE) return;
		const { app } = await import("./server");
		for (const path of [
			"/programare",
			"/en/programare",
			"/programare?serviciu=nope",
			"/programare?serviciu=%3Cscript%3E",
		]) {
			const res = await app.request(path);
			expect(res.status).toBe(200);
			const html = await res.text();
			expect(html).toContain('name="consent"');
			expect(html).not.toContain("pz-slots");
			expect(res.headers.get("cache-control")).toBe("private, no-store");
		}
	}, 30_000);

	it("the route answers any input with a form and writes nothing", async () => {
		if (LIVE) return;
		const { app } = await import("./server");
		const html = await post(app, "/programare/ore", {
			form: 'chat-booking-"><script>',
			service: "../../x",
			week: "2026-13-99",
			day: "x",
			mode: "teleport",
			who: "<b>",
			slot: "z".repeat(500),
			name: "Ana",
		});
		expect(html).toContain('<form id="booking"');
		expect(html).toContain('value="Ana"');
		expect(html).not.toContain('"><script>');
	}, 30_000);
});

describe.skipIf(!LIVE)("the booking page against the real backend", () => {
	it("deep link, week navigation, forged and real slots, the taken notice, and a full booking", async () => {
		const { app } = await import("./server");

		// The page: the picker for the default service, with this week's seven days.
		const page = decode(await (await app.request("/programare")).text());
		expect(page).toContain("pz-slots");
		expect(inputs(page, "day")).toHaveLength(7);
		expect(page).toContain("data-today");
		const slug = value(inputs(page, "shown")[0]);
		expect(slug).toMatch(/^[a-z0-9-]+$/);

		// The deep link preselects a service; an unknown one falls back to the default.
		const deep = decode(await (await app.request(`/programare?serviciu=${slug}`)).text());
		expect(value(inputs(deep, "shown")[0])).toBe(slug);
		const unknown = decode(await (await app.request("/programare?serviciu=zzz-unknown")).text());
		expect(value(inputs(unknown, "shown")[0])).toBe(slug);

		// A real time, read from the picker; nothing is chosen yet, so no contact fields.
		const slots = inputs(page, "slot");
		expect(slots.length).toBeGreaterThan(0);
		expect(page).not.toContain('name="consent"');
		const real = value(slots[0]);
		const base = { form: "booking", cards: "1", shown: slug, service: slug, mode: "onsite" };

		// A forged but well-formed id is refused with the taken notice, nothing chosen.
		const forged = encodeSlot({
			practitioner: "forgedpractitioner1",
			start: Date.now() + 3_600_000 * 24 * 3,
			mode: "onsite",
		});
		const refused = await post(app, "/programare/ore", { ...base, slot: forged });
		expect(refused).not.toContain('name="consent"');
		expect(inputs(refused, "slot").some(checked)).toBe(false);

		// A forged id naming a service the store does not have is the same as no slot.
		const other = await post(app, "/programare/ore", {
			...base,
			service: "zzz-unknown",
			shown: "zzz-unknown",
			slot: real,
		});
		expect(inputs(other, "slot").some(checked)).toBe(false);

		// Next week and back: the week field moves, the typed name stays.
		const next = decode(
			await (
				await app.request("/programare/ore?week=2099-01-01", {
					method: "POST",
					headers: {
						"content-type": "application/x-www-form-urlencoded",
						"datastar-request": "true",
					},
					body: new URLSearchParams({ ...base, name: "Ana Typed" }).toString(),
				})
			).text(),
		);
		expect(value(inputs(next, "week")[0])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(next).toContain('value="Ana Typed"');
		expect(inputs(next, "day").length).toBe(7);

		// The real time opens the details in place, chosen.
		const chosen = await post(app, "/programare/ore", {
			...base,
			slot: real,
			week: value(inputs(page, "week")[0]),
		});
		expect(inputs(chosen, "slot").filter(checked).map(value)).toEqual([real]);
		expect(chosen).toContain('name="consent"');
		expect(chosen).toContain("pz-slots__live");

		// Submitting the details holds the time and shows the confirm step.
		const held = await post(app, "/programare", {
			...base,
			slot: real,
			name: "Test Vizitator",
			phone: "0712 345 678",
			email: "",
			forWhom: "adult",
			when: "any",
			consent: "yes",
		});
		const carried: Record<string, string> = {};
		for (const tag of held.match(/<input[^>]*type="hidden"[^>]*>/g) ?? []) {
			carried[/name="([^"]*)"/.exec(tag)?.[1] ?? ""] = value(tag);
		}
		expect(carried.reference).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);

		// A second visitor takes the same time while it is held: the picker says it just went.
		const second = await post(app, "/programare", {
			...base,
			slot: real,
			name: "Alt Vizitator",
			phone: "0712 345 679",
			email: "",
			forWhom: "adult",
			when: "any",
			consent: "yes",
		});
		expect(second).toContain('role="alert"');
		expect(inputs(second, "slot").some(checked)).toBe(false);

		// Confirming sends the request: the reference and cancel code, as before.
		const done = await post(app, "/programare/confirma", carried);
		expect(done).toContain(carried.reference ?? "?");
		expect(done).toMatch(/[0-9A-Z]{4}(?:-[0-9A-Z]{4}){3}/);
	}, 60_000);
});
