import { describe, expect, it } from "vitest";
import { FENCE_CLOSE, FENCE_OPEN } from "../fence";
import { FakeStaffPort } from "../testing";
import { call, sessionFor } from "./helpers";

describe("findClient", () => {
	it("finds by name, fences names, and shows a list card", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port);
		const out = await call(session, "findClient", { query: "maria" });
		expect(out.status).toBe("ok");
		expect(out.clients).toEqual([
			{
				id: "c1",
				name: `${FENCE_OPEN}Maria Test${FENCE_CLOSE}`,
				archived: false,
			},
		]);
		expect(session.cards).toHaveLength(1);
		expect(session.cards[0]?.kind).toBe("list");
	});

	it("hides archived clients unless asked, and says none when nothing matches", async () => {
		const session = await sessionFor(new FakeStaffPort());
		expect((await call(session, "findClient", { query: "arhivata" })).status).toBe("none");
		const withArchived = await call(session, "findClient", {
			query: "arhivata",
			includeArchived: true,
		});
		expect(withArchived.status).toBe("ok");
	});

	it("matches without diacritics or case, and by phone digits", async () => {
		const session = await sessionFor(new FakeStaffPort());
		expect((await call(session, "findClient", { query: "EXEMPLU" })).status).toBe("ok");
		expect((await call(session, "findClient", { query: "0712000002" })).status).toBe("ok");
	});

	it("never returns more than the limit and says there is more", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port);
		const out = await call(session, "findClient", {
			query: "maria",
			includeArchived: true,
			limit: 1,
		});
		expect(out.status).toBe("ok");
		expect(out.more).toBe(true);
		expect(out.clients).toHaveLength(1);
	});

	it("refuses a query that is too short or a limit above ten (the schema)", async () => {
		const session = await sessionFor(new FakeStaffPort());
		await expect(call(session, "findClient", { query: "m" })).rejects.toThrow();
		await expect(call(session, "findClient", { query: "maria", limit: 11 })).rejects.toThrow();
		await expect(call(session, "findClient", { query: "maria", extra: true })).rejects.toThrow();
	});

	it("when the port refuses, the assistant is told, and a second try is not sent to the port", async () => {
		const port = new FakeStaffPort();
		port.denied.add("findClients");
		const session = await sessionFor(port);
		const first = await call(session, "findClient", { query: "maria" });
		expect(first).toMatchObject({ status: "refused", reason: "forbidden" });
		const second = await call(session, "findClient", { query: "maria" });
		expect(second).toMatchObject({ status: "refused", reason: "repeat" });
		expect(port.callsTo("findClients")).toHaveLength(1);
		expect(session.cards).toHaveLength(0);
	});

	it("an unavailable service is a refusal, not a throw", async () => {
		const port = new FakeStaffPort();
		port.down.add("findClients");
		const out = await call(await sessionFor(port), "findClient", {
			query: "maria",
		});
		expect(out).toMatchObject({ status: "refused", reason: "unavailable" });
	});
});

