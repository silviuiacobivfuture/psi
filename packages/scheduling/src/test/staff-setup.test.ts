import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createSchedulingClient } from "../client";
import type { SchedulingConfig } from "../config";
import type { NewService, StaffSchedulingClient } from "../staff-client";
import { createStaffSchedulingClient } from "../staff-client";
import { SchedulingUnavailable } from "../transport";

/**
 * The team's setup functions against the real local backend (README), in their own throwaway
 * `test-setup-…` tenant, which starts EMPTY like production does: the first create brings the
 * tenant into being. The internal fixture drop removes it afterwards. psizone is only read, to
 * prove another tenant's practitioners are refused.
 */

const PKG = resolve(import.meta.dirname, "../..");
const KEY_FILE = resolve(PKG, "../../.data/convex/secrets/server-key");
const URL = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
const reachable = await fetch(`${URL}/version`, { signal: AbortSignal.timeout(2_000) })
	.then((res) => res.ok)
	.catch(() => false);
const ready = reachable && existsSync(KEY_FILE) && existsSync(join(dirname(KEY_FILE), "admin-key"));
if (!ready) console.warn(`staff-setup.test: no local backend at ${URL}; see README.md`);

const TENANT = `test-setup-${Date.now().toString(36)}`;
const DAY = 24 * 60 * 60_000;
const actor = { subject: "cms:test-setup" };
const other = { subject: "cms:someone-else" };
const ZONE = "Europe/Bucharest";

function config(serverKey?: string): SchedulingConfig {
	return {
		url: URL,
		serverKey: serverKey ?? (ready ? readFileSync(KEY_FILE, "utf8").trim() : ""),
		timeoutMs: 10_000,
	};
}

const service = (practitioners: string[], over: Partial<NewService> = {}): NewService => ({
	slug: "evaluation",
	name: { ro: "Evaluare inițială", en: "First assessment" },
	durationMinutes: 60,
	bufferMinutes: 10,
	stepMinutes: 30,
	minNoticeMinutes: 0,
	horizonDays: 60,
	holdMinutes: 10,
	modes: ["onsite", "online"],
	practitioners,
	...over,
});

/** ISO weekday of a local date. */
const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;

