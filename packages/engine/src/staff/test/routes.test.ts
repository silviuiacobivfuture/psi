import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeOpenRouter, startFakeOpenRouter } from "../../testing";
import { createStaffEngine, type StaffEngine } from "../engine";
import { createStaffAssistantRoutes } from "../routes";
import { FAKE_NOW, FakeStaffPort } from "../testing";
import type { StaffViews } from "../views";

const views: StaffViews = {
	exchange: ({ id, message }) => ({
		selector: "#log",
		mode: "append",
		html: `<div id="x-${id}">${message}</div>`,
	}),
	chip: ({ id, callId, label, phase }) => ({
		selector: `#chips-${id}`,
		mode: "append",
		html: `<i id="c-${callId}" data-p="${phase}">${label}</i>`,
	}),
	text: ({ id, text }) => ({ html: `<p id="t-${id}">${text}</p>` }),
	card: ({ id, card }) => ({
		selector: `#cards-${id}`,
		mode: "append",
		html: `<b data-card="${card.kind}" data-id="${card.kind === "proposal" ? card.proposalId : ""}"></b>`,
	}),
	refusal: ({ id, reason }) => ({ html: `<s id="s-${id}" data-refusal="${reason}"></s>` }),
	done: ({ id }) => ({ html: `<s id="s-${id}" data-done></s>` }),
	briefing: ({ card }) => ({ html: `<section id="briefing" data-kind="${card.kind}"></section>` }),
	result: ({ outcome }) => ({
		html: `<b id="card-${outcome.card.proposalId}" data-status="${outcome.status}"></b>`,
	}),
	dismissed: ({ proposalId }) => ({ html: `<b id="card-${proposalId}" data-dismissed></b>` }),
};

const HEADERS = { "datastar-request": "true", "content-type": "application/json" };
let fake: FakeOpenRouter | undefined;
beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
afterEach(async () => {
	vi.unstubAllEnvs();
	await fake?.close();
});

async function mount(
	port: FakeStaffPort | undefined,
	script: Parameters<typeof startFakeOpenRouter>[0] = [{ kind: "text", chunks: ["Hello."] }],
) {
	fake = await startFakeOpenRouter(script, {}, { autoSearch: false });
	const engine: StaffEngine = createStaffEngine({
		model: { id: "fake/model", apiKey: "k", baseURL: fake.baseURL },
		now: () => FAKE_NOW,
	});
	return createStaffAssistantRoutes(() => port, engine, { views });
}

const body = (message: string) =>
	JSON.stringify({ staff: { message, threadId: "", page: { screen: "calendar" } } });

