import { MAX_SERIES_OCCURRENCES, SeriesConflict, SeriesResult } from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { ok, type Populated } from "./testing/populate";
import { HOUR, NOW, type Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const A = "/v1/apps/psizone";
const factories = await worldFactories();
const DAY = 24 * HOUR;
const err = (r: Reply): { code: string; detail?: Record<string, unknown> } =>
	r.json.error as { code: string; detail?: Record<string, unknown> };
const conflictsOf = (r: Reply) => z.array(SeriesConflict).parse(err(r).detail?.conflicts);

/** 10:00 on a day in Bucharest (EET, +2, before 29 March 2026; EEST, +3, after) as an instant. */
const at = (date: string, hour: number, offset: 2 | 3, minute = 0): number =>
	Date.parse(
		`${date}T${String(hour - offset).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
	);

describe.each(factories)("weekly series, on the $name store", (factory) => {
	let w: Populated;
	let n = 0;
	const as = (who: string | null, method: string, path: string, body?: unknown) =>
		w.call(who, method, `${A}${path}`, body);
	/** A year of its own per case, so cases never meet: weeks of 2031 onwards, kept clear of the populated data. */
	const year = (): number => 2031 + ++n;
	async function refused(run: () => Promise<Reply>, status: number, code: string): Promise<Reply> {
		const before = await w.fingerprint();
		const reply = await run();
		expect(reply.status, JSON.stringify(reply.json)).toBe(status);
		expect(err(reply).code).toBe(code);
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
		return reply;
	}
	const make = async (over: Record<string, unknown> = {}, who: string | null = "olga") => {
		const y = year();
		return as(who, "POST", "/series", {
			practitionerId: w.ids.dora,
			clientId: w.ids.c1,
			serviceId: w.ids.service,
			start: Date.UTC(y, 5, 1, 7),
			end: Date.UTC(y, 5, 1, 8),
			recurrence: { count: 4 },
			...over,
		});
	};
	const made = async (over: Record<string, unknown> = {}) => {
		const r = await make(over);
		return SeriesResult.parse(ok(r, "series"));
	};
	const items = async (id: string) =>
		SeriesResult.parse((await as("olga", "GET", `/series/${id}`)).json).items;
	const starts = (list: readonly { start: number }[]): number[] => list.map((a) => a.start);
	const tuplesOf = (id: string): number =>
		w.authz.tuples().filter((t) => t.object === `sched_appointment:${id}`).length;

	beforeAll(async () => {
		w = await factory.create();
	});
	afterAll(async () => {
		await factory.cleanup();
	});

	describe("making one", () => {
		it("books every week with a series id, one hour each, for the same person, client and service", async () => {
			const s = await made();
			expect(s.items).toHaveLength(4);
			const first = s.items[0];
			for (const [i, a] of s.items.entries()) {
				expect(a).toMatchObject({
					seriesId: s.seriesId,
					practitionerId: w.ids.dora,
					clientId: w.ids.c1,
					serviceId: w.ids.service,
					status: "scheduled",
					remind: true,
				});
				expect(a.start).toBe((first?.start ?? 0) + i * 7 * DAY);
				expect(a.end - a.start).toBe(HOUR);
				expect(tuplesOf(a.id)).toBe(2);
				expect((await as("olga", "GET", `/appointments/${a.id}`)).json.seriesId).toBe(s.seriesId);
			}
			expect(s.seriesId).toBe(first?.id);
			expect(starts(await items(s.seriesId))).toEqual(starts(s.items));
		});

		it("ends on a date: every week up to and including it", async () => {
			const y = year();
			const s = await made({
				start: Date.UTC(y, 5, 1, 7),
				end: Date.UTC(y, 5, 1, 8),
				recurrence: { until: `${y}-06-22` },
			});
			expect(s.items).toHaveLength(4);
			const short = await made({
				start: Date.UTC(y, 6, 1, 7),
				end: Date.UTC(y, 6, 1, 8),
				recurrence: { until: `${y}-07-21` },
			});
			expect(short.items).toHaveLength(3);
		});

		it("keeps the wall-clock time across the change of clocks on 2026-03-29: 10:00 every Sunday, a week less an hour apart", async () => {
			const s = await made({
				start: at("2026-03-22", 10, 2),
				end: at("2026-03-22", 11, 2),
				recurrence: { count: 3 },
			});
			expect(starts(s.items)).toEqual([
				Date.UTC(2026, 2, 22, 8),
				Date.UTC(2026, 2, 29, 7),
				Date.UTC(2026, 3, 5, 7),
			]);
			const [a, b] = starts(s.items);
			expect((b ?? 0) - (a ?? 0)).toBe(7 * DAY - HOUR);
			for (const item of s.items) expect(item.end - item.start).toBe(HOUR);
		});

		it("refuses a wall time the clocks jump over (03:30 on 2026-03-29), names the occurrence and writes nothing", async () => {
			const r = await refused(
				() =>
					make({
						start: at("2026-03-22", 3, 2, 30),
						end: at("2026-03-22", 4, 2, 30),
						recurrence: { count: 3 },
					}),
				409,
				"conflict",
			);
			expect(conflictsOf(r)).toEqual([{ index: 1, date: "2026-03-29", reason: "no_such_time" }]);
		});

		it("takes a wall time that happens twice (03:30 on 2026-10-25) at its first occurrence", async () => {
			const s = await made({
				start: at("2026-10-18", 3, 3, 30),
				end: at("2026-10-18", 4, 3, 30),
				recurrence: { count: 2 },
			});
			expect(starts(s.items)[1]).toBe(Date.UTC(2026, 9, 25, 0, 30));
		});

		it("holds the cap: 52 appointments are made, with 104 tuples; 53 are refused, by count and by date, and nothing is written", async () => {
			const y = year();
			const start = Date.UTC(y, 0, 5, 7);
			const s = await made({
				start,
				end: start + HOUR,
				recurrence: { count: MAX_SERIES_OCCURRENCES },
			});
			expect(s.items).toHaveLength(52);
			expect(s.items.reduce((sum, a) => sum + tuplesOf(a.id), 0)).toBe(104);
			const next = year();
			const from = Date.UTC(next, 0, 5, 7);
			await refused(
				() => make({ start: from, end: from + HOUR, recurrence: { count: 53 } }),
				400,
				"invalid",
			);
			const lastOf53 = new Date(from + 52 * 7 * DAY).toISOString().slice(0, 10);
			const r = await refused(
				() => make({ start: from, end: from + HOUR, recurrence: { until: lastOf53 } }),
				400,
				"invalid",
			);
			expect(err(r).detail).toMatchObject({ field: "recurrence", reason: "too_many" });
		});

		it.each([
			["neither an end nor a count", () => ({})],
			["both", () => ({ count: 3, until: "2099-01-01" })],
			["one appointment", () => ({ count: 1 })],
			["a fraction", () => ({ count: 2.5 })],
			["an end that is not a date", () => ({ until: "soon" })],
			["an end on the first day", (y: number) => ({ until: `${y}-06-01` })],
			["an end less than a week on", (y: number) => ({ until: `${y}-06-05` })],
			["an end before it begins", () => ({ until: "2001-01-01" })],
		])("refuses a series with %s, and writes nothing", async (_what, recurrence) => {
			const y = year();
			await refused(
				() =>
					make({
						start: Date.UTC(y, 5, 1, 7),
						end: Date.UTC(y, 5, 1, 8),
						recurrence: recurrence(y),
					}),
				400,
				"invalid",
			);
		});

		it("reports every occurrence that clashes, with what it clashes with, and writes none", async () => {
			const y = year();
			const start = Date.UTC(y, 5, 1, 7);
			// The person is busy in the second and the fourth week; the room in the third.
			for (const week of [1, 3])
				ok(
					await as("olga", "POST", "/appointments", {
						practitionerId: w.ids.dora,
						clientId: w.ids.c2,
						start: start + week * 7 * DAY,
						end: start + week * 7 * DAY + HOUR,
					}),
					"busy",
				);
			ok(
				await as("olga", "POST", "/appointments", {
					practitionerId: w.ids.elena,
					clientId: w.ids.c2,
					roomId: w.ids.room,
					start: start + 2 * 7 * DAY,
					end: start + 2 * 7 * DAY + HOUR,
				}),
				"busy room",
			);
			const r = await refused(
				() =>
					make({
						start,
						end: start + HOUR,
						roomId: w.ids.room,
						recurrence: { count: 5 },
					}),
				409,
				"conflict",
			);
			expect(conflictsOf(r).map((c) => [c.index, c.reason, c.with])).toEqual([
				[1, "overlaps", "practitioner"],
				[2, "overlaps", "room"],
				[3, "overlaps", "practitioner"],
			]);
			expect(
				(
					(await as("olga", "GET", `/appointments?from=${start}&to=${start + 5 * 7 * DAY}`)).json
						.items as { seriesId?: string }[]
				).filter((a) => a.seriesId !== undefined),
			).toEqual([]);
		});

		it("asks the blacklist about the client once: a warning stops the whole series, a reason lets it through", async () => {
			const client = String(
				ok(await as("olga", "POST", "/clients", { name: "Flagged One" }), "client").id,
			);
			ok(
				await as("olga", "POST", "/blacklist", {
					client,
					reason: "synthetic",
					category: "other",
					severity: "warn",
				}),
				"flag",
			);
			const r = await refused(() => make({ clientId: client }), 409, "conflict");
			expect(err(r).detail).toMatchObject({ reason: "warning" });
			const s = await made({ clientId: client, override: { reason: "known and agreed" } });
			expect(s.items).toHaveLength(4);
		});

		it("a requested series holds the time without telling the client, and each one is confirmed on its own", async () => {
			w.notifier.sent.length = 0;
			const s = await made({ status: "requested" });
			expect(s.items.every((a) => a.status === "requested")).toBe(true);
			expect(w.notifier.sent).toEqual([]);
			const one = s.items[1];
			expect((await as("olga", "POST", `/appointments/${one?.id}/confirm`)).json).toMatchObject({
				status: "scheduled",
				seriesId: s.seriesId,
			});
		});

		it("tells the client once, not once a week", async () => {
			w.notifier.sent.length = 0;
			await made();
			expect(w.notifier.sent.map((m) => m.event)).toEqual(["appointment.confirmed"]);
		});

		it("is refused to someone who may not book that calendar, and writes nothing", async () => {
			await refused(() => make({}, "vera"), 404, "not_found");
			await refused(() => make({}, null), 401, "unauthenticated");
		});

		it("is put away whole when its tuples cannot be written: nobody is left holding appointments no one may reach", async () => {
			const write = w.deps.authz.write.bind(w.deps.authz);
			w.deps.authz.write = () => Promise.reject(new Error("tuples down"));
			const y = year();
			const start = Date.UTC(y, 5, 1, 7);
			try {
				const r = await make({ start, end: start + HOUR });
				expect(r.status).toBeGreaterThanOrEqual(500);
			} finally {
				w.deps.authz.write = write;
			}
			const listed = (
				await as("olga", "GET", `/appointments?from=${start}&to=${start + 4 * 7 * DAY}`)
			).json.items as unknown[];
			expect(listed).toEqual([]);
		});
	});

	describe("reading one", () => {
		it("lists its appointments in time order; a series that is not there, or that the caller cannot reach, is not found", async () => {
			const s = await made();
			expect((await as("olga", "GET", `/series/${s.seriesId}`)).status).toBe(200);
			expect((await as("olga", "GET", "/series/nosuchseries00")).status).toBe(404);
			// Another therapist's calendar is none of dora's colleague's business.
			expect((await as("elena", "GET", `/series/${s.seriesId}`)).status).toBe(404);
			expect((await as("dora", "GET", `/series/${s.seriesId}`)).status).toBe(200);
		});
	});

	describe("changing it", () => {
		/** Five weekly appointments, three of them already past (the world's clock is 2026-11-13). */
		const seasoned = (first = "2026-10-29") =>
			made({
				start: at(first, 10, 2),
				end: at(first, 11, 2),
				recurrence: { count: 5 },
			});
		const notes = async (id: string): Promise<(string | undefined)[]> =>
			(await items(id)).map((a) => a.note);

		it("this one only", async () => {
			const s = await made();
			const r = await as("olga", "PATCH", `/series/${s.seriesId}`, {
				occurrenceId: s.items[1]?.id,
				scope: "this",
				note: "just this week",
			});
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			expect(await notes(s.seriesId)).toEqual([undefined, "just this week", undefined, undefined]);
		});

		it("this one and the ones after it", async () => {
			const s = await made();
			await as("olga", "PATCH", `/series/${s.seriesId}`, {
				occurrenceId: s.items[2]?.id,
				scope: "following",
				note: "from now on",
			});
			expect(await notes(s.seriesId)).toEqual([undefined, undefined, "from now on", "from now on"]);
		});

		it("all of them", async () => {
			const s = await made();
			const r = await as("olga", "PATCH", `/series/${s.seriesId}`, {
				occurrenceId: s.items[0]?.id,
				scope: "all",
				note: "every week",
				remind: false,
				priceCents: 9_000,
			});
			expect(
				SeriesResult.parse(r.json).items.every(
					(a) => a.remind === false && a.money?.priceCents === 9_000 && a.note === "every week",
				),
			).toBe(true);
		});

		it("never reaches what is past: following and all leave the past alone, and the one pointed at is changed", async () => {
			const s = await seasoned();
			expect(s.items).toHaveLength(5);
			await as("olga", "PATCH", `/series/${s.seriesId}`, {
				occurrenceId: s.items[3]?.id,
				scope: "all",
				note: "from the future",
			});
			expect(await notes(s.seriesId)).toEqual([
				undefined,
				undefined,
				undefined,
				"from the future",
				"from the future",
			]);
			const again = await seasoned("2026-10-28");
			await as("olga", "PATCH", `/series/${again.seriesId}`, {
				occurrenceId: again.items[1]?.id,
				scope: "following",
				note: "from the second",
			});
			// The second and the two to come; the third, past and not pointed at, stays.
			expect(await notes(again.seriesId)).toEqual([
				undefined,
				"from the second",
				undefined,
				"from the second",
				"from the second",
			]);
		});

		it("changes the client, the service, the person and the package of every appointment in scope", async () => {
			const s = await made();
			const other = String(
				ok(
					await as("olga", "POST", "/services", {
						slug: `s${n}`,
						name: { ro: "Alta", en: "Other" },
						durationMinutes: 30,
						modes: ["onsite"],
					}),
					"service",
				).id,
			);
			const mine = String(
				ok(
					await as("olga", "POST", `/clients/${w.ids.c2}/packages`, {
						name: "p",
						sessions: 9,
						priceCents: 90_000,
					}),
					"package",
				).id,
			);
			const r = await as("olga", "PATCH", `/series/${s.seriesId}`, {
				occurrenceId: s.items[0]?.id,
				scope: "all",
				clientId: w.ids.c2,
				serviceId: other,
				packageId: mine,
			});
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			for (const a of SeriesResult.parse(r.json).items)
				expect(a).toMatchObject({ clientId: w.ids.c2, serviceId: other, packageId: mine });
			const out = await as("olga", "PATCH", `/series/${s.seriesId}`, {
				occurrenceId: s.items[0]?.id,
				scope: "all",
				packageId: null,
			});
			for (const a of SeriesResult.parse(out.json).items) expect(a.packageId).toBeUndefined();
		});

		it("moves the time of day on each appointment's own day, across the change of clocks of 2027-03-28", async () => {
			const s = await made({
				start: at("2027-03-21", 10, 2),
				end: at("2027-03-21", 11, 2),
				recurrence: { count: 3 },
			});
			const r = await as("olga", "PATCH", `/series/${s.seriesId}`, {
				occurrenceId: s.items[0]?.id,
				scope: "all",
				startMin: 12 * 60,
				durationMin: 90,
			});
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			expect(starts(SeriesResult.parse(r.json).items)).toEqual([
				Date.UTC(2027, 2, 21, 10),
				Date.UTC(2027, 2, 28, 9),
				Date.UTC(2027, 3, 4, 9),
			]);
			for (const a of SeriesResult.parse(r.json).items) expect(a.end - a.start).toBe(90 * 60_000);
		});

		it("refuses a time the clocks jump over on one of the days, whole: no appointment moves", async () => {
			const s = await made({
				start: at("2027-03-21", 10, 2),
				end: at("2027-03-21", 11, 2),
				recurrence: { count: 3 },
			});
			const r = await refused(
				() =>
					as("olga", "PATCH", `/series/${s.seriesId}`, {
						occurrenceId: s.items[0]?.id,
						scope: "all",
						startMin: 3 * 60 + 30,
						note: "never written",
					}),
				409,
				"conflict",
			);
			expect(conflictsOf(r)).toEqual([{ index: 1, date: "2027-03-28", reason: "no_such_time" }]);
			expect(starts(await items(s.seriesId))).toEqual(starts(s.items));
			expect(await notes(s.seriesId)).toEqual([undefined, undefined, undefined]);
		});

		it("refuses the whole change when one appointment would clash, naming it, and changes none", async () => {
			const s = await made();
			const second = s.items[1];
			// Someone else holds dora at 12:00 in the second week.
			ok(
				await as("olga", "POST", "/appointments", {
					practitionerId: w.ids.dora,
					clientId: w.ids.c2,
					start: (second?.start ?? 0) + 2 * HOUR,
					end: (second?.start ?? 0) + 3 * HOUR,
				}),
				"busy",
			);
			const r = await refused(
				() =>
					as("olga", "PATCH", `/series/${s.seriesId}`, {
						occurrenceId: s.items[0]?.id,
						scope: "all",
						startMin: 12 * 60,
						note: "never written",
					}),
				409,
				"conflict",
			);
			expect(conflictsOf(r).map((c) => [c.index, c.reason, c.with])).toEqual([
				[1, "overlaps", "practitioner"],
			]);
			expect(starts(await items(s.seriesId))).toEqual(starts(s.items));
		});

		it("refuses another client's package, whole, and the blacklist for a flagged client, whole", async () => {
			const s = await made();
			const r = await refused(
				() =>
					as("olga", "PATCH", `/series/${s.seriesId}`, {
						occurrenceId: s.items[0]?.id,
						scope: "all",
						clientId: w.ids.c2,
						packageId: w.ids.pkg,
					}),
				409,
				"conflict",
			);
			expect(conflictsOf(r).every((c) => c.reason === "package_not_clients")).toBe(true);
			const flagged = String(
				ok(await as("olga", "POST", "/clients", { name: "Flagged Two" }), "client").id,
			);
			ok(
				await as("olga", "POST", "/blacklist", {
					client: flagged,
					reason: "synthetic",
					category: "other",
					severity: "warn",
				}),
				"flag",
			);
			const stop = await refused(
				() =>
					as("olga", "PATCH", `/series/${s.seriesId}`, {
						occurrenceId: s.items[0]?.id,
						scope: "all",
						clientId: flagged,
					}),
				409,
				"conflict",
			);
			expect(err(stop).detail).toMatchObject({ reason: "warning" });
			const ok1 = await as("olga", "PATCH", `/series/${s.seriesId}`, {
				occurrenceId: s.items[0]?.id,
				scope: "all",
				clientId: flagged,
				override: { reason: "known" },
			});
			expect(ok1.status).toBe(200);
		});

		it("is refused for what the caller may not write, whole: the money group and the core group are their own keys", async () => {
			const s = await made();
			await refused(
				() =>
					as("dora", "PATCH", `/series/${s.seriesId}`, {
						occurrenceId: s.items[0]?.id,
						scope: "all",
						priceCents: 1,
						note: "never written",
					}),
				403,
				"forbidden",
			);
			await refused(
				() =>
					as("elena", "PATCH", `/series/${s.seriesId}`, {
						occurrenceId: s.items[0]?.id,
						scope: "all",
						note: "not hers",
					}),
				404,
				"not_found",
			);
			expect(
				(
					await as("dora", "PATCH", `/series/${s.seriesId}`, {
						occurrenceId: s.items[0]?.id,
						scope: "all",
						note: "mine",
					})
				).status,
			).toBe(200);
		});

		it("refuses an appointment that is not in the series, a series that is not there, and an empty scope", async () => {
			const s = await made();
			const other = await made();
			await refused(
				() =>
					as("olga", "PATCH", `/series/${s.seriesId}`, {
						occurrenceId: other.items[0]?.id,
						scope: "all",
						note: "x",
					}),
				404,
				"not_found",
			);
			await refused(
				() =>
					as("olga", "PATCH", "/series/nosuchseries00", {
						occurrenceId: s.items[0]?.id,
						scope: "all",
						note: "x",
					}),
				404,
				"not_found",
			);
			await as("olga", "POST", `/series/${s.seriesId}/cancel`, {
				occurrenceId: s.items[0]?.id,
				scope: "all",
				reason: "client asked",
			});
			await refused(
				() =>
					as("olga", "PATCH", `/series/${s.seriesId}`, {
						occurrenceId: s.items[0]?.id,
						scope: "all",
						note: "x",
					}),
				409,
				"conflict",
			);
		});

		it.each([
			["a scope that is not one", { scope: "some" }],
			["no occurrence", { occurrenceId: undefined }],
			["a time of day past midnight", { startMin: 1440 }],
			["a price below nothing", { priceCents: -1 }],
		])("is malformed with %s, and writes nothing", async (_what, over) => {
			const s = await made();
			await refused(
				() =>
					as("olga", "PATCH", `/series/${s.seriesId}`, {
						occurrenceId: s.items[0]?.id,
						scope: "all",
						note: "x",
						...over,
					}),
				400,
				"invalid",
			);
		});
	});

	describe("cancelling it", () => {
		const statuses = async (id: string) => (await items(id)).map((a) => a.status);

		it("this one, this and the following, and every one still to come, with the reason", async () => {
			const s = await made();
			await as("olga", "POST", `/series/${s.seriesId}/cancel`, {
				occurrenceId: s.items[1]?.id,
				scope: "this",
				reason: "holiday",
			});
			expect(await statuses(s.seriesId)).toEqual([
				"scheduled",
				"cancelled",
				"scheduled",
				"scheduled",
			]);
			await as("olga", "POST", `/series/${s.seriesId}/cancel`, {
				occurrenceId: s.items[3]?.id,
				scope: "following",
				reason: "client moved",
			});
			expect(await statuses(s.seriesId)).toEqual([
				"scheduled",
				"cancelled",
				"scheduled",
				"cancelled",
			]);
			const r = await as("olga", "POST", `/series/${s.seriesId}/cancel`, {
				occurrenceId: s.items[0]?.id,
				scope: "all",
				reason: "ended",
			});
			expect(r.status).toBe(200);
			expect(SeriesResult.parse(r.json).items.every((a) => a.status === "cancelled")).toBe(true);
			expect((await items(s.seriesId))[1]?.cancelReason).toBe("holiday");
			expect((await items(s.seriesId))[0]?.cancelReason).toBe("ended");
		});

		it("leaves the past alone, and what is attended, and tells the client once", async () => {
			const s = await made({
				start: at("2026-10-27", 10, 2),
				end: at("2026-10-27", 11, 2),
				recurrence: { count: 5 },
			});
			await as("olga", "POST", `/appointments/${s.items[0]?.id}/attendance`, {
				status: "attended",
			});
			w.notifier.sent.length = 0;
			await as("olga", "POST", `/series/${s.seriesId}/cancel`, {
				occurrenceId: s.items[0]?.id,
				scope: "all",
				reason: "ended",
			});
			expect(await statuses(s.seriesId)).toEqual([
				"attended",
				"scheduled",
				"scheduled",
				"cancelled",
				"cancelled",
			]);
			expect(w.notifier.sent.map((m) => m.event)).toEqual(["appointment.cancelled"]);
		});

		it("refuses a reason that is too short, an appointment that is not in the series, nothing left to cancel, and who may not cancel; nothing is written", async () => {
			const s = await made();
			const other = await made();
			await refused(
				() =>
					as("olga", "POST", `/series/${s.seriesId}/cancel`, {
						occurrenceId: s.items[0]?.id,
						scope: "all",
						reason: "x",
					}),
				400,
				"invalid",
			);
			await refused(
				() =>
					as("olga", "POST", `/series/${s.seriesId}/cancel`, {
						occurrenceId: other.items[0]?.id,
						scope: "all",
						reason: "no longer",
					}),
				404,
				"not_found",
			);
			await refused(
				() =>
					as("vera", "POST", `/series/${s.seriesId}/cancel`, {
						occurrenceId: s.items[0]?.id,
						scope: "all",
						reason: "no longer",
					}),
				403,
				"forbidden",
			);
			await refused(
				() =>
					as("elena", "POST", `/series/${s.seriesId}/cancel`, {
						occurrenceId: s.items[0]?.id,
						scope: "all",
						reason: "no longer",
					}),
				404,
				"not_found",
			);
			await as("olga", "POST", `/series/${s.seriesId}/cancel`, {
				occurrenceId: s.items[0]?.id,
				scope: "all",
				reason: "no longer",
			});
			await refused(
				() =>
					as("olga", "POST", `/series/${s.seriesId}/cancel`, {
						occurrenceId: s.items[0]?.id,
						scope: "all",
						reason: "no longer",
					}),
				409,
				"conflict",
			);
		});

		it("a cancelled appointment frees its time for someone else", async () => {
			const s = await made();
			await as("olga", "POST", `/series/${s.seriesId}/cancel`, {
				occurrenceId: s.items[0]?.id,
				scope: "all",
				reason: "ended",
			});
			const again = await as("olga", "POST", "/appointments", {
				practitionerId: w.ids.dora,
				clientId: w.ids.c2,
				start: s.items[2]?.start,
				end: s.items[2]?.end,
			});
			expect(again.status).toBe(200);
		});
	});

	it("(unused) the world's clock is the one the scope rules read", () => {
		expect(w.clock.now).toBe(NOW);
	});
});
