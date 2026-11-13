import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createSchedulingClient } from "../client";
import type { SchedulingConfig } from "../config";
import { toLocal } from "../domain/time";
import { createStaffSchedulingClient } from "../staff-client";
import { CONVEX_DATA, CONVEX_URL } from "./backend";

/**
 * Rooms, alternating weeks, period schedules and contractors against the real local backend, in
 * a throwaway `test-rooms-…` tenant that starts empty (dropped afterwards).
 */
const PKG = resolve(import.meta.dirname, "../..");
const KEY_FILE = join(CONVEX_DATA, "secrets/server-key");
const URL = CONVEX_URL;
const reachable = await fetch(`${URL}/version`, { signal: AbortSignal.timeout(2_000) })
	.then((r) => r.ok)
	.catch(() => false);
const ready = reachable && existsSync(KEY_FILE) && existsSync(join(dirname(KEY_FILE), "admin-key"));
if (!ready) console.warn(`staff-rooms.test: no local backend at ${URL}`);

const TENANT = `test-rooms-${Date.now().toString(36)}`;
const DAY = 86_400_000;
const actor = { subject: "cms:test-rooms" };
const ZONE = "Europe/Bucharest";
const config = (): SchedulingConfig => ({
	url: URL,
	serverKey: ready ? readFileSync(KEY_FILE, "utf8").trim() : "",
	timeoutMs: 10_000,
});
const dateOf = (t: number): string => toLocal(t, ZONE).date;
const weekday = (d: string): number => new Date(`${d}T00:00:00Z`).getUTCDay() || 7;
const nextMonday = (): string => {
	let d = dateOf(Date.now() + 2 * DAY);
	while (weekday(d) !== 1) d = dateOf(Date.parse(`${d}T12:00:00Z`) + DAY);
	return d;
};