describe("clientSummary", () => {
	it("returns what the service returned, clinical data included, free text fenced", async () => {
		const session = await sessionFor(new FakeStaffPort());
		const out = await call(session, "clientSummary", { clientId: "c1" });
		expect(out).toMatchObject({ status: "ok", id: "c1", archived: false });
		expect(out.clinical).toEqual({
			diagnosis: `${FENCE_OPEN}Synthetic diagnosis${FENCE_CLOSE}`,
			lastReportDate: "2026-11-02",
		});
		expect(out.note).toBe(`${FENCE_OPEN}Prefers mornings.${FENCE_CLOSE}`);
		expect(out.contact).toEqual({
			phone: "0712 000 001",
			email: "maria@example.test",
		});
	});

	it("has no clinical key when the service did not return it", async () => {
		const port = new FakeStaffPort();
		port.denied.add("clinical");
		const out = await call(await sessionFor(port), "clientSummary", {
			clientId: "c1",
		});
		expect(out.status).toBe("ok");
		expect("clinical" in out).toBe(false);
	});

	it("defaults to the client on the open screen, and needs one", async () => {
		const port = new FakeStaffPort();
		const onScreen = await sessionFor(port, {
			page: { screen: "client", clientId: "c2" },
		});
		expect(await call(onScreen, "clientSummary")).toMatchObject({
			status: "ok",
			id: "c2",
		});
		const nowhere = await sessionFor(port);
		expect(await call(nowhere, "clientSummary")).toMatchObject({
			status: "refused",
			reason: "invalid",
		});
	});

	it("not found and forbidden are refusals; forbidden blocks the tool for the turn", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port);
		expect(await call(session, "clientSummary", { clientId: "nobody" })).toMatchObject({
			reason: "not_found",
		});
		port.denied.add("clientSummary");
		expect(await call(session, "clientSummary", { clientId: "c1" })).toMatchObject({
			reason: "forbidden",
		});
		expect(await call(session, "clientSummary", { clientId: "c2" })).toMatchObject({
			reason: "repeat",
		});
		expect(port.callsTo("clientSummary")).toHaveLength(3 - 1);
	});
});

describe("agenda", () => {
	it("lists a day for everyone, with a card", async () => {
		const session = await sessionFor(new FakeStaffPort());
		const out = await call(session, "agenda", { from: "2026-11-13" });
		expect(out).toMatchObject({ status: "ok", count: 2, truncated: false });
		expect(session.cards[0]).toMatchObject({ kind: "agenda" });
	});

	it("defaults to today in the clinic's time zone", async () => {
		const out = await call(await sessionFor(new FakeStaffPort()), "agenda");
		expect(out).toMatchObject({ from: "2026-11-13", to: "2026-11-13" });
	});

	it("narrows to one person by name, without diacritics or case", async () => {
		const out = await call(await sessionFor(new FakeStaffPort()), "agenda", {
			from: "2026-11-13",
			resource: "dan IONESCU",
		});
		expect(out).toMatchObject({ status: "ok", count: 1 });
	});

	it("narrows to a device and a room", async () => {
		const session = await sessionFor(new FakeStaffPort());
		expect(await call(session, "agenda", { from: "2026-11-13", resource: "nfb 1" })).toMatchObject({
			count: 1,
		});
		expect(
			await call(session, "agenda", {
				from: "2026-11-13",
				resource: "Cabinet",
			}),
		).toMatchObject({ count: 1 });
	});

	it("asks which one when a name matches several, and says none when it matches nothing", async () => {
		const session = await sessionFor(new FakeStaffPort());
		const several = await call(session, "agenda", { resource: "a" });
		expect(several.status).toBe("ambiguous");
		expect(await call(session, "agenda", { resource: "zzz" })).toMatchObject({
			status: "none",
		});
	});

	it("covers several days and an empty day", async () => {
		const session = await sessionFor(new FakeStaffPort());
		expect(await call(session, "agenda", { from: "2026-11-13", days: 2 })).toMatchObject({
			count: 3,
		});
		expect(await call(session, "agenda", { from: "2026-12-01" })).toMatchObject({
			count: 0,
			appointments: [],
		});
		await expect(call(session, "agenda", { days: 15 })).rejects.toThrow();
	});

	it("fences the client's name and notes in what the model reads", async () => {
		const out = await call(await sessionFor(new FakeStaffPort()), "agenda", {
			from: "2026-11-13",
		});
		expect(JSON.stringify(out)).toContain(`${FENCE_OPEN}Maria Test${FENCE_CLOSE}`);
		expect(JSON.stringify(out)).not.toContain('"Maria Test"');
	});

	it("a refused agenda is a refusal", async () => {
		const port = new FakeStaffPort();
		port.denied.add("agenda");
		expect(await call(await sessionFor(port), "agenda")).toMatchObject({
			status: "refused",
			reason: "forbidden",
		});
	});
});

