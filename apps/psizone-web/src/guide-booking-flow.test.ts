import { describe, expect, it } from "vitest";
import { FormIdSchema } from "./booking";

/**
 * The whole booking conversation through the app's own routes, against the real scheduling
 * backend (the local Convex with its demo calendar). It runs only when `CONVEX_URL` and
 * `PSI_SCHEDULING_KEY` are set (`set -a; . ./.env; set +a` first); the unit tests of every piece
 * run without it.
 */
const LIVE = Boolean(process.env.CONVEX_URL && process.env.PSI_SCHEDULING_KEY);

describe("the booking form ids", () => {
	it("accepts the page's form and a chat form with a short suffix, and nothing else", () => {
		expect(FormIdSchema.parse("booking")).toBe("booking");
		expect(FormIdSchema.parse("chat-booking")).toBe("chat-booking");
		expect(FormIdSchema.parse("chat-booking-a1b2c3")).toBe("chat-booking-a1b2c3");
		for (const bad of [
			'chat-booking-"><script>',
			"chat-booking-",
			"other",
			"",
			"chat-booking-ABC123",
		]) {
			expect(FormIdSchema.parse(bad)).toBe("booking");
		}
	});
});

interface Chat {
	turns: unknown;
	html: string;
}

function fields(html: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const tag of html.match(/<input[^>]*>/g) ?? []) {
		const name = /name="([^"]*)"/.exec(tag)?.[1];
		const value = /value="([^"]*)"/.exec(tag)?.[1];
		const type = /type="([^"]*)"/.exec(tag)?.[1];
		if (name === undefined || value === undefined) continue;
		if (type === "radio" && !/\bchecked\b/.test(tag)) continue;
		out[name] = value;
	}
	return out;
}

const decode = (s: string): string => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&");

describe.skipIf(!LIVE)("a full booking and a cancel in the chat, against the real backend", () => {
	async function say(
		app: { request: (u: string, i: RequestInit) => Response | Promise<Response> },
		text: string,
		turns: unknown,
	): Promise<Chat> {
		const res = await app.request("/ghid?target=compass-answer", {
			method: "POST",
			headers: { "content-type": "application/json", "datastar-request": "true" },
			body: JSON.stringify({ question: text, compassQuery: text, compassTurns: turns }),
		});
		const raw = await res.text();
		const patches = raw.split("\n\n").filter((b) => b.includes("datastar-patch-elements"));
		const signals = raw.split("\n").find((l) => l.startsWith('data: signals {"compassTurns"'));
		return {
			html: decode(patches.at(-1) ?? ""),
			turns:
				signals === undefined
					? turns
					: JSON.parse(signals.slice("data: signals ".length)).compassTurns,
		};
	}

	async function submit(
		app: { request: (u: string, i: RequestInit) => Response | Promise<Response> },
		path: string,
		body: Record<string, string>,
	): Promise<string> {
		const res = await app.request(path, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded", "datastar-request": "true" },
			body: new URLSearchParams(body).toString(),
		});
		return decode(await res.text());
	}

	it("asks, refines, picks by text, confirms in the form, gets the reference and code, and cancels", async () => {
		const { app } = await import("./server");
		const one = await say(
			app,
			"Bună, aș vrea să fac o programare pentru o evaluare pentru copilul meu",
			[],
		);
		expect(one.html).toContain('name="slot"');
		const two = await say(app, "săptămâna viitoare, dimineața", one.turns);
		expect(two.html).toMatch(/Am căutat după|cele mai apropiate/);
		const three = await say(app, "a doua", two.turns);
		expect(three.html).toContain("e liberă");
		const form = fields(three.html);
		expect(form.slot).toMatch(/\.onsite$/);
		const formId = form.form ?? "";
		expect(formId).toMatch(/^chat-booking-[a-z0-9]+$/);

		// Step 1 of the form: the contact goes to the app, not through the guide.
		const held = await submit(app, "/programare", {
			form: formId,
			name: "Test Vizitator",
			phone: "0712 345 678",
			email: "",
			forWhom: "child",
			when: "any",
			slot: form.slot ?? "",
			consent: "yes",
		});
		const carried = fields(held);
		expect(carried.reference).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
		expect(carried.holdToken).toBeTruthy();

		// Step 2: confirm. The reference and the one-time cancel code appear in the chat.
		const done = await submit(app, "/programare/confirma", carried);
		expect(done).toContain(carried.reference ?? "?");
		const code = /([0-9A-Z]{4}(?:-[0-9A-Z]{4}){3})/.exec(done)?.[1];
		expect(code).toBeDefined();
		expect(done).toContain("scrie-mi în chat");

		// Cancel in chat: first without details, then with the reference and the code.
		const ask = await say(app, "vreau să anulez programarea", three.turns);
		expect(ask.html).toContain("referința");
		expect(ask.html).not.toContain("<form");
		const wrong = await say(app, `${carried.reference} AAAA-AAAA-AAAA-AAAA`, ask.turns);
		expect(wrong.html).toContain("Nu găsesc");
		const cancelled = await say(app, `${carried.reference} ${code}`, ask.turns);
		expect(cancelled.html).toContain("a fost anulată");
		const again = await say(
			app,
			`anulează programarea ${carried.reference} ${code}`,
			cancelled.turns,
		);
		expect(again.html).toContain("nu mai poate fi anulată");
	}, 60_000);
});