describe("the assistant's routes", () => {
	it("streams a turn as Datastar patches: the exchange, the signals cleared, the answer, done", async () => {
		const app = await mount(new FakeStaffPort());
		const res = await app.request("/chat", {
			method: "POST",
			headers: HEADERS,
			body: body("hello"),
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const text = await res.text();
		expect(text).toContain("event: datastar-patch-elements");
		expect(text).toContain("selector #log");
		expect(text).toContain("mode append");
		expect(text).toContain('elements <div id="x-');
		expect(text).toContain('signals {"staff":{"message":"","busy":true}}');
		expect(text.lastIndexOf('signals {"staff":{"busy":false}}')).toBeGreaterThan(
			text.indexOf("data-done"),
		);
		expect(text).toContain("Hello.");
		expect(text).toContain("data-done");
		expect(text.indexOf("x-")).toBeLessThan(text.indexOf("data-done"));
	});

	it("shows tool chips and cards on the way", async () => {
		const app = await mount(new FakeStaffPort(), [
			{ kind: "tool", query: "", tool: "staffAgenda", input: {} },
			{ kind: "text", chunks: ["Two."] },
		]);
		const text = await (
			await app.request("/chat", { method: "POST", headers: HEADERS, body: body("agenda") })
		).text();
		expect(text).toContain('data-p="running"');
		expect(text).toContain('data-p="done"');
		expect(text).toContain('data-card="agenda"');
	});

	it("without a signed-in person the turn is a refusal and the model is never asked", async () => {
		const app = await mount(undefined);
		const text = await (
			await app.request("/chat", { method: "POST", headers: HEADERS, body: body("hi") })
		).text();
		expect(text).toContain('data-refusal="no_principal"');
		expect(fake?.requests).toHaveLength(0);
	});

	it("a malformed body is an invalid turn, not a crash", async () => {
		const app = await mount(new FakeStaffPort());
		for (const raw of ["not json", "{}", '{"staff":{"message":5}}', "[]"]) {
			const text = await (
				await app.request("/chat", { method: "POST", headers: HEADERS, body: raw })
			).text();
			expect(text).toContain('data-refusal="invalid"');
		}
		expect(fake?.requests).toHaveLength(0);
	});

	it.each([
		["/chat", "POST"],
		[`/confirm?proposal=prop_${"a".repeat(32)}`, "POST"],
		[`/dismiss?proposal=prop_${"a".repeat(32)}`, "POST"],
		["/briefing", "GET"],
	])("%s refuses a request that is not from the page's own Datastar", async (path, method) => {
		const port = new FakeStaffPort();
		const app = await mount(port);
		expect(
			(
				await app.request(path, {
					method,
					headers: { "content-type": "application/json" },
					body: method === "POST" ? body("hi") : undefined,
				})
			).status,
		).toBe(403);
		expect(
			(
				await app.request(path, {
					method,
					headers: { ...HEADERS, "sec-fetch-site": "cross-site" },
					body: method === "POST" ? body("hi") : undefined,
				})
			).status,
		).toBe(403);
		expect(port.calls).toEqual([]);
	});

	it("confirm executes a prepared change once; dismiss closes another; ids are validated", async () => {
		const port = new FakeStaffPort();
		const app = await mount(port, [
			{ kind: "tool", query: "", tool: "staffCancelAppointment", input: { appointmentId: "a1" } },
			{ kind: "tool", query: "", tool: "staffCancelAppointment", input: { appointmentId: "a2" } },
			{ kind: "text", chunks: ["Prepared."] },
		]);
		expect(
			(await app.request("/confirm?proposal=../x", { method: "POST", headers: HEADERS })).status,
		).toBe(400);
		expect((await app.request("/confirm", { method: "POST", headers: HEADERS })).status).toBe(400);
		expect(
			(await app.request("/dismiss?proposal=nope", { method: "POST", headers: HEADERS })).status,
		).toBe(400);
		const chat = await (
			await app.request("/chat", { method: "POST", headers: HEADERS, body: body("cancel both") })
		).text();
		const [first, second] = [...chat.matchAll(/data-id="(prop_[0-9a-f]{32})"/g)].map(
			(m) => m[1] ?? "",
		);
		expect(first).toBeTruthy();
		expect(port.writes()).toEqual([]);
		const done = await (
			await app.request(`/confirm?proposal=${first}`, { method: "POST", headers: HEADERS })
		).text();
		expect(done).toContain('data-status="done"');
		expect(port.appointmentOf("a1").status).toBe("cancelled");
		const again = await (
			await app.request(`/confirm?proposal=${first}`, { method: "POST", headers: HEADERS })
		).text();
		expect(again).toContain('data-status="already_done"');
		expect(port.callsTo("cancelAppointment")).toHaveLength(1);
		const dismissed = await (
			await app.request(`/dismiss?proposal=${second}`, { method: "POST", headers: HEADERS })
		).text();
		expect(dismissed).toContain("data-dismissed");
		const late = await (
			await app.request(`/confirm?proposal=${second}`, { method: "POST", headers: HEADERS })
		).text();
		expect(late).toContain('data-status="already_done"');
		expect(port.appointmentOf("a2").status).toBe("confirmed");
	});

	it("the briefing is a patch without a model", async () => {
		const app = await mount(new FakeStaffPort());
		const text = await (await app.request("/briefing", { headers: HEADERS })).text();
		expect(text).toContain('data-kind="briefing"');
		expect(fake?.requests).toHaveLength(0);
	});

	it("the briefing for nobody is empty", async () => {
		const app = await mount(undefined);
		expect(await (await app.request("/briefing", { headers: HEADERS })).text()).toBe("");
	});

	it("confirming with nobody signed in says so and does nothing", async () => {
		const app = await mount(undefined);
		const text = await (
			await app.request(`/confirm?proposal=prop_${"b".repeat(32)}`, {
				method: "POST",
				headers: HEADERS,
			})
		).text();
		expect(text).toContain('data-status="no_principal"');
	});
});
