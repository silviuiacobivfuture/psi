import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import { accountHashOf } from "../account-client";
import { createSchedulingClient } from "../client";
import type { SchedulingConfig } from "../config";
import {
	createStaffSchedulingClient,
	type StaffSchedulingClient,
} from "../staff-client";

/**
 * The staff console's functions against the real local backend (README), in their own throwaway
 * `test-staff-…` tenant (internal fixture, dropped afterwards). psizone is only ever read, to
 * prove another tenant's rows are refused; nothing here changes it.
 */

const PKG = resolve(import.meta.dirname, "../..");
const KEY_FILE = resolve(PKG, "../../.data/convex/secrets/server-key");
const URL = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
const reachable = await fetch(`${URL}/version`, {
	signal: AbortSignal.timeout(2_000),
})
	.then((res) => res.ok)
	.catch(() => false);
const ready =
	reachable &&
	existsSync(KEY_FILE) &&
	existsSync(join(dirname(KEY_FILE), "admin-key"));
if (!ready)
	console.warn(
		`staff.test: no local backend at ${URL}; see packages/scheduling/README.md`,
	);

const TENANT = `test-staff-${Date.now().toString(36)}`;
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const actor = { subject: "test-staff-subject" };

function convexRun(fn: string, args: Record<string, string>): unknown {
	const out = execFileSync(
		join(PKG, "scripts/convex.sh"),
		["run", fn, JSON.stringify(args)],
		{
			cwd: PKG,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	return JSON.parse(out);
}

function config(): SchedulingConfig {
	return {
		url: URL,
		serverKey: readFileSync(KEY_FILE, "utf8").trim(),
		timeoutMs: 10_000,
	};
}

/**
 * A request in the fixture tenant, `days` ahead: submitted (signed in when `subject` is given),
 * or only held when `held` is set.
 */
async function request(
	days: number,
	how: { subject?: string; held?: boolean } = {},
): Promise<{ reference: string; start: number }> {
	const client = createSchedulingClient(config());
	const now = Date.now();
	const found = await client.findSlots({
		tenant: TENANT,
		service: "race",
		from: now + days * DAY,
		to: now + (days + 1) * DAY,
		mode: "onsite",
	});
	if (!found.ok) throw new Error(found.reason);
	const slot = found.slots[10];
	if (slot === undefined) throw new Error("no slot");
	const held = await client.hold({
		tenant: TENANT,
		service: "race",
		practitioner: slot.practitioner,
		start: slot.start,
		mode: "onsite",
		locale: "ro",
		channel: "form",
	});
	if (!held.ok) throw new Error(held.reason);
	if (how.held === true)
		return { reference: held.reference, start: slot.start };
	const sent = await client.submit({
		reference: held.reference,
		holdToken: held.holdToken,
		contact: { name: "DEMO Staff Test", phone: "0700 000 000" },
		audience: "adult",
		...(how.subject === undefined
			? {}
			: { accountHash: accountHashOf(how.subject) }),
	});
	if (!sent.ok) throw new Error(sent.reason);
	return { reference: held.reference, start: slot.start };
}

describe.skipIf(!ready)(
	"the staff console's functions on the local Convex",
	() => {
		let staff: StaffSchedulingClient;
		let practitioner = "";
		let foreignPractitioner = "";

		beforeAll(async () => {
			practitioner = z
				.object({ practitioner: z.string() })
				.parse(convexRun("seed:fixture", { tenant: TENANT })).practitioner;
			staff = createStaffSchedulingClient(config());
			const psizone = await staff.catalog({ tenant: "psizone" });
			foreignPractitioner = psizone.ok
				? (psizone.practitioners[0]?.id ?? "")
				: "";
		});

		afterAll(() => {
			convexRun("seed:dropFixture", { tenant: TENANT });
		});

		it("lists the whole catalog with ids, and refuses an unknown tenant", async () => {
			const catalog = await staff.catalog({ tenant: TENANT });
			if (!catalog.ok) throw new Error(catalog.reason);
			expect(catalog.timeZone).toBe("Europe/Bucharest");
			expect(catalog.practitioners).toEqual([
				{
					id: practitioner,
					slug: "fixture",
					displayName: "DEMO Fixture",
					active: true,
				},
			]);
			expect(catalog.services).toHaveLength(1);
			expect(catalog.services[0]).toMatchObject({
				slug: "race",
				durationMinutes: 30,
				bufferMinutes: 0,
				stepMinutes: 15,
				practitioners: [practitioner],
				active: true,
			});
			expect(await staff.catalog({ tenant: "test-staff-nobody" })).toEqual({
				ok: false,
				reason: "unknown_tenant",
			});
		});

		it("updates a service within its bounds, refuses outside them, and can take it offline", async () => {
			const at = (
				patch: Parameters<StaffSchedulingClient["updateService"]>[0]["patch"],
			) =>
				staff.updateService({ tenant: TENANT, service: "race", patch, actor });
			expect(await at({ durationMinutes: 481 })).toEqual({
				ok: false,
				reason: "invalid",
			});
			expect(await at({ bufferMinutes: -5 })).toEqual({
				ok: false,
				reason: "invalid",
			});
			expect(await at({ horizonDays: 0.5 })).toEqual({
				ok: false,
				reason: "invalid",
			});
			expect(
				await staff.updateService({
					tenant: TENANT,
					service: "nothing",
					patch: {},
					actor,
				}),
			).toEqual({ ok: false, reason: "not_found" });
			expect(
				await staff.updateService({
					tenant: "psizone",
					service: "race",
					patch: {},
					actor,
				}),
			).toEqual({ ok: false, reason: "not_found" });
			expect(await at({ bufferMinutes: 5, minNoticeMinutes: 30 })).toEqual({
				ok: true,
			});
			expect(await at({ active: false })).toEqual({ ok: true });
			const visitor = createSchedulingClient(config());
			const off = await visitor.findSlots({
				tenant: TENANT,
				service: "race",
				from: 0,
				to: 1,
			});
			expect(off).toEqual({ ok: false, reason: "unknown_service" });
			const catalog = await staff.catalog({ tenant: TENANT });
			expect(catalog.ok && catalog.services[0]).toMatchObject({
				bufferMinutes: 5,
				minNoticeMinutes: 30,
				active: false,
			});
			expect(
				await at({ bufferMinutes: 0, minNoticeMinutes: 0, active: true }),
			).toEqual({ ok: true });
		});

		it("adds and removes a weekly rule and an exception, only within the tenant", async () => {
			const bad = await staff.addRule({
				tenant: TENANT,
				practitioner,
				weekday: 8,
				start: 600,
				end: 660,
				modes: ["onsite"],
				actor,
			});
			expect(bad).toEqual({ ok: false, reason: "invalid" });
			expect(
				await staff.addRule({
					tenant: TENANT,
					practitioner,
					weekday: 1,
					start: 600,
					end: 660,
					modes: ["online"],
					validFrom: "2027-02-30x",
					actor,
				}),
			).toEqual({ ok: false, reason: "invalid" });
			expect(
				await staff.addRule({
					tenant: "psizone",
					practitioner,
					weekday: 1,
					start: 600,
					end: 660,
					modes: ["online"],
					actor,
				}),
			).toEqual({ ok: false, reason: "not_found" });
			const added = await staff.addRule({
				tenant: TENANT,
				practitioner,
				weekday: 3,
				start: 600,
				end: 660,
				modes: ["online", "online"],
				validFrom: "2027-01-01",
				actor,
			});
			if (!added.ok) throw new Error(added.reason);
			const exception = await staff.addException({
				tenant: TENANT,
				practitioner,
				date: "2027-01-06",
				kind: "closed",
				actor,
			});
			expect(exception).toEqual({ ok: true });
			const before = await staff.availability({
				tenant: TENANT,
				practitioner,
				fromDate: "2027-01-01",
			});
			if (!before.ok) throw new Error(before.reason);
			expect(before.rules).toHaveLength(8);
			expect(before.rules.find((r) => r.id === added.id)).toEqual({
				id: added.id,
				weekday: 3,
				start: 600,
				end: 660,
				modes: ["online"],
				validFrom: "2027-01-01",
			});
			expect(before.exceptions.map((e) => [e.date, e.kind])).toEqual([
				["2027-01-06", "closed"],
			]);
			const closed = before.exceptions[0];
			if (closed === undefined) throw new Error("no exception");
			const later = await staff.availability({
				tenant: TENANT,
				practitioner,
				fromDate: "2027-01-07",
			});
			expect(later.ok && later.exceptions).toEqual([]);

			expect(
				await staff.removeRule({ tenant: "psizone", rule: added.id, actor }),
			).toEqual({
				ok: false,
				reason: "not_found",
			});
			expect(
				await staff.removeRule({ tenant: TENANT, rule: "not-an-id", actor }),
			).toEqual({
				ok: false,
				reason: "not_found",
			});
			expect(
				await staff.removeException({
					tenant: "psizone",
					exception: closed.id,
					actor,
				}),
			).toEqual({ ok: false, reason: "not_found" });
			expect(
				await staff.removeRule({ tenant: TENANT, rule: added.id, actor }),
			).toEqual({ ok: true });
			expect(
				await staff.removeRule({ tenant: TENANT, rule: added.id, actor }),
			).toEqual({
				ok: false,
				reason: "not_found",
			});
			expect(
				await staff.removeException({
					tenant: TENANT,
					exception: closed.id,
					actor,
				}),
			).toEqual({
				ok: true,
			});
			const after = await staff.availability({
				tenant: TENANT,
				practitioner,
				fromDate: "2027-01-01",
			});
			expect(after.ok && [after.rules.length, after.exceptions.length]).toEqual(
				[7, 0],
			);
			expect(
				await staff.availability({
					tenant: TENANT,
					practitioner,
					fromDate: "tomorrow",
				}),
			).toEqual({ ok: false, reason: "invalid" });
			expect(
				await staff.availability({
					tenant: TENANT,
					practitioner: foreignPractitioner,
					fromDate: "2027-01-01",
				}),
			).toEqual({ ok: false, reason: "not_found" });
		});

		it("lists requests tenant-wide without the account hash, and decides with a closed reason", async () => {
			const anonymous = await request(2);
			const signedIn = await request(3, { subject: "test-staff-account" });
			const onlyHeld = await request(4, { held: true });
			const now = Date.now();
			const range = { tenant: TENANT, from: now, to: now + 10 * DAY };
			const listed = await staff.requests(range);
			if (!listed.ok) throw new Error(listed.reason);
			expect(
				listed.requests.map((r) => [r.reference, r.status, r.linkedAccount]),
			).toEqual([
				[anonymous.reference, "requested", false],
				[signedIn.reference, "requested", true],
			]);
			expect(listed.requests[0]).toMatchObject({
				start: anonymous.start,
				mode: "onsite",
				serviceSlug: "race",
				practitionerId: practitioner,
				practitionerName: "DEMO Fixture",
				channel: "form",
				contact: { name: "DEMO Staff Test", phone: "0700 000 000" },
				audience: "adult",
			});
			const raw = await new ConvexHttpClient(URL, { logger: false }).query(
				api.staffRequests.requests,
				{
					key: config().serverKey,
					...range,
				},
			);
			expect(
				raw.ok &&
					raw.requests.every((row) => !Object.hasOwn(row, "accountHash")),
			).toBe(true);

			const declined = await staff.decide({
				tenant: TENANT,
				reference: signedIn.reference,
				decision: "decline",
				reason: "schedule_conflict",
				actor,
			});
			expect(declined).toEqual({
				ok: true,
				status: "declined",
				reference: signedIn.reference,
				start: signedIn.start,
				accountHash: accountHashOf("test-staff-account"),
			});
			const confirmed = await staff.decide({
				tenant: TENANT,
				reference: anonymous.reference,
				decision: "confirm",
				reason: "administrative",
				actor,
			});
			expect(confirmed).toEqual({
				ok: true,
				status: "confirmed",
				reference: anonymous.reference,
				start: anonymous.start,
			});
			expect(
				await staff.decide({
					tenant: "psizone",
					reference: anonymous.reference,
					decision: "cancel",
					actor,
				}),
			).toEqual({ ok: false, reason: "not_found" });

			const decided = await staff.requests(range);
			if (!decided.ok) throw new Error(decided.reason);
			const [first, second] = decided.requests;
			expect(first).toMatchObject({
				status: "confirmed",
				decidedBy: actor.subject,
			});
			expect(
				first !== undefined && Object.hasOwn(first, "decisionReason"),
			).toBe(false);
			expect(second).toMatchObject({
				status: "declined",
				decidedBy: actor.subject,
				decisionReason: "schedule_conflict",
			});
			const onlyDeclined = await staff.requests({
				...range,
				statuses: ["declined"],
			});
			expect(
				onlyDeclined.ok && onlyDeclined.requests.map((r) => r.reference),
			).toEqual([signedIn.reference]);
			const held = await staff.requests({
				...range,
				statuses: ["held", "expired"],
			});
			expect(
				held.ok && held.requests.map((r) => [r.reference, r.status]),
			).toEqual([[onlyHeld.reference, "held"]]);
			expect(
				await staff.requests({ ...range, tenant: "test-staff-nobody" }),
			).toEqual({
				ok: false,
				reason: "unknown_tenant",
			});
		});
	},
);
