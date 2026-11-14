import { schedulingPort } from "@psi/guide";
import type { RunningApi } from "@psi/scheduling-api/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FormIdSchema } from "./booking";
import { decode, post, siteOnService } from "./test-flow";

/**
 * Booking in the chat against the real scheduling service (apps/scheduling-api in-process, psizone-web's own service
 * key): the guide's tools (the services, the free times, a cancel with the code) and the chat's booking form go
 * through the service's visitor routes like the contact page's. The whole conversation also needs the guide's model
 * (`OPENROUTER_API_KEY`); without it that one case is skipped and every step it drives is still covered here.
 */
const MODEL = Boolean(process.env.OPENROUTER_API_KEY);
const DAY = 86_400_000;

let api: RunningApi;
beforeAll(async () => {
	api = await siteOnService();
});
afterAll(() => api.close());

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

/** The guide's port over the site's own client: what the chat's tools call. */
async function port() {
	const { scheduling } = await import("./booking-store");
	if (scheduling === undefined) throw new Error("scheduling is off");
	return schedulingPort(scheduling);
}

describe("the chat's booking against the scheduling service", () => {
	it("the tools: the live services, free times the form can hold, and a cancel only with the right code", async () => {
		const tools = await port();
		expect((await tools.catalogue?.("psizone"))?.map((s) => s.slug)).toContain("evaluation");
		const found = await tools.findSlots({
			tenant: "psizone",
			service: "evaluation",
			from: Date.now(),
			to: Date.now() + 14 * DAY,
			limit: 5,
		});
		if (!found.ok) throw new Error(found.reason);
		const slot = found.slots.find((s) => s.id.endsWith(".onsite"));
		expect(slot).toBeDefined();

		// The chat's form: the contact goes to the app's routes, never through the guide.
		const { app } = await import("./server");
		const formId = "chat-booking-a1b2c3";
		const held = await post(app, "/programare", {
			form: formId,
			name: "Test Vizitator",
			phone: "0712 345 678",
			email: "",
			forWhom: "child",
			when: "any",
			slot: slot?.id ?? "",
			consent: "yes",
		});
		const carried = fields(held);
		expect(carried.reference).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
		const told = api.world.notifier.sent.length;
		const done = await post(app, "/programare/confirma", carried);
		expect(done).toContain(carried.reference ?? "?");
		const code = /([0-9A-Z]{4}(?:-[0-9A-Z]{4}){3})/.exec(done)?.[1] ?? "";
		expect(code).not.toBe("");
		expect(done).toContain("scrie-mi în chat");
		expect(api.world.notifier.sent.slice(told).map((n) => n.event)).toContain("request.created");

		// The guide cancels with the reference and the code, once.
		const reference = carried.reference ?? "";
		expect(await tools.cancel({ reference, cancelCode: "AAAA-AAAA-AAAA-AAAA" })).toEqual({
			ok: false,
			reason: "not_found",
		});
		expect((await tools.cancel({ reference, cancelCode: code })).ok).toBe(true);
		expect((await tools.cancel({ reference, cancelCode: code })).ok).toBe(false);
		const journal = await api.world.call(
			"olga",
			"GET",
			"/v1/apps/psizone/audit?action=visitor.cancel",
		);
		expect((journal.json.items as { target: { id: string } }[]).map((e) => e.target.id)).toContain(
			reference,
		);
	}, 60_000);

	it.skipIf(!MODEL)(
		"the whole conversation: asks, refines, picks by text, confirms in the form, and cancels",
		async () => {
			const { app } = await import("./server");
			const say = async (text: string, turns: unknown) => {
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
			};
			const one = await say(
				"Bună, aș vrea să fac o programare pentru o evaluare pentru copilul meu",
				[],
			);
			expect(one.html).toContain('name="slot"');
			const two = await say("săptămâna viitoare, dimineața", one.turns);
			const three = await say("a doua", two.turns);
			const form = fields(three.html);
			expect(form.form ?? "").toMatch(/^chat-booking-[a-z0-9]+$/);
			const held = fields(
				await post(app, "/programare", {
					form: form.form ?? "",
					name: "Test Vizitator",
					phone: "0712 345 678",
					email: "",
					forWhom: "child",
					when: "any",
					slot: form.slot ?? "",
					consent: "yes",
				}),
			);
			const done = await post(app, "/programare/confirma", held);
			const code = /([0-9A-Z]{4}(?:-[0-9A-Z]{4}){3})/.exec(done)?.[1];
			const ask = await say("vreau să anulez programarea", three.turns);
			const cancelled = await say(`${held.reference} ${code}`, ask.turns);
			expect(cancelled.html).toContain("a fost anulată");
		},
		120_000,
	);
});