describe("freeSlots", () => {
	it("returns the staff view: every column's free times for a service by name", async () => {
		const session = await sessionFor(new FakeStaffPort());
		const out = await call(session, "freeSlots", {
			service: "evaluare",
			from: "2026-11-16",
			days: 1,
		});
		expect(out.status).toBe("ok");
		expect(out.slots).toHaveLength(6);
		expect(session.cards[0]).toMatchObject({ kind: "slots" });
	});

	it("skips times that are taken, and honours the limit", async () => {
		const session = await sessionFor(new FakeStaffPort());
		const out = await call(session, "freeSlots", {
			service: "Evaluare",
			from: "2026-11-13",
			days: 1,
			limit: 20,
		});
		const starts = (out.slots as Array<{ startMin: number }>).map((s) => s.startMin);
		expect(starts).not.toContain(600);
		const limited = await call(session, "freeSlots", {
			service: "s1",
			from: "2026-11-16",
			days: 7,
			limit: 3,
		});
		expect(limited.slots).toHaveLength(3);
	});

	it("for one person, and with an unknown or ambiguous service or person", async () => {
		const session = await sessionFor(new FakeStaffPort());
		expect(
			await call(session, "freeSlots", {
				service: "s1",
				resource: "Dan",
				from: "2026-11-16",
				days: 1,
			}),
		).toMatchObject({ status: "ok" });
		expect(await call(session, "freeSlots", { service: "nothing" })).toMatchObject({
			status: "none",
		});
		expect(await call(session, "freeSlots", { service: "e" })).toMatchObject({
			status: "ambiguous",
		});
		expect(await call(session, "freeSlots", { service: "s1", resource: "zzz" })).toMatchObject({
			status: "none",
		});
	});

	it("refused by the port", async () => {
		const port = new FakeStaffPort();
		port.denied.add("freeSlots");
		expect(await call(await sessionFor(port), "freeSlots", { service: "s1" })).toMatchObject({
			status: "refused",
			reason: "forbidden",
		});
	});
});

describe("packageBalance", () => {
	it("shows sessions left, paid and due", async () => {
		const out = await call(await sessionFor(new FakeStaffPort()), "packageBalance", {
			clientId: "c1",
		});
		expect(out.packages).toEqual([
			{
				id: "k1",
				name: `${FENCE_OPEN}10 sessions${FENCE_CLOSE}`,
				sessionsLeft: 7,
				totalBani: 100000,
				paidBani: 40000,
				dueBani: 60000,
			},
		]);
	});

	it("no packages is an empty list; refusal and missing client", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port);
		expect(await call(session, "packageBalance", { clientId: "c2" })).toMatchObject({
			status: "ok",
			packages: [],
		});
		expect(await call(session, "packageBalance")).toMatchObject({
			reason: "invalid",
		});
		port.denied.add("packages");
		expect(await call(session, "packageBalance", { clientId: "c1" })).toMatchObject({
			reason: "forbidden",
		});
	});
});

describe("roster", () => {
	it("everyone, one person, ambiguity and none", async () => {
		const session = await sessionFor(new FakeStaffPort());
		expect(
			((await call(session, "roster", { from: "2026-11-13", days: 1 })).entries as Array<unknown>)
				.length,
		).toBe(2);
		const one = await call(session, "roster", {
			person: "Dan",
			from: "2026-11-13",
			days: 1,
		});
		expect(one.entries).toEqual([
			{
				personId: "p2",
				date: "2026-11-13",
				kind: "leave",
				fromMin: null,
				toMin: null,
			},
		]);
		expect(await call(session, "roster", { person: "a" })).toMatchObject({
			status: "ambiguous",
		});
		expect(await call(session, "roster", { person: "zzz" })).toMatchObject({
			status: "none",
		});
	});

	it("refused", async () => {
		const port = new FakeStaffPort();
		port.denied.add("roster");
		expect(await call(await sessionFor(port), "roster")).toMatchObject({
			reason: "forbidden",
		});
	});
});

