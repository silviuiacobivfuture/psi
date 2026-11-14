import { afterEach, describe, expect, it } from "vitest";
import { addDays, todayIso } from "../lib/dates";
import { refusalText } from "../lib/failures";
import { localStamp } from "../pages/online-editor";
import { PortError } from "../port/port";
import { consoleAs, fieldsOf, formHtml, send, textOf, withFields } from "./availability-kit";
import type { Console } from "./harness";

/**
 * Setări → Programări online on the fake clinic: the list with each pause's state, making one (now or for a window,
 * read in the clinic's zone), changing and lifting it, every refusal reason in Romanian with nothing kept, the default
 * words, and the console-wide notice while a pause is in force.
 */
let c: Console;
afterEach(async () => {
	await c?.close();
});

const ZONE = "Europe/Bucharest";
const pauses = async () => (await c.port.bookingPauses("psizone")).items;
const editorFields = async (path = "/settings/online?new=1"): Promise<Array<[string, string]>> =>
	fieldsOf(formHtml(await (await c.get(path)).text(), "/settings/online/pauses"));
const stampIn = (hours: number): string => localStamp(Date.now() + hours * 3_600_000, ZONE);

describe("making a pause", () => {
	it("stops the whole organisation now, with the default words, callbacks open and staff still booking", async () => {
		c = await consoleAs(["owner"]);
		const fields = await editorFields();
		expect(fields).toContainEqual(["level", "organisation"]);
		expect(fields).toContainEqual(["when", "now"]);
		expect(fields).toContainEqual(["callbacksOpen", "1"]);
		expect(fields.find(([k]) => k === "messageRo")?.[1]).toBe(
			"Programările online sunt oprite temporar. Ne puteți suna sau lăsa o cerere de revenire și vă contactăm noi.",
		);
		const res = await send(c, "/settings/online/pauses", fields);
		const html = await res.text();
		expect(textOf(html)).toContain("Programările online au fost oprite.");
		const [made] = await pauses();
		expect(made).toMatchObject({
			scope: { level: "organisation" },
			state: "active",
			defaultMessage: true,
			callbacksOpen: true,
			blockStaff: false,
		});
		expect(made?.from).toBeUndefined();
		expect(html).toContain(`data-pause="${made?.id}"`);
		expect(textOf(html)).toContain("activă");
		expect((await c.port.audit("psizone")).some((e) => e.action === "booking_pause.create")).toBe(
			true,
		);
	});

	it("stops one service for a window read in the clinic's zone, with its own words and staff blocked", async () => {
		c = await consoleAs(["owner"]);
		const from = `${addDays(todayIso(), 3)}T10:00`;
		const until = `${addDays(todayIso(), 4)}T18:30`;
		await send(
			c,
			"/settings/online/pauses",
			withFields(await editorFields(), {
				level: "service",
				service: "s2",
				when: "window",
				from,
				until,
				messageRo: "Evaluările sunt suspendate o zi.",
				messageEn: "Assessments are paused for a day.",
				callbacksOpen: null,
				blockStaff: "1",
			}),
		);
		const [made] = await pauses();
		expect(made).toMatchObject({
			scope: { level: "service", service: "s2" },
			state: "scheduled",
			defaultMessage: false,
			message: { ro: "Evaluările sunt suspendate o zi.", en: "Assessments are paused for a day." },
			callbacksOpen: false,
			blockStaff: true,
		});
		expect(localStamp(made?.from ?? 0, ZONE)).toBe(from);
		expect(localStamp(made?.until ?? 0, ZONE)).toBe(until);
		const html = await (await c.get("/settings/online")).text();
		expect(textOf(html)).toContain("programată");
		expect(textOf(html)).toContain("Serviciul Evaluare");
	});

	it("reads a time of the autumn change as its first occurrence", async () => {
		c = await consoleAs(["owner"]);
		await send(
			c,
			"/settings/online/pauses",
			withFields(await editorFields(), {
				when: "window",
				from: "2027-10-31T03:30",
				until: "2027-10-31T05:00",
			}),
		);
		const [made] = await pauses();
		// 03:30 happens twice on 31 October 2027 in Bucharest: the first is 00:30 UTC (still summer time).
		expect(made?.from).toBe(Date.UTC(2027, 9, 31, 0, 30));
	});
});