describe.skipIf(!ready)("rooms, schedules and contractors on the local Convex", () => {
	const staff = createStaffSchedulingClient(config());
	const visitor = createSchedulingClient(config());
	const ids: Record<string, string> = {};
	const slots = async (mode?: "onsite" | "online", days = 10) => {
		const now = Date.now();
		const r = await visitor.findSlots({
			tenant: TENANT,
			service: "evaluation",
			from: now,
			to: now + days * DAY,
			...(mode === undefined ? {} : { mode }),
		});
		if (!r.ok) throw new Error(r.reason);
		return r.slots;
	};

	afterAll(() => {
		execFileSync(
			join(PKG, "scripts/convex.sh"),
			["run", "seed:dropFixture", JSON.stringify({ tenant: TENANT })],
			{
				cwd: PKG,
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
	});

	it("sets up two rooms, three people (one a contractor) and a service that needs a therapy room", async () => {
		for (const [slug, name, external] of [
			["ana", "Ana", false],
			["dan", "Dan", false],
			["eva", "Eva (colaborator)", true],
		] as const) {
			const r = await staff.createPractitioner({
				tenant: TENANT,
				slug,
				displayName: name,
				external,
				actor,
			});
			if (!r.ok) throw new Error(r.reason);
			ids[slug] = r.id;
		}
		for (const [slug, name] of [
			["terapie-1", "Terapie 1"],
			["terapie-2", "Terapie 2"],
		] as const) {
			const r = await staff.createRoom({
				tenant: TENANT,
				room: {
					slug,
					name,
					kind: "therapy",
					capacity: 2,
					suits: ["child", "adult"],
					equipment: [],
				},
				actor,
			});
			if (!r.ok) throw new Error(r.reason);
			ids[slug] = r.id;
		}
		expect(
			await staff.createRoom({
				tenant: TENANT,
				room: {
					slug: "terapie-1",
					name: "Altceva",
					kind: "therapy",
					capacity: 2,
					suits: ["adult"],
					equipment: [],
				},
				actor,
			}),
		).toEqual({ ok: false, reason: "exists" });
		for (const bad of [
			{ kind: "spa" },
			{ capacity: 0 },
			{ suits: [] },
			{ equipment: ["Not A Tag"] },
			{ name: " " },
		]) {
			expect(
				await staff.createRoom({
					tenant: TENANT,
					room: {
						slug: "x-room",
						name: "X",
						kind: "therapy",
						capacity: 1,
						suits: ["adult"],
						equipment: [],
						...bad,
					},
					actor,
				}),
			).toEqual({ ok: false, reason: "invalid" });
		}
		const made = await staff.createService({
			tenant: TENANT,
			service: {
				slug: "evaluation",
				name: { ro: "Evaluare", en: "Assessment" },
				durationMinutes: 60,
				bufferMinutes: 0,
				stepMinutes: 60,
				minNoticeMinutes: 0,
				horizonDays: 60,
				holdMinutes: 10,
				modes: ["onsite", "online"],
				practitioners: [ids.ana ?? "", ids.dan ?? "", ids.eva ?? ""],
				roomKind: "therapy",
			},
			actor,
		});
		expect(made.ok).toBe(true);
		for (const p of ["ana", "dan", "eva"]) {
			await staff.setDayRules({
				tenant: TENANT,
				practitioner: ids[p] ?? "",
				weekdays: [1, 2, 3, 4, 5, 6, 7],
				windows: [{ start: 600, end: 720, modes: ["onsite", "online"] }],
				actor,
			});
		}
		const c = await staff.catalog({ tenant: TENANT });
		if (!c.ok) throw new Error(c.reason);
		expect(c.practitioners.find((p) => p.slug === "eva")?.external).toBe(true);
		expect(c.practitioners.find((p) => p.slug === "ana")?.external).toBeUndefined();
		expect(c.services[0]?.roomKind).toBe("therapy");
	});

	it("never shows a visitor anything of a contractor beyond the public name", async () => {
		const s = await slots();
		expect(s.length).toBeGreaterThan(0);
		for (const slot of s)
			expect(Object.keys(slot).sort()).toEqual([
				"end",
				"id",
				"modes",
				"practitioner",
				"practitionerName",
				"start",
			]);
		expect(s.some((x) => x.practitionerName === "Eva (colaborator)")).toBe(true);
	});

	it("gives each onsite hold its own room and refuses the third at the same time", async () => {
		const s = (await slots("onsite")).filter((x) => x.practitionerName !== "");
		const t = s[0]?.start ?? 0;
		const same = s.filter((x) => x.start === t);
		expect(same).toHaveLength(3);
		const hold = (practitioner: string, mode: "onsite" | "online") =>
			visitor.hold({
				tenant: TENANT,
				service: "evaluation",
				practitioner,
				start: t,
				mode,
				locale: "ro",
				channel: "form",
			});
		expect((await hold(same[0]?.practitioner ?? "", "onsite")).ok).toBe(true);
		expect((await hold(same[1]?.practitioner ?? "", "onsite")).ok).toBe(true);
		expect(await hold(same[2]?.practitioner ?? "", "onsite")).toEqual({
			ok: false,
			reason: "slot_taken",
		});
		// the third person's onsite slot is gone for visitors, the online one stays
		const third = (await slots()).find(
			(x) => x.start === t && x.practitioner === same[2]?.practitioner,
		);
		expect(third?.modes).toEqual(["online"]);
		expect((await hold(same[2]?.practitioner ?? "", "online")).ok).toBe(true);
	});

	it("takes a room out of use, whole dates or part of one, and honours a person's allowed rooms", async () => {
		const day = dateOf(
			(await slots("onsite", 20)).find((x) => x.start > Date.now() + 3 * DAY)?.start ?? 0,
		);
		const bad = [
			{ from: "x", to: day },
			{ from: day, to: "2000-01-01" },
			{ from: day, to: day, start: 600 },
			{ from: day, to: dateOf(Date.parse(`${day}T12:00:00Z`) + 70 * DAY) },
		];
		for (const b of bad) {
			expect(
				await staff.addRoomClosure({ tenant: TENANT, room: ids["terapie-1"] ?? "", ...b, actor }),
			).toMatchObject({ ok: false });
		}
		expect(
			await staff.addRoomClosure({ tenant: TENANT, room: "nope", from: day, to: day, actor }),
		).toEqual({ ok: false, reason: "not_found" });
		for (const r of ["terapie-1", "terapie-2"]) {
			expect(
				await staff.addRoomClosure({
					tenant: TENANT,
					room: ids[r] ?? "",
					from: day,
					to: day,
					actor,
				}),
			).toEqual({ ok: true, added: 1 });
		}
		expect(
			await staff.addRoomClosure({
				tenant: TENANT,
				room: ids["terapie-1"] ?? "",
				from: day,
				to: day,
				actor,
			}),
		).toEqual({ ok: true, added: 0 });
		const after = await slots("onsite", 20);
		expect(after.some((x) => dateOf(x.start) === day)).toBe(false);
		expect((await slots("online", 20)).some((x) => dateOf(x.start) === day)).toBe(true);
		const list = await staff.rooms({ tenant: TENANT, fromDate: day });
		if (!list.ok) throw new Error("rooms");
		for (const room of list.rooms) {
			for (const c of room.closures)
				await staff.removeRoomClosure({ tenant: TENANT, closure: c.id, actor });
		}
		expect((await slots("onsite", 20)).some((x) => dateOf(x.start) === day)).toBe(true);
		// Eva may use only room 2, which is out of use for an hour: her onsite slot goes then
		expect(
			await staff.updatePractitioner({
				tenant: TENANT,
				practitioner: ids.eva ?? "",
				patch: { rooms: [ids["terapie-2"] ?? ""] },
				actor,
			}),
		).toMatchObject({ ok: true });
		expect(
			await staff.updatePractitioner({
				tenant: TENANT,
				practitioner: ids.eva ?? "",
				patch: { rooms: ["bad"] },
				actor,
			}),
		).toEqual({ ok: false, reason: "invalid" });
	});

	it("alternates weeks A and B, and a period schedule replaces the regular week and can be removed", async () => {
		const ana = ids.ana ?? "";
		const monday = nextMonday();
		expect(
			await staff.setDayRules({
				tenant: TENANT,
				practitioner: ana,
				weekdays: [1],
				windows: [],
				week: "A",
				actor,
			}),
		).toEqual({ ok: false, reason: "invalid" });
		expect(
			await staff.setAlternating({
				tenant: TENANT,
				practitioner: ana,
				anchor: "2026-11-11",
				actor,
			}),
		).toEqual({ ok: false, reason: "invalid" });
		expect(
			await staff.setAlternating({ tenant: TENANT, practitioner: ana, anchor: monday, actor }),
		).toEqual({ ok: true });
		// Week B has no Tuesday hours; week A keeps them.
		expect(
			await staff.setDayRules({
				tenant: TENANT,
				practitioner: ana,
				weekdays: [2],
				windows: [],
				week: "B",
				actor,
			}),
		).toMatchObject({ ok: true, removed: 1 });
		const anaDays = async () => {
			const found = (await slots(undefined, 21)).filter((x) => x.practitioner === ana);
			return new Set(found.map((x) => dateOf(x.start)));
		};
		const tuesdayA = dateOf(Date.parse(`${monday}T12:00:00Z`) + DAY);
		const tuesdayB = dateOf(Date.parse(`${monday}T12:00:00Z`) + 8 * DAY);
		const days = await anaDays();
		expect(days.has(tuesdayB)).toBe(false);
		if (Date.parse(`${tuesdayA}T00:00:00Z`) > Date.now()) expect(days.has(tuesdayA)).toBe(true);
		// A period replacing the week: Wednesdays only, 14:00-15:00, for two weeks from monday
		const until = dateOf(Date.parse(`${monday}T12:00:00Z`) + 13 * DAY);
		expect(
			await staff.setPeriod({
				tenant: TENANT,
				practitioner: ana,
				from: monday,
				until,
				days: [],
				actor,
			}),
		).toEqual({ ok: false, reason: "invalid" });
		const period = {
			tenant: TENANT,
			practitioner: ana,
			from: monday,
			until,
			days: [{ weekday: 3, windows: [{ start: 840, end: 900, modes: ["online" as const] }] }],
			actor,
		};
		expect(await staff.setPeriod(period)).toMatchObject({ ok: true, added: 1 });
		expect(await staff.setPeriod(period)).toEqual({ ok: true, added: 0, removed: 0 });
		const inPeriod = [...(await anaDays())].filter((d) => d >= monday && d <= until);
		expect(inPeriod.every((d) => weekday(d) === 3)).toBe(true);
		expect(
			await staff.removePeriod({ tenant: TENANT, practitioner: ana, from: monday, actor }),
		).toEqual({ ok: true, removed: 1 });
		expect(
			await staff.removePeriod({ tenant: TENANT, practitioner: ana, from: monday, actor }),
		).toEqual({ ok: false, reason: "not_found" });
		// turning alternation off keeps week A, drops week B
		expect(
			await staff.setAlternating({ tenant: TENANT, practitioner: ana, anchor: null, actor }),
		).toEqual({ ok: true });
		const a = await staff.availability({
			tenant: TENANT,
			practitioner: ana,
			fromDate: "2020-01-01",
		});
		expect(a.ok && a.rules.every((r) => r.week === undefined)).toBe(true);
	});

	it("gives the staff calendar the real hours, bookings with their rooms, and nothing personal", async () => {
		const from = dateOf(Date.now());
		const board = await staff.board({ tenant: TENANT, fromDate: from, days: 7 });
		if (!board.ok) throw new Error(board.reason);
		expect(board.hours.length).toBeGreaterThan(0);
		expect(board.appointments.length).toBeGreaterThanOrEqual(3);
		expect(board.appointments.some((a) => a.roomId !== undefined)).toBe(true);
		expect(await staff.board({ tenant: TENANT, fromDate: from, days: 15 })).toEqual({
			ok: false,
			reason: "invalid",
		});
		expect(await staff.board({ tenant: "test-rooms-nobody", fromDate: from, days: 7 })).toEqual({
			ok: false,
			reason: "unknown_tenant",
		});
	});
});