describe("webRequests", () => {
	it("lists unhandled requests with their text fenced, and taints the turn", async () => {
		const session = await sessionFor(new FakeStaffPort());
		const out = await call(session, "webRequests");
		expect(out.requests).toEqual([
			expect.objectContaining({
				id: "w1",
				message: `${FENCE_OPEN}Hello, I would like an appointment.${FENCE_CLOSE}`,
				name: `${FENCE_OPEN}Visitor One${FENCE_CLOSE}`,
			}),
		]);
		expect(session.taint.stranger).toBe(true);
	});

	it("handled requests only when asked; refusal", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port);
		port.data.requests.push({
			...port.requestOf("w1"),
			id: "w2",
			handled: true,
		});
		expect((await call(session, "webRequests")).requests).toHaveLength(1);
		expect((await call(session, "webRequests", { includeHandled: true })).requests).toHaveLength(2);
		port.denied.add("webRequests");
		expect(await call(session, "webRequests")).toMatchObject({
			reason: "forbidden",
		});
	});
});

describe("searchNotes", () => {
	it("finds notes, optionally within a client, fenced", async () => {
		const session = await sessionFor(new FakeStaffPort());
		const out = await call(session, "searchNotes", { text: "sleeps" });
		expect(out.notes).toEqual([
			expect.objectContaining({
				id: "n1",
				text: `${FENCE_OPEN}Session went well; sleeps better.${FENCE_CLOSE}`,
			}),
		]);
		expect((await call(session, "searchNotes", { text: "sleeps", clientId: "c2" })).notes).toEqual(
			[],
		);
		expect((await call(session, "searchNotes", { text: "nothing here" })).notes).toEqual([]);
	});

	it("refused", async () => {
		const port = new FakeStaffPort();
		port.denied.add("searchNotes");
		expect(await call(await sessionFor(port), "searchNotes", { text: "sleeps" })).toMatchObject({
			reason: "forbidden",
		});
	});
});

describe("stats", () => {
	it("today, this week and this month cover the right days", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port);
		expect(await call(session, "stats", { period: "today" })).toMatchObject({
			from: "2026-11-13",
			to: "2026-11-13",
			sessions: 2,
		});
		expect(await call(session, "stats", { period: "week" })).toMatchObject({
			from: "2026-11-09",
			to: "2026-11-15",
		});
		expect(await call(session, "stats", { period: "month" })).toMatchObject({
			from: "2026-11-01",
			to: "2026-11-30",
		});
		expect(session.cards.at(-1)).toMatchObject({ kind: "stats" });
	});

	it("counts no-shows and unpaid", async () => {
		const port = new FakeStaffPort();
		port.data.appointments[0] = {
			...port.appointmentOf("a1"),
			status: "no-show",
		};
		const out = await call(await sessionFor(port), "stats", {
			period: "today",
		});
		expect(out).toMatchObject({
			noShows: 1,
			unpaidClients: 1,
			unpaidBani: 60000,
		});
	});

	it("refused", async () => {
		const port = new FakeStaffPort();
		port.denied.add("stats");
		expect(await call(await sessionFor(port), "stats")).toMatchObject({
			reason: "forbidden",
		});
	});
});

describe("draftReminders", () => {
	it("tomorrow by default: who can be reached how", async () => {
		const session = await sessionFor(new FakeStaffPort());
		const out = await call(session, "draftReminders");
		expect(out).toMatchObject({ date: "2026-11-14" });
		expect(out.targets).toEqual([
			{
				appointmentId: "a3",
				time: "10:00",
				name: `${FENCE_OPEN}Maria Test${FENCE_CLOSE}`,
				canEmail: true,
				canWhatsapp: true,
				sent: false,
			},
		]);
	});

	it("a day with none; refusal", async () => {
		const port = new FakeStaffPort();
		const session = await sessionFor(port);
		expect((await call(session, "draftReminders", { date: "2026-12-24" })).targets).toEqual([]);
		port.denied.add("reminderTargets");
		expect(await call(session, "draftReminders")).toMatchObject({
			reason: "forbidden",
		});
	});
});