describe("every refusal of a pause, in Romanian, nothing kept", () => {
	const cases: ReadonlyArray<{
		name: string;
		changes: () => Record<string, string | null>;
		text: string;
	}> = [
		{
			name: "until_before_from",
			changes: () => ({ when: "window", from: stampIn(48), until: stampIn(24) }),
			text: "Sfârșitul trebuie să fie după început.",
		},
		{
			name: "until_past",
			changes: () => ({ when: "window", from: stampIn(-48), until: stampIn(-24) }),
			text: "Sfârșitul trebuie să fie în viitor.",
		},
		{
			name: "unknown_site",
			changes: () => ({ level: "site", site: "bogus-web" }),
			text: "Site-ul ales nu face programări în această organizație.",
		},
		{
			name: "unknown_service",
			changes: () => ({ level: "service", service: "nope" }),
			text: "Serviciul ales nu există.",
		},
		{
			name: "unknown_practitioner",
			changes: () => ({ level: "practitioner", practitioner: "nobody" }),
			text: "Terapeutul ales nu există.",
		},
		{
			name: "no target chosen",
			changes: () => ({ level: "practitioner", practitioner: "" }),
			text: "Alege site-ul, serviciul sau terapeutul pe care îl oprești.",
		},
		{
			name: "a window without its start",
			changes: () => ({ when: "window", from: "" }),
			text: "Completează data și ora de început a intervalului.",
		},
		{
			name: "a start the spring change skips",
			changes: () => ({ when: "window", from: "2027-03-28T03:30" }),
			text: "Ora aceasta nu există în ziua aleasă",
		},
	];
	it.each(cases)("$name", async ({ changes, text }) => {
		c = await consoleAs(["owner"]);
		const res = await send(
			c,
			"/settings/online/pauses",
			withFields(await editorFields(), changes()),
		);
		expect(res.status).toBe(400);
		const html = await res.text();
		expect(textOf(formHtml(html, "/settings/online/pauses"))).toContain(text);
		expect(await pauses()).toEqual([]);
	});

	it("too_many: the 51st pause", async () => {
		c = await consoleAs(["owner"]);
		for (let i = 0; i < 50; i += 1)
			await c.port.createPause("psizone", {
				scope: { level: "organisation" },
				from: Date.now() + 86_400_000,
				callbacksOpen: true,
				blockStaff: false,
			});
		const res = await send(c, "/settings/online/pauses", await editorFields());
		expect(res.status).toBe(400);
		expect(textOf(await res.text())).toContain("Sunt prea multe opriri păstrate (cel mult 50)");
		expect(await pauses()).toHaveLength(50);
	});
});

describe("changing and lifting a pause", () => {
	it("changes its window and keeps the default words a person left alone", async () => {
		c = await consoleAs(["owner"]);
		await send(c, "/settings/online/pauses", await editorFields());
		const [made] = await pauses();
		const id = made?.id ?? "";
		const action = `/settings/online/pauses/${id}`;
		const shown = await (await c.get(`/settings/online?edit=${id}`)).text();
		const fields = fieldsOf(formHtml(shown, action));
		const until = `${addDays(todayIso(), 2)}T09:00`;
		const res = await send(c, action, withFields(fields, { until, callbacksOpen: null }));
		expect(textOf(await res.text())).toContain("Oprirea a fost modificată.");
		const [changed] = await pauses();
		expect(changed).toMatchObject({ id, defaultMessage: true, callbacksOpen: false });
		expect(changed?.message.ro).toBe(
			"Programările online sunt oprite temporar. Pentru o programare, vă rugăm să ne sunați.",
		);
		expect(localStamp(changed?.until ?? 0, ZONE)).toBe(until);
	});

	it("refuses a change in words and keeps the pause as it was", async () => {
		c = await consoleAs(["owner"]);
		await send(c, "/settings/online/pauses", await editorFields());
		const [made] = await pauses();
		const action = `/settings/online/pauses/${made?.id}`;
		const fields = fieldsOf(
			formHtml(await (await c.get(`/settings/online?edit=${made?.id}`)).text(), action),
		);
		const res = await send(c, action, withFields(fields, { level: "service", service: "nope" }));
		expect(res.status).toBe(400);
		expect(textOf(await res.text())).toContain("Serviciul ales nu există.");
		expect(await pauses()).toEqual([made]);
	});

	it("lifts it: booking opens again and the notice goes", async () => {
		c = await consoleAs(["owner"]);
		await send(c, "/settings/online/pauses", await editorFields());
		const [made] = await pauses();
		expect(await (await c.get("/calendar")).text()).toContain("data-pause-banner");
		const res = await send(c, `/settings/online/pauses/${made?.id}/remove`, []);
		expect(textOf(await res.text())).toContain("Oprirea a fost ridicată.");
		expect(await pauses()).toEqual([]);
		expect(await (await c.get("/calendar")).text()).not.toContain("data-pause-banner");
		expect((await send(c, `/settings/online/pauses/${made?.id}/remove`, [])).status).toBe(404);
	});
});

