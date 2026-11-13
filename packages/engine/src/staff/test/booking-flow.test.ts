import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmProposal } from "../execute";
import { createStaffAssistantRoutes } from "../routes";
import { FakeStaffPort } from "../testing";
import type { StaffViews } from "../views";
import { call, proposalIdOf, sessionFor } from "./helpers";
import { collect, type Harness, romanianOwner, startEngine } from "./turn-harness";

const SLOT = {
	service: undefined,
	date: "2026-11-20",
	time: "13:00",
	resources: ["Ana Pop", "Cabinet Terapie"],
};

function roPort(): FakeStaffPort {
	const port = new FakeStaffPort();
	port.signIn({ locale: "ro" });
	return port;
}

describe("a booking collects what it needs before any card", () => {
	it("a client who does not exist, and no service named: the services come as buttons and nothing is prepared", async () => {
		const port = roPort();
		const session = await sessionFor(port);
		const out = await call(session, "createAppointment", {
			newClient: { name: "Silivu Iacob" },
			date: SLOT.date,
			time: SLOT.time,
			resources: SLOT.resources,
		});
		expect(out.status).toBe("ambiguous");
		expect(out).toMatchObject({ what: "Serviciu" });
		expect(session.cards).toEqual([
			expect.objectContaining({ kind: "choices", title: "Care serviciu?" }),
		]);
		expect(port.writes()).toEqual([]);
	});

	it("with the clinic's one service, it is chosen and said so on the single card that also adds the client", async () => {
		const port = roPort();
		port.data.services = [{ id: "s1", name: "Evaluare", durationMin: 50, priceBani: 15_000 }];
		const session = await sessionFor(port);
		const out = await call(session, "createAppointment", {
			newClient: { name: "Silivu Iacob" },
			date: SLOT.date,
			time: SLOT.time,
			resources: SLOT.resources,
		});
		expect(out.status).toBe("needs_confirmation");
		const card = session.cards.find((c) => c.kind === "proposal");
		expect(card).toMatchObject({ title: "Client nou și programare" });
		expect(JSON.stringify(card)).toContain("Evaluare · singurul serviciu");
		expect(port.writes()).toEqual([]);
		const outcome = await confirmProposal(session, proposalIdOf(out));
		expect(outcome.status).toBe("done");
		expect(port.writes().map((w) => w.method)).toEqual(["createClient", "createAppointment"]);
	});

	it("a therapist's usual service is chosen when it is most of what they do, and said so", async () => {
		const port = roPort();
		for (const [i, date] of ["2026-10-20", "2026-10-27", "2026-11-03", "2026-11-04"].entries())
			port.data.appointments.push({
				id: `h${i}`,
				version: "v1",
				date,
				startMin: 600,
				durationMin: 45,
				resourceIds: ["p1"],
				clientId: "c2",
				clientName: "Ion Exemplu",
				title: null,
				serviceId: "s2",
				status: "attended",
			});
		const session = await sessionFor(port);
		const out = await call(session, "createAppointment", {
			clientId: "c2",
			date: SLOT.date,
			time: SLOT.time,
			resources: SLOT.resources,
		});
		expect(out.status).toBe("needs_confirmation");
		expect(JSON.stringify(session.cards)).toContain("Neurofeedback · cel obișnuit al terapeutului");
	});

	it("a therapist with no habit gets the question once, as the clinic's real services", async () => {
		const session = await sessionFor(roPort());
		const out = await call(session, "freeSlots", { resource: "Ana Pop" });
		expect(out).toMatchObject({ status: "ambiguous", what: "Serviciu" });
		const choices = session.cards.find((c) => c.kind === "choices");
		expect(choices).toMatchObject({
			options: [
				expect.objectContaining({ label: "Evaluare" }),
				expect.objectContaining({ label: "Neurofeedback" }),
			],
		});
	});

	it("free times carry the service in what a click sends, so the pick needs no second question", async () => {
		const port = roPort();
		port.data.services = [{ id: "s1", name: "Evaluare", durationMin: 50, priceBani: 15_000 }];
		const session = await sessionFor(port);
		await call(session, "freeSlots", { resource: "Ana Pop", from: "2026-11-20", days: 1 });
		const slots = session.cards.find((c) => c.kind === "slots");
		expect(slots?.kind === "slots" && slots.slots.every((s) => s.ask.endsWith("(Evaluare)"))).toBe(
			true,
		);
	});

	it("what is missing is named whole and nothing is prepared, never a bare refusal", async () => {
		const port = roPort();
		const session = await sessionFor(port);
		expect(await call(session, "createAppointment", {})).toMatchObject({
			status: "missing",
			missing: ["client", "date", "time", "resources"],
		});
		expect(
			await call(session, "createAppointment", { clientId: "c1", date: SLOT.date }),
		).toMatchObject({ status: "missing", missing: ["time", "resources"] });
		expect(session.cards).toEqual([]);
		expect(port.writes()).toEqual([]);
	});

	it("a name where an id belongs finds that client, and a name nobody has says the client is missing", async () => {
		const port = roPort();
		const session = await sessionFor(port);
		const found = await call(session, "createAppointment", {
			clientId: "Maria Test",
			service: "Evaluare",
			date: "2026-11-23",
			time: "15:00",
			resources: SLOT.resources,
		});
		expect(found.status).toBe("needs_confirmation");
		const none = await call(session, "createAppointment", {
			clientId: "Iacob Silivu",
			service: "Evaluare",
			date: "2026-11-23",
			time: "16:00",
			resources: SLOT.resources,
		});
		expect(none).toMatchObject({ status: "missing", missing: ["client_not_found"] });
	});

	it("the words of a refusal for something missing tell the model to name it, not to say invalid", async () => {
		const session = await sessionFor(roPort());
		const out = await call(session, "createAppointment", {
			clientId: "c1",
			service: "Evaluare",
			date: SLOT.date,
			time: "13:00",
			resources: ["Ana Pop", "Cabinet Terapie"],
		});
		expect(out.status).toBe("needs_confirmation");
		expect(session.copy.refusal.invalid).toContain("Numește ce lipsește");
	});
});