describe.skipIf(!ready)("the team's setup of a tenant on the local Convex", () => {
	const staff: StaffSchedulingClient = createStaffSchedulingClient(config());
	const visitor = createSchedulingClient(config());
	let ana = "";

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

	const catalog = async () => {
		const c = await staff.catalog({ tenant: TENANT });
		if (!c.ok) throw new Error(c.reason);
		return c;
	};
	const slotsOf = async (days = 14, mode?: "onsite" | "online") => {
		const now = Date.now();
		const found = await visitor.findSlots({
			tenant: TENANT,
			service: "evaluation",
			from: now,
			to: now + days * DAY,
			...(mode === undefined ? {} : { mode }),
		});
		if (!found.ok) throw new Error(found.reason);
		return found.slots.map((s) => toLocalDate(s.start));
	};

	it("starts empty: no tenant, no service, nothing offered", async () => {
		expect(await staff.catalog({ tenant: TENANT })).toEqual({
			ok: false,
			reason: "unknown_tenant",
		});
		expect(
			await visitor.findSlots({ tenant: TENANT, service: "evaluation", from: 0, to: 1 }),
		).toEqual({ ok: false, reason: "unknown_service" });
	});

	it("refuses a practitioner that is not sound, writing nothing", async () => {
		for (const input of [
			{ slug: "a", displayName: "Ana" },
			{ slug: "Ana Pop", displayName: "Ana" },
			{ slug: "ana-pop", displayName: "   " },
			{ slug: "ana-pop", displayName: "x".repeat(81) },
		]) {
			expect(await staff.createPractitioner({ tenant: TENANT, ...input, actor })).toEqual({
				ok: false,
				reason: "invalid",
			});
		}
		expect(
			await staff.createPractitioner({
				tenant: "Bad Tenant",
				slug: "ana-pop",
				displayName: "Ana",
				actor,
			}),
		).toEqual({
			ok: false,
			reason: "invalid",
		});
		expect(await staff.catalog({ tenant: TENANT })).toEqual({
			ok: false,
			reason: "unknown_tenant",
		});
	});

	it("creates a practitioner (and the tenant), recording who, and a repeat adds nothing", async () => {
		const made = await staff.createPractitioner({
			tenant: TENANT,
			slug: "ana-pop",
			displayName: "  Ana   Pop ",
			actor,
		});
		if (!made.ok) throw new Error(made.reason);
		expect(made.created).toBe(true);
		ana = made.id;
		const again = await staff.createPractitioner({
			tenant: TENANT,
			slug: "ana-pop",
			displayName: "Ana Pop",
			actor: other,
		});
		expect(again).toEqual({ ok: true, id: ana, created: false });
		expect(
			await staff.createPractitioner({
				tenant: TENANT,
				slug: "ana-pop",
				displayName: "Ana Popa",
				actor,
			}),
		).toEqual({ ok: false, reason: "exists" });
		const c = await catalog();
		expect(c.timeZone).toBe(ZONE);
		expect(c.practitioners).toHaveLength(1);
		expect(c.practitioners[0]).toMatchObject({
			id: ana,
			slug: "ana-pop",
			displayName: "Ana Pop",
			active: true,
			updatedBy: actor.subject,
		});
	});

	it("creates a service only with sound settings, the tenant's practitioners, and a name", async () => {
		const psizone = await staff.catalog({ tenant: "psizone" });
		const foreign = psizone.ok ? (psizone.practitioners[0]?.id ?? "") : "";
		const refused: Array<Partial<NewService> & { practitioners?: string[] }> = [
			{ durationMinutes: 481 },
			{ durationMinutes: 4 },
			{ bufferMinutes: -1 },
			{ horizonDays: 0 },
			{ modes: [] },
			{ slug: "Evaluare" },
			{ slug: "e" },
			{ name: { ro: "", en: "x" } },
			{ name: { ro: "x", en: "  " } },
			{ location: "Strada Mare 1" },
			{ practitioners: [ana, "not-an-id"] },
			...(foreign === "" ? [] : [{ practitioners: [ana, foreign] }]),
		];
		for (const over of refused) {
			const { practitioners = [ana], ...rest } = over;
			expect(
				await staff.createService({ tenant: TENANT, service: service(practitioners, rest), actor }),
			).toEqual({
				ok: false,
				reason: "invalid",
			});
		}
		expect((await catalog()).services).toEqual([]);

		const made = await staff.createService({ tenant: TENANT, service: service([ana]), actor });
		expect(made.ok && made.created).toBe(true);
		expect(
			await staff.createService({ tenant: TENANT, service: service([ana]), actor: other }),
		).toMatchObject({
			ok: true,
			created: false,
		});
		expect(
			await staff.createService({
				tenant: TENANT,
				service: service([ana], { durationMinutes: 45 }),
				actor,
			}),
		).toEqual({ ok: false, reason: "exists" });
		const c = await catalog();
		expect(c.services).toHaveLength(1);
		expect(c.services[0]).toMatchObject({
			slug: "evaluation",
			name: { ro: "Evaluare inițială", en: "First assessment" },
			durationMinutes: 60,
			practitioners: [ana],
			active: true,
			updatedBy: actor.subject,
		});
	});

	it("offers nothing until there are hours, then offers exactly the hours set", async () => {
		expect(await slotsOf()).toEqual([]);
		const bad = [
			{ weekdays: [], windows: [{ start: 540, end: 780, modes: ["onsite" as const] }] },
			{ weekdays: [8], windows: [] },
			{ weekdays: [1], windows: [{ start: 780, end: 540, modes: ["onsite" as const] }] },
			{ weekdays: [1], windows: [{ start: 540, end: 780, modes: [] }] },
			{
				weekdays: [1],
				windows: [
					{ start: 540, end: 780, modes: ["onsite" as const] },
					{ start: 700, end: 900, modes: ["onsite" as const] },
				],
			},
		];
		for (const input of bad) {
			expect(
				await staff.setDayRules({ tenant: TENANT, practitioner: ana, ...input, actor }),
			).toEqual({
				ok: false,
				reason: "invalid",
			});
		}
		expect(
			await staff.setDayRules({
				tenant: TENANT,
				practitioner: "not-an-id",
				weekdays: [1],
				windows: [],
				actor,
			}),
		).toEqual({ ok: false, reason: "not_found" });
		const week = {
			tenant: TENANT,
			practitioner: ana,
			weekdays: [1, 2, 3, 4, 5],
			windows: [
				{ start: 9 * 60, end: 13 * 60, modes: ["onsite" as const] },
				{ start: 14 * 60, end: 18 * 60, modes: ["onsite" as const, "online" as const] },
			],
			actor,
		};
		expect(await staff.setDayRules(week)).toEqual({ ok: true, added: 10, removed: 0 });
		expect(await staff.setDayRules({ ...week, actor: other })).toEqual({
			ok: true,
			added: 0,
			removed: 0,
		});
		const days = await slotsOf();
		expect(days.length).toBeGreaterThan(0);
		expect(days.every((d) => weekdayOf(d) <= 5)).toBe(true);
		const a = await staff.availability({
			tenant: TENANT,
			practitioner: ana,
			fromDate: "2020-01-01",
		});
		expect(a.ok && a.rules).toHaveLength(10);
		expect(a.ok && a.rules.every((r) => r.start === 540 || r.start === 840)).toBe(true);
	});

	it("replaces one day without touching the others, and closing a day closes it", async () => {
		expect(
			await staff.setDayRules({
				tenant: TENANT,
				practitioner: ana,
				weekdays: [2],
				windows: [{ start: 600, end: 660, modes: ["online"] }],
				actor,
			}),
		).toEqual({ ok: true, added: 1, removed: 2 });
		expect(
			await staff.setDayRules({
				tenant: TENANT,
				practitioner: ana,
				weekdays: [3],
				windows: [],
				actor,
			}),
		).toEqual({
			ok: true,
			added: 0,
			removed: 2,
		});
		const a = await staff.availability({
			tenant: TENANT,
			practitioner: ana,
			fromDate: "2020-01-01",
		});
		if (!a.ok) throw new Error(a.reason);
		const per = (d: number) => a.rules.filter((r) => r.weekday === d).length;
		expect([1, 2, 3, 4, 5].map(per)).toEqual([2, 1, 0, 2, 2]);
		expect((await slotsOf(14)).some((d) => weekdayOf(d) === 3)).toBe(false);
		expect((await slotsOf(14, "onsite")).some((d) => weekdayOf(d) === 2)).toBe(false);
	});

	it("keeps a date-bound opening when a day is rewritten, and a repeated opening is the same one", async () => {
		const bound = await staff.addRule({
			tenant: TENANT,
			practitioner: ana,
			weekday: 6,
			start: 600,
			end: 720,
			modes: ["online"],
			validFrom: "2030-01-01",
			actor,
		});
		if (!bound.ok) throw new Error(bound.reason);
		expect(
			await staff.addRule({
				tenant: TENANT,
				practitioner: ana,
				weekday: 6,
				start: 600,
				end: 720,
				modes: ["online"],
				validFrom: "2030-01-01",
				actor: other,
			}),
		).toEqual({ ok: true, id: bound.id });
		await staff.setDayRules({
			tenant: TENANT,
			practitioner: ana,
			weekdays: [6],
			windows: [],
			actor,
		});
		const a = await staff.availability({
			tenant: TENANT,
			practitioner: ana,
			fromDate: "2020-01-01",
		});
		expect(a.ok && a.rules.filter((r) => r.weekday === 6).map((r) => r.id)).toEqual([bound.id]);
		expect(await staff.removeRule({ tenant: TENANT, rule: bound.id, actor })).toEqual({ ok: true });
	});

	it("closes whole days for a person or the team, once, and refuses what is not a range", async () => {
		const before = await slotsOf(14);
		const first = before[0];
		if (first === undefined) throw new Error("no slot");
		const range = { tenant: TENANT, practitioners: [ana], from: first, to: first };
		expect(await staff.addDaysOff({ ...range, actor })).toEqual({ ok: true, added: 1 });
		expect(await staff.addDaysOff({ ...range, actor: other })).toEqual({ ok: true, added: 0 });
		expect((await slotsOf(14)).includes(first)).toBe(false);
		for (const input of [
			{ from: "2030-02-01", to: "2030-01-01" },
			{ from: "2030-01-01", to: "2030-03-30" },
			{ from: "tomorrow", to: "2030-01-01" },
		]) {
			expect(
				await staff.addDaysOff({ tenant: TENANT, practitioners: [ana], ...input, actor }),
			).toEqual({
				ok: false,
				reason: "invalid",
			});
		}
		expect(await staff.addDaysOff({ ...range, practitioners: [], actor })).toEqual({
			ok: false,
			reason: "not_found",
		});
		expect(await staff.addDaysOff({ ...range, practitioners: ["not-an-id"], actor })).toEqual({
			ok: false,
			reason: "not_found",
		});
		const a = await staff.availability({
			tenant: TENANT,
			practitioner: ana,
			fromDate: "2020-01-01",
		});
		if (!a.ok) throw new Error(a.reason);
		expect(a.exceptions.map((e) => [e.date, e.kind])).toEqual([[first, "closed"]]);
		const off = a.exceptions[0];
		if (off === undefined) throw new Error("no exception");
		expect(await staff.removeException({ tenant: TENANT, exception: off.id, actor })).toEqual({
			ok: true,
		});
		expect((await slotsOf(14)).includes(first)).toBe(true);
	});

	it("changes a service's name, modes and practitioners within bounds, refusing the rest untouched", async () => {
		const grace = await staff.createPractitioner({
			tenant: TENANT,
			slug: "dan-ene",
			displayName: "Dan Ene",
			actor,
		});
		if (!grace.ok) throw new Error(grace.reason);
		const at = (patch: Parameters<StaffSchedulingClient["updateService"]>[0]["patch"]) =>
			staff.updateService({ tenant: TENANT, service: "evaluation", patch, actor: other });
		for (const patch of [
			{ name: { ro: " ", en: "x" } },
			{ modes: [] },
			{ stepMinutes: 1 },
			{ holdMinutes: 61 },
			{ practitioners: [ana, "not-an-id"] },
		]) {
			expect(await at(patch)).toEqual({ ok: false, reason: "invalid" });
		}
		const unchanged = (await catalog()).services[0];
		expect(unchanged).toMatchObject({
			modes: ["onsite", "online"],
			practitioners: [ana],
			stepMinutes: 30,
		});
		expect(
			await at({
				name: { ro: "Evaluare", en: "Assessment" },
				modes: ["online"],
				practitioners: [ana, grace.id, ana],
				stepMinutes: 15,
			}),
		).toEqual({ ok: true });
		expect((await catalog()).services[0]).toMatchObject({
			name: { ro: "Evaluare", en: "Assessment" },
			modes: ["online"],
			practitioners: [ana, grace.id],
			stepMinutes: 15,
			updatedBy: other.subject,
		});
	});

	it("renames and takes a practitioner offline, hiding their times; refuses another tenant's", async () => {
		const psizone = await staff.catalog({ tenant: "psizone" });
		const foreign = psizone.ok ? (psizone.practitioners[0]?.id ?? "") : "";
		for (const practitioner of ["not-an-id", foreign]) {
			expect(
				await staff.updatePractitioner({
					tenant: TENANT,
					practitioner,
					patch: { active: false },
					actor,
				}),
			).toEqual({ ok: false, reason: "not_found" });
		}
		expect(
			await staff.updatePractitioner({
				tenant: TENANT,
				practitioner: ana,
				patch: { displayName: " " },
				actor,
			}),
		).toEqual({ ok: false, reason: "invalid" });
		expect(
			await staff.updatePractitioner({
				tenant: TENANT,
				practitioner: ana,
				patch: { displayName: "Ana Popescu", active: false },
				actor: other,
			}),
		).toEqual({ ok: true, upcoming: 0 });
		const c = await catalog();
		expect(c.practitioners.find((p) => p.id === ana)).toMatchObject({
			displayName: "Ana Popescu",
			active: false,
			updatedBy: other.subject,
		});
		expect(await slotsOf(14)).toEqual([]);
		expect(
			await staff.updatePractitioner({
				tenant: TENANT,
				practitioner: ana,
				patch: { active: true },
				actor,
			}),
		).toEqual({
			ok: true,
			upcoming: 0,
		});
		expect((await slotsOf(14)).length).toBeGreaterThan(0);
	});

	it("refuses every setup call without the server key", async () => {
		const stranger = createStaffSchedulingClient(config("x".repeat(40)));
		await expect(
			stranger.createPractitioner({
				tenant: TENANT,
				slug: "intruder",
				displayName: "Intruder",
				actor,
			}),
		).rejects.toBeInstanceOf(SchedulingUnavailable);
		await expect(
			stranger.setDayRules({
				tenant: TENANT,
				practitioner: ana,
				weekdays: [1],
				windows: [],
				actor,
			}),
		).rejects.toBeInstanceOf(SchedulingUnavailable);
		expect((await catalog()).practitioners.map((p) => p.slug).sort()).toEqual([
			"ana-pop",
			"dan-ene",
		]);
	});
});

function toLocalDate(instant: number): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(instant);
}
