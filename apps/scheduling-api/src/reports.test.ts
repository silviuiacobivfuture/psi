import { reports } from "@psi/scheduling/clinic";
import {
	MAX_REPORT_DAYS,
	REPORT_GROUPS,
	REPORT_NAMES,
	ROUTES,
	type RouteSpec,
} from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Populated } from "./testing/populate";
import { HOUR, NOW, type Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const A = "/v1/apps/psizone";
const DAY = 24 * HOUR;
const factories = await worldFactories();
const err = (r: Reply): { code: string; detail?: Record<string, unknown> } =>
	r.json.error as { code: string; detail?: Record<string, unknown> };
/** The window of the populated clinic: well inside a year, around the world's clock. */
const FROM = NOW - 40 * DAY;
const TO = NOW + 40 * DAY;
const range = (from = FROM, to = TO, extra = ""): string => `?from=${from}&to=${to}${extra}`;
const PATH: Record<string, string> = { blacklistHits: "blacklist-hits" };

describe("the reports of the contract are the package's", () => {
	const routes = (ROUTES as ReadonlyArray<RouteSpec>).filter((r) => r.id.startsWith("reports."));

	it("has a route for each of the nine reports, and the groups are the package's own", () => {
		expect([...REPORT_NAMES].sort()).toEqual(Object.keys(reports.REPORTS).sort());
		expect(REPORT_GROUPS).toEqual(reports.REPORTS);
		for (const name of REPORT_NAMES)
			expect(
				routes.map((r) => r.id),
				name,
			).toContain(`reports.${name}`);
	});

	it("checks the permission the package names for each: view + its field group, money only for revenue", () => {
		for (const name of REPORT_NAMES) {
			const route = routes.find((r) => r.id === `reports.${name}`);
			const wanted = reports.permissionOf(name);
			expect(wanted.fieldGroup, name).toBe(REPORT_GROUPS[name]);
			expect(route?.permission?.key, name).toBe(`reports_view_${wanted.fieldGroup}`);
		}
		expect(REPORT_NAMES.filter((n) => REPORT_GROUPS[n] === "money")).toEqual(["revenue"]);
	});

	it("exports a report only with that report's export permission", () => {
		const csv = routes.find((r) => r.id === "reports.csv");
		expect(csv?.permission?.target).toMatchObject({
			kind: "dynamic",
			candidates: ["reports_export_core", "reports_export_money"],
		});
	});
});

describe("a cell of a CSV is never a formula", () => {
	it.each([
		["=SUM(A1:A2)", "'=SUM(A1:A2)"],
		["+1+1", "'+1+1"],
		["-cmd", "'-cmd"],
		["@home", "'@home"],
		["plain", "plain"],
		["-12", "-12"],
		["3.5", "3.5"],
		["a,b", '"a,b"'],
		['say "hi"', '"say ""hi"""'],
		["line\nbreak", '"line\nbreak"'],
	])("%j is written %j", (given, written) => {
		expect(reports.cell(given)).toBe(written);
	});

	it("flattens a report to field,value rows, a list keyed by what names its items, a rate that is missing left empty", () => {
		const out = reports.reportCsv(
			"rates",
			{
				bookings: 4,
				cancellationRate: null,
				buckets: [
					{ bucket: "2026-11-13", total: 4 },
					{ bucket: "=x", total: -1 },
				],
			},
			{ from: Date.UTC(2026, 10, 13, 0), to: Date.UTC(2026, 10, 15, 0), zone: "Europe/Bucharest" },
		);
		// The last instant of the window, 23:59 UTC on the 14th, is the 15th on a clock in Bucharest.
		expect(out.filename).toBe("report-rates-2026-11-13_2026-11-15.csv");
		expect(out.csv).toBe(
			[
				"field,value",
				"bookings,4",
				"cancellationRate,",
				"buckets.2026-11-13.total,4",
				"buckets.=x.total,-1",
				"",
			].join("\r\n"),
		);
	});
});

describe.each(factories)("the reports, on the $name store", (factory) => {
	let w: Populated;
	const as = (who: string | null, method: string, path: string) =>
		w.call(who, method, `${A}${path}`);
	const get = (who: string | null, name: string, query = range()) =>
		as(who, "GET", `/reports/${PATH[name] ?? name}${query}`);
	async function refused(run: () => Promise<Reply>, status: number, code: string): Promise<Reply> {
		const before = await w.fingerprint();
		const reply = await run();
		expect(reply.status, JSON.stringify(reply.json)).toBe(status);
		expect(err(reply).code).toBe(code);
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
		return reply;
	}

	beforeAll(async () => {
		w = await factory.create();
		// A member who may read the counts and nothing else, one who may also read the money, and one who may export.
		for (const [subject, grant] of [
			["counter", ["reports_view_all_core"]],
			["banker", ["reports_view_all_core", "reports_view_all_money"]],
			["exporter", ["reports_view_all_core", "reports_export_all_core"]],
		] as const) {
			await w.call("olga", "PUT", `${A}/members/${subject}`, {
				displayName: subject,
				roles: [],
				coordinates: [],
			});
			await w.call("olga", "PUT", `${A}/members/${subject}/overrides`, { grant, deny: [] });
		}
	});
	afterAll(async () => {
		await factory.cleanup();
	});

	describe("each one answers, in its own shape, and reading writes nothing", () => {
		it.each(REPORT_NAMES)("%s", async (name) => {
			const before = await w.fingerprint();
			const r = await get("olga", name);
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			expect(r.json.timeZone).toBe("Europe/Bucharest");
			expect(typeof r.json.report).toBe("object");
			expect(await w.fingerprint(), "a read wrote something").toBe(before);
		});

		it("counts the populated clinic's two appointments by status, by service, and by person", async () => {
			const byStatus = (await get("olga", "appointments")).json.report as {
				total: number;
				by: Record<string, number>;
			};
			expect(byStatus.total).toBeGreaterThanOrEqual(2);
			expect(byStatus.by.confirmed).toBeGreaterThanOrEqual(2);
			const byPerson = (await get("olga", "appointments", range(FROM, TO, "&group=practitioner")))
				.json.report as {
				by: Record<string, number>;
			};
			expect(byPerson.by[w.ids.dora]).toBeGreaterThanOrEqual(1);
			expect(byPerson.by[w.ids.elena]).toBeGreaterThanOrEqual(1);
			const only = (
				await get("olga", "appointments", range(FROM, TO, `&practitioner=${w.ids.dora}`))
			).json.report as {
				total: number;
			};
			expect(only.total).toBe(byPerson.by[w.ids.dora]);
		});

		it("narrows to the statuses asked, and refuses one that is not a status", async () => {
			const none = (await get("olga", "appointments", range(FROM, TO, "&statuses=cancelled"))).json
				.report as { total: number };
			expect(none.total).toBe(0);
			await refused(
				() => get("olga", "appointments", range(FROM, TO, "&statuses=nonsense")),
				400,
				"invalid",
			);
		});

		it("rates: bookings and attendance, and per client, worst first, with a floor of bookings", async () => {
			const r = await get("olga", "rates", range(FROM, TO, "&byClient=true"));
			const body = r.json as {
				report: { bookings: number };
				clients?: { client: string; bookings: number }[];
			};
			expect(body.report.bookings).toBeGreaterThanOrEqual(2);
			expect(body.clients?.map((c) => c.client)).toEqual(
				expect.arrayContaining([w.ids.c1, w.ids.c2]),
			);
			const floored = (await get("olga", "rates", range(FROM, TO, "&byClient=true&minBookings=99")))
				.json as { clients?: unknown[] };
			expect(floored.clients).toEqual([]);
			expect(((await get("olga", "rates")).json as { clients?: unknown }).clients).toBeUndefined();
		});

		it("packages: what was sold and what is left, in sessions, never in money", async () => {
			const r = (await get("olga", "packages")).json.report as {
				sold: {
					packages: number;
					baseSessions: number;
					bonusSessions: number;
					byType: Record<string, number>;
				};
			};
			expect(r.sold).toMatchObject({
				packages: 1,
				baseSessions: 10,
				bonusSessions: 1,
				byType: { "10 sessions": 1 },
			});
			expect(JSON.stringify(r)).not.toMatch(/price|minor|cents/i);
		});

		it("revenue: the money taken, in whole bani", async () => {
			const r = (await get("olga", "revenue")).json.report as {
				sources: { ledger: { paidMinor: number } };
				total: { paidMinor: number; netMinor: number };
			};
			expect(r.sources.ledger.paidMinor).toBe(50_000);
			expect(r.total.paidMinor).toBeGreaterThanOrEqual(50_000);
			expect(Number.isInteger(r.total.netMinor)).toBe(true);
		});

		it("the blacklist report counts a refusal the callback form made", async () => {
			await w.call("olga", "POST", `${A}/blacklist`, {
				phone: "0700 888 777",
				reason: "synthetic",
				category: "other",
				severity: "block_online",
			});
			const callback = await w.callKey("psizone-web", "POST", `${A}/book/callback-requests`, {
				contact: { name: "Someone", phone: "0700 888 777" },
				locale: "ro",
				when: "any",
				page: "/",
				channel: "form",
			});
			expect(callback.status).toBe(409);
			const r = (await get("olga", "blacklistHits")).json.report as {
				total: number;
				refused: number;
				byChannel: Record<string, number>;
			};
			expect(r.refused).toBeGreaterThanOrEqual(1);
			expect(r.byChannel.callback).toBeGreaterThanOrEqual(1);
		});

		it("an empty window is a report of zeros, not a refusal", async () => {
			const empty = (await get("olga", "appointments", range(NOW + 300 * DAY, NOW + 301 * DAY)))
				.json.report as { total: number };
			expect(empty.total).toBe(0);
			const rates = (await get("olga", "rates", range(NOW + 300 * DAY, NOW + 301 * DAY))).json
				.report as {
				cancellationRate: number | null;
			};
			expect(rates.cancellationRate).toBeNull();
		});
	});

	describe("the range", () => {
		const day = (n: number): number => Date.UTC(2027, 0, 1) + n * DAY;
		it(`accepts ${MAX_REPORT_DAYS} local dates (a year and a day), and refuses one more`, async () => {
			// 365 days after midnight UTC end on the 366th local date of the window, in a zone ahead of UTC.
			const ok = await get("olga", "appointments", range(day(0), day(MAX_REPORT_DAYS - 1)));
			expect(ok.status, JSON.stringify(ok.json)).toBe(200);
			const long = await refused(
				() => get("olga", "appointments", range(day(0), day(MAX_REPORT_DAYS))),
				400,
				"invalid",
			);
			expect(err(long).detail).toMatchObject({ reason: "range_too_long" });
		});

		it("refuses an empty or backward window, naming why, on every report", async () => {
			for (const name of REPORT_NAMES) {
				const r = await refused(() => get("olga", name, range(day(5), day(5))), 400, "invalid");
				expect(err(r).detail).toMatchObject({ reason: "invalid_range" });
				await refused(() => get("olga", name, range(day(9), day(1))), 400, "invalid");
			}
		});

		it.each([
			["no window", ""],
			["a window that is not numbers", "?from=a&to=b"],
			["a negative start", "?from=-1&to=5"],
			["a granularity that is not one", `?from=${FROM}&to=${TO}&granularity=hour`],
			["a group that is not one", `?from=${FROM}&to=${TO}&group=name`],
		])("refuses %s", async (_what, query) => {
			await refused(() => get("olga", "appointments", query), 400, "invalid");
		});

		it("buckets by day, week and month in the app's zone", async () => {
			const buckets = async (g: string) =>
				(
					(
						await get(
							"olga",
							"appointments",
							range(NOW - 3 * DAY, NOW + 10 * DAY, `&granularity=${g}`),
						)
					).json.report as { buckets: { bucket: string }[] }
				).buckets.map((b) => b.bucket);
			const days = await buckets("day");
			expect(days).toHaveLength(14);
			expect(days[0]).toBe("2026-11-10");
			expect((await buckets("week")).every((b) => /^\d{4}-\d{2}-\d{2}$/.test(b))).toBe(true);
			expect(await buckets("month")).toEqual(["2026-11"]);
		});
	});

	describe("who may read what", () => {
		it("the counts are the core group's: a member with that key alone reads them all but revenue", async () => {
			for (const name of REPORT_NAMES.filter((n) => n !== "revenue"))
				expect((await get("counter", name)).status, name).toBe(200);
			await refused(() => get("counter", "revenue"), 403, "forbidden");
		});

		it("revenue is the money group's: the key for it, and it alone, lets it through", async () => {
			expect((await get("banker", "revenue")).status).toBe(200);
			expect((await get("ana", "revenue")).status).toBe(200);
			await refused(() => get("rita", "revenue"), 403, "forbidden");
		});

		it("a role with no report key reads none, whoever they are; nobody signed in reads none", async () => {
			for (const name of REPORT_NAMES) {
				await refused(() => get("vera", name), 403, "forbidden");
				await refused(() => get(null, name), 401, "unauthenticated");
			}
		});

		it("another app's owner is told the app is not there", async () => {
			await refused(() => w.call("hugo", "GET", `${A}/reports/rates${range()}`), 404, "not_found");
		});

		it("a service key is not a person: the team's reports are refused to it", async () => {
			const r = await w.callKey("psizone-web", "GET", `${A}/reports/rates${range()}`);
			expect(r.status).toBe(403);
		});
	});

	describe("as a CSV file, in JSON", () => {
		const csv = (who: string | null, name: string, query = range()) =>
			as(who, "GET", `/reports/${name}/csv${query}`);

		it("is { filename, csv }: field,value rows with CRLF line ends, named for the report and its days", async () => {
			const r = await csv("olga", "rates", range(NOW - DAY, NOW + 2 * DAY));
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			const body = r.json as { filename: string; csv: string };
			expect(body.filename).toBe("report-rates-2026-11-12_2026-11-15.csv");
			const lines = body.csv.split("\r\n");
			expect(lines[0]).toBe("field,value");
			expect(lines.at(-1)).toBe("");
			expect(lines).toContain("bookings,2");
		});

		it("needs the report's own export permission: core for the counts, money for revenue", async () => {
			expect((await csv("exporter", "appointments")).status).toBe(200);
			await refused(() => csv("exporter", "revenue"), 404, "not_found");
			await refused(() => csv("counter", "appointments"), 403, "forbidden");
			await refused(() => csv("vera", "rates"), 403, "forbidden");
			expect((await csv("ana", "revenue")).status).toBe(200);
		});

		it("every report has a file", async () => {
			for (const name of REPORT_NAMES) {
				const r = await csv("olga", name);
				expect(r.status, name).toBe(200);
				expect((r.json as { csv: string }).csv.startsWith("field,value\r\n")).toBe(true);
			}
		});

		it("refuses a report that is not one, and a window past the cap, and writes nothing", async () => {
			await refused(() => csv("olga", "everything"), 400, "invalid");
			await refused(() => csv("olga", "rates", range(FROM, FROM + 400 * DAY)), 400, "invalid");
		});

		it("the export is audited with who asked for what", async () => {
			await csv("olga", "clients");
			const trail = (await as("olga", "GET", "/audit?action=report.export")).json.items as {
				actor: { subject: string };
				action: string;
			}[];
			expect(trail.some((e) => e.actor.subject === "olga")).toBe(true);
		});
	});
});
