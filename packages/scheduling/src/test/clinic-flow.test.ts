import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createSchedulingClient } from "../client";
import type { SchedulingConfig } from "../config";
import { createStaffSchedulingClient } from "../staff-client";
import { backendReady, runMutation } from "./admin";
import { CONVEX_DATA, CONVEX_URL } from "./backend";

/**
 * The team's own visits and the public booking flow share one calendar: a visit takes the
 * practitioner's time and the room, the public flow can no longer offer or hold them, and a visit
 * cannot be made over a time the public flow already holds. Against the local backend, in a
 * throwaway `test-flow-…` tenant. Skipped, with a warning, when none is up.
 */
const KEY_FILE = join(CONVEX_DATA, "secrets/server-key");
const ready =
	backendReady && existsSync(KEY_FILE) && existsSync(join(dirname(KEY_FILE), "admin-key"));
if (!ready) console.warn("clinic-flow.test: no local backend; see README");

const TENANT = `test-flow-${Date.now().toString(36)}`;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const actor = { subject: "cms:test-flow" };
const config = (): SchedulingConfig => ({
	url: CONVEX_URL,
	serverKey: ready ? readFileSync(KEY_FILE, "utf8").trim() : "",
	timeoutMs: 10_000,
});
const created = z.object({
	ok: z.boolean(),
	id: z.string().optional(),
	reason: z.string().optional(),
});

describe.skipIf(!ready)("staff visits and the public flow on one calendar", () => {
	const staff = createStaffSchedulingClient(config());
	const visitor = createSchedulingClient(config());
	const ids: Record<string, string> = {};

	const slots = async (mode?: "onsite" | "online") => {
		const now = Date.now();
		const r = await visitor.findSlots({
			tenant: TENANT,
			service: "evaluation",
			from: now + DAY,
			to: now + 6 * DAY,
			...(mode === undefined ? {} : { mode }),
		});
		if (!r.ok) throw new Error(r.reason);
		return r.slots;
	};
	const visit = (practitioner: string, start: number, over: Record<string, unknown> = {}) =>
		runMutation(
			"clinicVisits:create",
			{
				tenant: TENANT,
				practitioner,
				start,
				end: start + HOUR,
				sessionType: "ABA",
				actor: "sub-test",
				...over,
			},
			created,
		);
	const hold = (practitioner: string, start: number, mode: "onsite" | "online" = "onsite") =>
		visitor.hold({
			tenant: TENANT,
			service: "evaluation",
			practitioner,
			start,
			mode,
			locale: "ro",
			channel: "form",
		});

	afterAll(async () => {
		if (ready)
			await runMutation("seed:dropFixture", { tenant: TENANT }, z.object({ deleted: z.number() }));
	});

	it("sets up two practitioners in the service, a third outside it, two rooms", async () => {
		for (const [slug, name] of [
			["ana", "Ana"],
			["dan", "Dan"],
			["eva", "Eva"],
		] as const) {
			const r = await staff.createPractitioner({ tenant: TENANT, slug, displayName: name, actor });
			if (!r.ok) throw new Error(r.reason);
			ids[slug] = r.id;
		}
		for (const slug of ["terapie-1", "terapie-2"]) {
			const r = await staff.createRoom({
				tenant: TENANT,
				room: {
					slug,
					name: slug,
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
				practitioners: [ids.ana ?? "", ids.dan ?? ""],
				roomKind: "therapy",
			},
			actor,
		});
		expect(made.ok).toBe(true);
		for (const p of ["ana", "dan"]) {
			await staff.setDayRules({
				tenant: TENANT,
				practitioner: ids[p] ?? "",
				weekdays: [1, 2, 3, 4, 5, 6, 7],
				windows: [{ start: 600, end: 720, modes: ["onsite", "online"] }],
				actor,
			});
		}
		expect((await slots()).length).toBeGreaterThan(0);
	});

	it("a visit takes the practitioner's time away from the public: not offered, not held", async () => {
		const free = await slots();
		const target = free.find((s) => s.practitionerName === "Ana");
		if (target === undefined) throw new Error("no slot for Ana");
		const made = await visit(ids.ana ?? "", target.start);
		expect(made.ok).toBe(true);
		const after = await slots();
		expect(after.some((s) => s.practitionerName === "Ana" && s.start === target.start)).toBe(false);
		expect(after.some((s) => s.practitionerName === "Dan" && s.start === target.start)).toBe(true);
		expect(await hold(ids.ana ?? "", target.start)).toEqual({ ok: false, reason: "slot_taken" });
		expect((await hold(ids.dan ?? "", target.start)).ok).toBe(true);
		// A second visit over the same time is refused, and so is one over a time the public holds.
		expect(await visit(ids.ana ?? "", target.start + HOUR / 2)).toMatchObject({
			ok: false,
			reason: "overlaps",
		});
		const other = free.find((s) => s.practitionerName === "Ana" && s.start > target.start);
		if (other === undefined) throw new Error("no second slot");
		expect((await hold(ids.ana ?? "", other.start, "online")).ok).toBe(true);
		expect(await visit(ids.ana ?? "", other.start)).toMatchObject({
			ok: false,
			reason: "overlaps",
		});
	});

	it("refuses what is not sound, and writes nothing", async () => {
		const start = Date.now() + 5 * DAY;
		expect(await visit("nope", start)).toMatchObject({ ok: false, reason: "unknown_practitioner" });
		expect(await visit(ids.eva ?? "", start, { end: start })).toMatchObject({
			ok: false,
			reason: "end_not_after_start",
		});
		expect(await visit(ids.eva ?? "", start, { client: "nope" })).toMatchObject({
			ok: false,
			reason: "unknown_client",
		});
		expect(await visit(ids.eva ?? "", start, { room: "nope" })).toMatchObject({
			ok: false,
			reason: "unknown_room",
		});
		expect(await visit(ids.eva ?? "", start, { room: ids["terapie-1"] ?? "" })).toMatchObject({
			ok: true,
		});
	});

	it("a visit that uses a room takes it from the public flow; with both rooms taken, onsite goes", async () => {
		const free = await slots("onsite");
		const t = free
			.map((s) => s.start)
			.find((start) => free.filter((s) => s.start === start).length === 2);
		if (t === undefined) throw new Error("no time with both practitioners free onsite");
		const names = async (mode: "onsite" | "online") =>
			(await slots(mode))
				.filter((s) => s.start === t)
				.map((s) => s.practitionerName)
				.sort();
		// Eva (not in the service) uses room 1: one room is left, both practitioners can still be onsite.
		expect((await visit(ids.eva ?? "", t, { room: ids["terapie-1"] ?? "" })).ok).toBe(true);
		expect(await names("onsite")).toEqual(["Ana", "Dan"]);
		// Dan's own visit uses room 2: Dan is gone from that hour, and Ana can only be seen online.
		expect((await visit(ids.dan ?? "", t, { room: ids["terapie-2"] ?? "" })).ok).toBe(true);
		expect(await names("onsite")).toEqual([]);
		expect(await names("online")).toEqual(["Ana"]);
	});
});
