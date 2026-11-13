import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { blankEditor } from "../pages/editor-form";
import { type Console, MEMBER, startConsole } from "./harness";

const SSE = { "content-type": "application/json", "datastar-request": "true" };
const DAY = "2027-02-02";

let owner: Console;
let reception: Console;
beforeAll(async () => {
	owner = await startConsole(
		MEMBER,
		{ today: "2026-11-16" },
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

const editor = (over: Record<string, unknown> = {}) => ({
	...blankEditor({
		date: DAY,
		startMin: 600,
		col: "p1",
		service: { id: "s1", name: "x", durationMin: 50, priceBani: 15000 },
	}),
	client: "c3",
	clientName: "Client",
	...over,
});
const save = (c: Console, over: Record<string, unknown> = {}) =>
	c.post("/calendar/editor/save", JSON.stringify({ ed: editor(over) }), SSE);
const check = (c: Console, over: Record<string, unknown> = {}) =>
	c.post("/calendar/editor/check", JSON.stringify({ ed: editor(over) }), SSE);
const count = async (c: Console): Promise<number> =>
	(await c.port.calendar("psizone", DAY, DAY)).appointments.length;

describe("the editor opens with the client chosen", () => {
	it("?client= on the editor and on the page", async () => {
		const sheet = await (await owner.get(`/calendar/editor?date=${DAY}&client=c3`)).text();
		expect(sheet).toContain('"client":"c3"');
		const page = await (await owner.get(`/calendar?date=${DAY}&new=1&client=c3`)).text();
		expect(page).toContain("client&quot;:&quot;c3");
		const unknown = await (await owner.get(`/calendar/editor?date=${DAY}&client=zz`)).text();
		expect(unknown).toContain('"client":""');
	});
	it("a client's page offers the appointment prefilled with them", async () => {
		const page = await (await owner.get("/clients/c3/appointments")).text();
		expect(page).toContain("client=c3");
	});
});

describe("booking a client on the blacklist", () => {
	it("the editor shows the block and asks for a reason as soon as the client is chosen", async () => {
		const body = await (await check(owner, { client: "c4" })).text();
		expect(body).toContain('data-blacklist-panel="block_online"');
		expect(body).toContain("Poți programa totuși");
		expect(
			(await (await check(owner, { client: "c3" })).text()).includes("data-blacklist-panel"),
		).toBe(false);
	});
	it("a block without a reason writes nothing; with one it books and the override is audited", async () => {
		const before = await count(owner);
		await save(owner, { client: "c4", override: "" });
		expect(await count(owner)).toBe(before);
		await save(owner, { client: "c4", override: "   " });
		expect(await count(owner)).toBe(before);
		await save(owner, { client: "c4", override: "Părintele a clarificat situația" });
		expect(await count(owner)).toBe(before + 1);
		const log = await owner.port.audit("psizone");
		expect(
			log.some((e) => e.action === "blacklist.override" && e.target.includes("clarificat")),
		).toBe(true);
	});
	it("a warning needs its reason too, and an unlisted client needs none", async () => {
		const before = await count(owner);
		await save(owner, { client: "c5", startMin: 700, time: "13:00", override: "" });
		expect(await count(owner)).toBe(before);
		await save(owner, { client: "c5", time: "13:00", override: "Am vorbit la recepție" });
		expect(await count(owner)).toBe(before + 1);
		await save(owner, { client: "c3", time: "15:00" });
		expect(await count(owner)).toBe(before + 2);
	});
	it("a total block is overridden only by an administrator: reception is refused even with a reason", async () => {
		await reception.port.addBlacklist(
			"psizone",
			"c8",
			{ reason: "Grav", category: "abusive", severity: "block_all" },
			{ subject: "s", name: "Ana" },
		);
		const before = await count(reception);
		const body = await (
			await save(reception, { client: "c8", time: "16:00", override: "Vreau" })
		).text();
		expect(await count(reception)).toBe(before);
		expect(body).toContain("nu poți trece peste");
		await save(reception, { client: "c4", time: "16:00", override: "Staff poate" });
		expect(await count(reception)).toBe(before + 1);
	});
	it("changing nothing about the client of an existing appointment is not gated again", async () => {
		const made = (
			await owner.port.createAppointments("psizone", {
				date: DAY,
				startMin: 1000,
				columnId: "p2",
				clientId: "c3",
				serviceId: "s1",
			})
		)[0];
		await owner.port.addBlacklist(
			"psizone",
			"c3",
			{ reason: "După", category: "other", severity: "block_online" },
			{ subject: "s", name: "Ana" },
		);
		const res = await save(owner, {
			id: made?.id ?? "",
			client: "c3",
			col: "p2",
			time: "16:40",
			note: "ajustat",
		});
		expect(await res.text()).not.toContain("Scrie de ce");
		expect((await owner.port.appointment("psizone", made?.id ?? ""))?.note).toBe("ajustat");
	});
});

describe("tiles and details carry the flags", () => {
	it("a blacklisted client's tile has the flag with its words as the tooltip; the detail sheet shows the badge", async () => {
		const made = (
			await owner.port.createAppointments("psizone", {
				date: "2027-03-03",
				startMin: 600,
				columnId: "p1",
				clientId: "c4",
				serviceId: "s1",
			})
		)[0];
		const day = await (await owner.get("/calendar?view=day&date=2027-03-03")).text();
		expect(day).toContain("data-tileflag");
		expect(day).toContain("Listă neagră · Trei absențe");
		const detail = await (
			await owner.get(`/calendar?view=day&date=2027-03-03&appt=${made?.id}`)
		).text();
		expect(detail).toContain("cl-flag--block");
	});
	it("a pinned note shows on the tile and in the detail; a clinical one only for who may read it", async () => {
		const made = (
			await owner.port.createAppointments("psizone", {
				date: "2027-03-04",
				startMin: 600,
				columnId: "p1",
				clientId: "c1",
				serviceId: "s1",
			})
		)[0];
		const day = await (await owner.get("/calendar?view=day&date=2027-03-04")).text();
		expect(day).toContain("Părintele preferă mesaje");
		const detail = await (
			await owner.get(`/calendar?view=day&date=2027-03-04&appt=${made?.id}`)
		).text();
		expect(detail).toContain("data-pinned-note");
		await owner.port.updateNote("psizone", "n1", { category: "clinical" });
		const hidden = await (await reception.get("/calendar?view=day&date=2027-03-04")).text();
		expect(hidden).not.toContain("Părintele preferă mesaje");
	});
	it("a screen reader gets the same words as the tooltip", async () => {
		const day = await (await owner.get("/calendar?view=day&date=2027-03-03")).text();
		expect(day).toMatch(/class="adm-sr">Listă neagră · Trei absențe/);
	});
});

describe("services that need a room of their kind", () => {
	const neuro = "s3";
	it("the editor offers the neuro room by default for neurofeedback and groups the rooms by category", async () => {
		const sheet = await (await owner.get(`/calendar/editor?date=${DAY}`)).text();
		expect(sheet).toMatch(
			/value="s3"[^>]*data-room="mapping-cerebral"|data-room="[a-z-]+"[^>]*value="s3"|value="s3" data-room/,
		);
		expect(sheet).toContain("<optgroup");
		expect(sheet).toContain("Neuroevaluare și neurofeedback");
	});
	it("neurofeedback in a therapy room, or in no room, is refused and writes nothing; in a neuro room it books", async () => {
		const before = await count(owner);
		await save(owner, { client: "c9", svc: neuro, room: "cabinet-1", time: "09:00" });
		await save(owner, { client: "c9", svc: neuro, room: "", time: "09:00" });
		expect(await count(owner)).toBe(before);
		await save(owner, {
			client: "c9",
			svc: neuro,
			room: "neurofeedback-1",
			time: "09:00",
			col: "p3",
		});
		expect(await count(owner)).toBe(before + 1);
	});
	it("a service without a category goes in any room", async () => {
		const before = await count(owner);
		await save(owner, { client: "c9", svc: "s1", room: "cabinet-1", time: "11:30", col: "p3" });
		expect(await count(owner)).toBe(before + 1);
	});
});