describe("the notice on every screen", () => {
	it("is absent with no pause, and with a pause that has not started", async () => {
		c = await consoleAs(["owner"]);
		expect(await (await c.get("/calendar")).text()).not.toContain("data-pause-banner");
		await c.port.createPause("psizone", {
			scope: { level: "organisation" },
			from: Date.now() + 86_400_000,
			callbacksOpen: true,
			blockStaff: false,
		});
		expect(await (await c.get("/clients")).text()).not.toContain("data-pause-banner");
	});

	it("says whether staff can still book, and links the editors to the page", async () => {
		c = await consoleAs(["owner"]);
		await c.port.createPause("psizone", {
			scope: { level: "organisation" },
			callbacksOpen: true,
			blockStaff: false,
		});
		const free = await (await c.get("/clients")).text();
		const notice = free.slice(
			free.indexOf("data-pause-banner"),
			free.indexOf("</div>", free.indexOf("data-pause-banner")) + 200,
		);
		expect(textOf(notice)).toContain("Programările online sunt oprite pentru toată organizația.");
		expect(textOf(notice)).toContain("Personalul poate programa în continuare din consolă.");
		expect(notice).toContain('href="/settings/online"');
		await c.port.createPause("psizone", {
			scope: { level: "practitioner", practitionerId: "p1" },
			callbacksOpen: true,
			blockStaff: true,
		});
		const blocked = await (await c.get("/calendar")).text();
		expect(blocked).toContain('data-staff-blocked="true"');
		expect(textOf(blocked)).toContain("Și programările personalului sunt oprite.");
	});

	it("is shown to reception too, without the way to change it", async () => {
		c = await consoleAs(["reception"]);
		await c.port.createPause("psizone", {
			scope: { level: "service", service: "s1" },
			callbacksOpen: true,
			blockStaff: false,
		});
		const html = await (await c.get("/calendar")).text();
		expect(html).toContain("data-pause-banner");
		expect(textOf(html)).toContain(
			"Programările online sunt oprite pentru o parte din servicii sau terapeuți.",
		);
		const notice = html.slice(html.indexOf("data-pause-banner"));
		expect(notice.slice(0, notice.indexOf("</div></div>"))).not.toContain(
			'href="/settings/online"',
		);
	});

	it("does not fail the page when the pauses cannot be read", async () => {
		c = await consoleAs(["owner"]);
		await c.close();
		const { startConsole, MEMBER } = await import("./harness");
		c = await startConsole(MEMBER, { today: "2026-11-16", failing: new Set(["bookingPauses"]) });
		await c.signIn();
		const res = await c.get("/calendar");
		expect(res.status).toBe(200);
		expect(await res.text()).not.toContain("data-pause-banner");
	});
});

describe("a staff booking a pause blocks", () => {
	it("is refused with its own words, not the taken-time ones", async () => {
		c = await consoleAs(["owner"]);
		await c.port.createPause("psizone", {
			scope: { level: "practitioner", practitionerId: "p1" },
			callbacksOpen: true,
			blockStaff: true,
		});
		const error = await c.port
			.createAppointments("psizone", {
				date: addDays(todayIso(), 7),
				startMin: 600,
				durationMin: 50,
				columnId: "p1",
				clientId: "c1",
				serviceId: "s1",
				resourceIds: [],
				packageId: null,
				priceBani: 0,
				remind: false,
				recurrence: null,
				note: "",
			})
			.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(PortError);
		expect(refusalText(error, "ro")).toBe(
			"Programările sunt oprite acum pentru acest serviciu sau terapeut, inclusiv cele făcute de personal. Le poți reporni din Setări → Programări online.",
		);
		const other = await c.port.createAppointments("psizone", {
			date: addDays(todayIso(), 7),
			startMin: 600,
			durationMin: 50,
			columnId: "p2",
			clientId: "c1",
			serviceId: "s1",
			resourceIds: [],
			packageId: null,
			priceBani: 0,
			remind: false,
			recurrence: null,
			note: "",
		});
		expect(other).toHaveLength(1);
	});
});
