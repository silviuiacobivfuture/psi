import { MAX_IDS } from "@psi/scheduling-sdk/contract";
import { beforeAll, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";
import { scaleUp } from "./testing/scale";
import { HOUR, NOW } from "./testing/world";

/**
 * calendar.get with `ids`: only the columns named, each with exactly the visits the whole calendar shows in it (a group
 * session under the person who leads it), for the caller's reach; an id the caller cannot see answers nothing of it; a
 * malformed, empty or too long list is refused. Without `ids` the answer is as before.
 */
const A = "/v1/apps/psizone";
const DAY = 24 * HOUR;
const from = NOW - 3 * DAY;
const to = NOW + 4 * DAY;

type Calendar = {
	columns: { id: string; name: string; appointments: { id: string }[] }[];
	others?: { id: string; name: string }[];
};

describe("calendar.get for a few columns", () => {
	let w: Populated;
	let group: string;
	const get = async (who: string, query: string) => {
		const res = await w.call(who, "GET", `${A}/calendar?from=${from}&to=${to}${query}`);
		return { status: res.status, json: res.json as Calendar & { error?: { code: string } } };
	};
	const calendar = async (who: string, query: string): Promise<Calendar> => {
		const res = await get(who, query);
		expect(res.status, JSON.stringify(res.json)).toBe(200);
		return res.json;
	};

	beforeAll(async () => {
		w = await createWorld();
		await scaleUp(w, 1);
		const made = await w.call("olga", "POST", `${A}/appointments`, {
			kind: "group",
			groupId: w.ids.group,
			practitionerId: w.ids.dora,
			start: NOW + 3 * HOUR + 7 * 60_000,
			end: NOW + 4 * HOUR,
		});
		expect(made.status, JSON.stringify(made.json)).toBe(200);
		group = String(made.json.id);
	}, 120_000);

	it("many visits: each column named is the whole calendar's column, nothing else", async () => {
		for (const who of ["olga", "rita"]) {
			const whole = await calendar(who, "&columns=person");
			expect(whole.columns.length).toBeGreaterThan(2);
			const pick = [w.ids.dora, w.ids.elena];
			const some = await calendar(who, `&columns=person&ids=${pick.join(",")}`);
			expect(some.columns.map((c) => c.id).sort()).toEqual([...pick].sort());
			for (const c of some.columns) {
				expect(c, who).toEqual(whole.columns.find((x) => x.id === c.id));
				expect(c.appointments.length).toBeGreaterThan(0);
			}
		}
	});

	it("names the caller's other columns, without their visits, only when the answer is narrowed", async () => {
		const whole = await calendar("olga", "");
		expect(whole.others).toBeUndefined();
		const one = await calendar("olga", `&ids=${w.ids.dora}`);
		expect(one.others).toEqual(
			whole.columns.filter((c) => c.id !== w.ids.dora).map((c) => ({ id: c.id, name: c.name })),
		);
		const none = await calendar("olga", "&ids=nosuchperson000000000000000000");
		expect(none.others?.map((o) => o.id)).toEqual(whole.columns.map((c) => c.id));
	});

	it("first: the first columns in name order, the rest named", async () => {
		const whole = await calendar("olga", "");
		for (const n of [1, 2, MAX_IDS]) {
			const got = await calendar("olga", `&first=${n}`);
			expect(got.columns).toEqual(whole.columns.slice(0, n));
			expect(got.others?.map((o) => o.id)).toEqual(whole.columns.slice(n).map((c) => c.id));
		}
		const own = await calendar("dora", "&first=1");
		expect(own.columns.map((c) => c.id)).toEqual([w.ids.dora]);
		expect(own.others).toEqual([]);
	});

	it("one person: their own visits and the group session they lead", async () => {
		const one = await calendar("olga", `&ids=${w.ids.dora}`);
		expect(one.columns.map((c) => c.id)).toEqual([w.ids.dora]);
		const visits = one.columns[0]?.appointments.map((a) => a.id) ?? [];
		expect(visits).toContain(w.ids.a1);
		expect(visits).toContain(group);
		expect(visits).not.toContain(w.ids.a2);
	});

	it("a room's and a device's columns, by id", async () => {
		for (const [kind, id] of [
			["room", w.ids.room],
			["device", w.ids.device],
		] as const) {
			const whole = await calendar("olga", `&columns=${kind}`);
			const one = await calendar("olga", `&columns=${kind}&ids=${id}`);
			expect(one.columns).toEqual(whole.columns.filter((c) => c.id === id));
		}
		const room = await calendar("olga", `&columns=room&ids=${w.ids.room}`);
		expect(room.columns[0]?.appointments.map((a) => a.id)).toContain(w.ids.a1);
	});

	it("a repeated id is one column, in name order like the whole calendar", async () => {
		const both = await calendar("olga", `&ids=${w.ids.elena},${w.ids.dora},${w.ids.elena}`);
		const whole = await calendar("olga", "");
		expect(both.columns.map((c) => c.id)).toEqual(
			whole.columns.map((c) => c.id).filter((id) => id === w.ids.dora || id === w.ids.elena),
		);
	});

	it("an id that names no column, or one of another kind, answers no column", async () => {
		expect((await calendar("olga", "&ids=nosuchperson000000000000000000")).columns).toEqual([]);
		expect((await calendar("olga", `&columns=room&ids=${w.ids.dora}`)).columns).toEqual([]);
		expect((await calendar("olga", `&columns=person&ids=${w.ids.room}`)).columns).toEqual([]);
	});

	it("a calendar outside the caller's reach answers nothing of it, not even its visits", async () => {
		const own = await calendar("dora", `&ids=${w.ids.dora},${w.ids.elena}`);
		expect(own.columns.map((c) => c.id)).toEqual([w.ids.dora]);
		expect(JSON.stringify(own)).not.toContain(w.ids.a2);
		expect((await calendar("dora", `&ids=${w.ids.elena}`)).columns).toEqual([]);
	});

	it.each([
		["empty", "&ids="],
		["only commas", "&ids=,,"],
		["malformed", "&ids=not%20an%20id!"],
		[
			"too many",
			`&ids=${Array.from({ length: MAX_IDS + 1 }, (_, i) => `p${String(i).padStart(10, "0")}`).join(",")}`,
		],
		["first 0", "&first=0"],
		["first past MAX_IDS", `&first=${MAX_IDS + 1}`],
		["first not a number", "&first=two"],
		["both ids and first", `&ids=${"p".padEnd(12, "0")}&first=1`],
	])("refuses %s", async (_, query) => {
		const res = await get("olga", query);
		expect(res.status).toBe(400);
		expect(res.json.columns).toBeUndefined();
	});

	it("refuses a caller who may not see calendars, with or without ids", async () => {
		for (const query of ["", `&ids=${w.ids.dora}`])
			expect((await get("vera", query)).status).toBe(403);
	});
});