describe("asking twice for the same thing prepares it once", () => {
	it("the same booking asked again is the same proposal and no second card", async () => {
		const port = roPort();
		const session = await sessionFor(port);
		const input = {
			clientId: "c2",
			service: "Evaluare",
			date: "2026-11-23",
			time: "15:00",
			resources: SLOT.resources,
		};
		const first = await call(session, "createAppointment", input);
		const again = await call(session, "createAppointment", input);
		expect(proposalIdOf(again)).toBe(proposalIdOf(first));
		expect(session.cards.filter((c) => c.kind === "proposal")).toHaveLength(1);
		expect(session.reused.count).toBe(1);
		expect(String(again.instruction)).toContain("already prepared");
		expect((await confirmProposal(session, proposalIdOf(first))).status).toBe("done");
		expect((await confirmProposal(session, proposalIdOf(again))).status).toBe("already_done");
		expect(port.callsTo("createAppointment")).toHaveLength(1);
	});

	it("another slot, another client or another person is a different proposal", async () => {
		const session = await sessionFor(roPort());
		const base = {
			clientId: "c2",
			service: "Evaluare",
			date: "2026-11-23",
			time: "15:00",
			resources: SLOT.resources,
		};
		const a = await call(session, "createAppointment", base);
		const b = await call(session, "createAppointment", { ...base, time: "16:00" });
		const c = await call(session, "createAppointment", { ...base, clientId: "c1" });
		expect(new Set([proposalIdOf(a), proposalIdOf(b), proposalIdOf(c)]).size).toBe(3);
	});
});

describe("pressing twice answers once", () => {
	let h: Harness | undefined;
	let clock = 1_000_000;
	beforeEach(() => {
		vi.stubEnv("OPENROUTER_API_KEY", "");
		clock = 1_000_000;
	});
	afterEach(async () => {
		vi.unstubAllEnvs();
		await h?.close();
		h = undefined;
	});

	it("an identical message in the same conversation within the window is refused as a repeat, with no model call", async () => {
		h = await startEngine(
			[
				{ kind: "text", chunks: ["Prima."] },
				{ kind: "text", chunks: ["A doua."] },
			],
			{ now: () => clock },
		);
		const port = romanianOwner();
		const msg = { message: "Alege vineri, 13 nov. 13:00", threadId: "t1" };
		const first = await collect(h.engine.chat(port, msg));
		expect(first.some((e) => e.type === "refusal")).toBe(false);
		const requests = h.fake.requests.length;
		const second = await collect(
			h.engine.chat(port, { ...msg, message: "  alege vineri, 13 nov. 13:00 " }),
		);
		expect(second.map((e) => e.type)).toEqual(["refusal", "done"]);
		expect(second[0]).toMatchObject({ reason: "duplicate" });
		expect(h.fake.requests.length).toBe(requests);
		expect(port.writes()).toEqual([]);
	});

	it("another conversation, another person, or a moment later is not a repeat", async () => {
		h = await startEngine(
			[
				{ kind: "text", chunks: ["Unu."] },
				{ kind: "text", chunks: ["Doi."] },
				{ kind: "text", chunks: ["Trei."] },
			],
			{ now: () => clock },
		);
		const port = romanianOwner();
		await collect(h.engine.chat(port, { message: "salut", threadId: "t1" }));
		const other = await collect(h.engine.chat(port, { message: "salut", threadId: "t2" }));
		expect(other.some((e) => e.type === "refusal")).toBe(false);
		clock += 6_000;
		const later = await collect(h.engine.chat(port, { message: "salut", threadId: "t1" }));
		expect(later.some((e) => e.type === "refusal")).toBe(false);
	});

	it("over HTTP the page's buttons are held until the turn ends, and a repeat draws nothing at all", async () => {
		h = await startEngine([{ kind: "text", chunks: ["Bine."] }], { now: () => clock });
		const views: StaffViews = {
			exchange: ({ id }) => ({ selector: "#log", mode: "append", html: `<i id="x-${id}"></i>` }),
			chip: () => ({ html: "<i></i>" }),
			text: ({ text }) => ({ html: `<p>${text}</p>` }),
			card: () => ({ html: "<b></b>" }),
			refusal: ({ reason }) => ({ html: `<s data-refusal="${reason}"></s>` }),
			done: () => ({ html: "<s data-done></s>" }),
			briefing: () => ({ html: "<section></section>" }),
			result: () => ({ html: "<b></b>" }),
			dismissed: () => ({ html: "<b></b>" }),
		};
		const app = createStaffAssistantRoutes(() => romanianOwner(), h.engine, { views });
		const post = () =>
			app.request("/chat", {
				method: "POST",
				headers: { "datastar-request": "true", "content-type": "application/json" },
				body: JSON.stringify({ staff: { message: "Alege 13:00", threadId: "t9" } }),
			});
		const first = await (await post()).text();
		expect(first).toContain('"busy":true');
		expect(first.lastIndexOf('"busy":false')).toBeGreaterThan(first.indexOf("data-done"));
		const second = await (await post()).text();
		expect(second).toBe("");
	});
});
