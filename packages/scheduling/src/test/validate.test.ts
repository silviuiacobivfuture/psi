import { describe, expect, it } from "vitest";
import type { BlacklistEntry } from "../clinic/blacklist";
import {
	type FINDING_CODES,
	type Snapshot,
	type SnapshotVisit,
	validateSnapshot,
} from "../clinic/validate";
import { wallToInstant } from "../clinic/visits";

const ZONE = "Europe/Bucharest";
const at = (date: string, clock: string): number => {
	const r = wallToInstant(date, clock, ZONE);
	if (!r.ok) throw new Error(`${date} ${clock}: ${r.problem}`);
	return r.instant;
};
const MIN = 60_000;
const NOW = at("2026-11-13", "09:00");

const empty = (over: Partial<Snapshot> = {}): Snapshot => ({
	zone: ZONE,
	now: NOW,
	clients: [],
	visits: [],
	packages: [],
	roster: [],
	blocks: [],
	blacklist: [],
	...over,
});
const client = (id: string, over: Record<string, unknown> = {}) => ({
	id,
	label: `clients:${id}`,
	phone: "0700 000 001",
	...over,
});
const visit = (
	id: string,
	date: string,
	from: string,
	to: string,
	over: Partial<SnapshotVisit> = {},
): SnapshotVisit => ({
	id,
	label: `appointments:${id}`,
	column: { kind: "practitioner", id: "p1" },
	start: at(date, from),
	end: at(date, to),
	status: "confirmed",
	attendance: "pending",
	...over,
});
const works = (date: string, startMinutes: number, endMinutes: number, id = "p1") => ({
	person: { kind: "practitioner" as const, id },
	date,
	entry: { status: "works" as const, startMinutes, endMinutes },
});
const find = (s: Snapshot, code: (typeof FINDING_CODES)[number]) =>
	validateSnapshot(s).findings.find((f) => f.code === code);

describe("validateSnapshot: nothing, and one of everything", () => {
	it("is empty for an empty snapshot", () => {
		expect(validateSnapshot(empty())).toEqual({ findings: [], visitsWithoutRoster: 0 });
	});

	it("is empty for a sound one: a client with a contact, a visit inside the roster, a package within its sessions", () => {
		const s = empty({
			clients: [client("1", { email: "a@x.ro" })],
			roster: [works("2026-11-16", 480, 960)],
			visits: [visit("v1", "2026-11-16", "09:00", "10:00", { client: "1", package: "pk" })],
			packages: [{ id: "pk", label: "client_subscriptions:1", totalSessions: 5, bonusSessions: 0 }],
		});
		expect(validateSnapshot(s).findings).toEqual([]);
	});

	it("is the same report twice, and never changes the snapshot", () => {
		const s = empty({
			clients: [client("1", { phone: "x" }), client("2", { phone: undefined })],
			roster: [works("2026-11-16", 480, 960)],
			visits: [visit("v1", "2026-11-16", "07:00", "08:00")],
		});
		const frozen = structuredClone(s);
		expect(validateSnapshot(s)).toEqual(validateSnapshot(s));
		expect(s).toEqual(frozen);
	});

	it("lists findings in the order of the codes, each with its count and labels", () => {
		const s = empty({
			clients: [client("2", { phone: "bad" }), client("1", { phone: "also bad", email: "nope" })],
		});
		const out = validateSnapshot(s).findings;
		expect(out.map((f) => f.code)).toEqual([
			"client_phone_invalid",
			"client_email_invalid",
			"client_without_contact",
		]);
		expect(out[0]).toEqual({
			code: "client_phone_invalid",
			count: 2,
			labels: ["clients:1", "clients:2"],
		});
	});
});

describe("contacts", () => {
	it.each([
		["a phone with letters", { phone: "0700 abc" }, "client_phone_invalid"],
		["a short phone", { phone: "12345" }, "client_phone_invalid"],
		["a Romanian number one digit short", { phone: "0700 00 001" }, "client_phone_invalid"],
		["an e-mail without a domain", { email: "ana@" }, "client_email_invalid"],
		["an e-mail with a space", { email: "a b@x.ro" }, "client_email_invalid"],
		["a bad guardian phone", { guardian: { phone: "1" } }, "guardian_phone_invalid"],
		["a bad guardian e-mail", { guardian: { email: "no" } }, "guardian_email_invalid"],
	] as const)("%s is reported on its own code", (_label, over, code) => {
		expect(find(empty({ clients: [client("1", over)] }), code)?.labels).toEqual(["clients:1"]);
	});

	it.each([
		["spelled differently", "0700 000 001"],
		["with the country code", "+40 700 000 001"],
		["with dashes", "0700-000-001"],
		["international digits", "0040700000001"],
	])("a valid phone %s is not reported", (_label, phone) => {
		expect(validateSnapshot(empty({ clients: [client("1", { phone })] })).findings).toEqual([]);
	});

	it("an empty or blank value is no value: not invalid, but a missing contact when nothing else is there", () => {
		const s = empty({ clients: [client("1", { phone: "  ", email: "" })] });
		expect(find(s, "client_phone_invalid")).toBeUndefined();
		expect(find(s, "client_without_contact")?.labels).toEqual(["clients:1"]);
	});

	it("a client with no contact at all, and one with only an unusable contact, are both without a contact", () => {
		const s = empty({
			clients: [client("1", { phone: undefined }), client("2", { phone: "zzz" })],
		});
		expect(find(s, "client_without_contact")?.labels).toEqual(["clients:1", "clients:2"]);
	});

	it("a guardian's contact counts as a contact", () => {
		const s = empty({
			clients: [client("1", { phone: undefined, guardian: { phone: "0711 222 333" } })],
		});
		expect(find(s, "client_without_contact")).toBeUndefined();
	});

	it("two clients sharing a phone (any spelling) or an e-mail (any case) are duplicates, in one group", () => {
		const s = empty({
			clients: [
				client("1", { phone: "0700 000 001", email: "A@x.ro" }),
				client("2", { phone: "+40700000001", email: "a@X.ro" }),
				client("3", { phone: "0700 000 003" }),
			],
		});
		expect(find(s, "duplicate_contact")).toEqual({
			code: "duplicate_contact",
			count: 2,
			labels: ["clients:1", "clients:2"],
			groups: 1,
		});
	});

	it("separate duplicate groups are counted separately; three sharing one phone are one group", () => {
		const s = empty({
			clients: [
				client("1", { phone: "0700 000 001" }),
				client("2", { phone: "0700 000 001" }),
				client("3", { phone: "0700 000 001" }),
				client("4", { phone: "0700 000 004" }),
				client("5", { phone: "0700 000 004" }),
			],
		});
		expect(find(s, "duplicate_contact")).toMatchObject({ count: 5, groups: 2 });
	});

	it("siblings sharing a guardian's phone are not duplicates", () => {
		const g = { guardian: { phone: "0711 222 333" } };
		const s = empty({
			clients: [client("1", { phone: undefined, ...g }), client("2", { phone: undefined, ...g })],
		});
		expect(find(s, "duplicate_contact")).toBeUndefined();
	});

	it("an unusable phone is never a duplicate of another unusable phone", () => {
		const s = empty({ clients: [client("1", { phone: "x" }), client("2", { phone: "x" })] });
		expect(find(s, "duplicate_contact")).toBeUndefined();
	});

	it("keeps at most 200 labels and still counts them all", () => {
		const clients = Array.from({ length: 250 }, (_, i) => client(String(i), { phone: "bad" }));
		const f = find(empty({ clients }), "client_phone_invalid");
		expect(f?.count).toBe(250);
		expect(f?.labels).toHaveLength(200);
	});
});

describe("the roster", () => {
	const day = "2026-11-16";
	const roster = [works(day, 480, 960)];

	it("a visit exactly from the start to the end of the working hours is inside", () => {
		expect(
			find(empty({ roster, visits: [visit("a", day, "08:00", "16:00")] }), "visit_outside_hours"),
		).toBeUndefined();
	});

	it("one minute before the start, or one minute past the end, is outside", () => {
		const s = empty({
			roster,
			visits: [visit("a", day, "07:59", "08:30"), visit("b", day, "15:30", "16:01")],
		});
		expect(find(s, "visit_outside_hours")?.labels).toEqual(["appointments:a", "appointments:b"]);
	});

	it.each([
		["annual leave", { status: "annual_leave" as const }],
		["medical leave", { status: "medical_leave" as const }],
		["a free day", { status: "free" as const }],
	])("a visit on a day of %s is on a day off", (_label, entry) => {
		const s = empty({
			roster: [
				{ person: { kind: "practitioner", id: "p1" }, date: day, entry },
				works("2026-11-17", 480, 960),
			],
			visits: [visit("a", day, "09:00", "10:00")],
		});
		expect(find(s, "visit_on_day_off")?.labels).toEqual(["appointments:a"]);
		expect(find(s, "visit_outside_hours")).toBeUndefined();
	});

	it("a day with no entry, while the person has others, is a day off; inside a staff block too", () => {
		const s = empty({
			roster: [works("2026-11-17", 480, 960), works(day, 480, 960)],
			blocks: [
				{
					person: { kind: "practitioner", id: "p1" },
					dateStart: "2026-11-18",
					dateEnd: "2026-11-19",
					reason: "course",
				},
			],
			visits: [
				visit("none", "2026-11-20", "09:00", "10:00"),
				visit("block", "2026-11-18", "09:00", "10:00"),
				visit("block-last", "2026-11-19", "09:00", "10:00"),
				visit("ok", day, "09:00", "10:00"),
			],
		});
		expect(find(s, "visit_on_day_off")?.labels).toEqual([
			"appointments:block",
			"appointments:block-last",
			"appointments:none",
		]);
	});

	it("a person with no roster at all is left out of the check and counted, not flagged", () => {
		const s = empty({
			visits: [visit("a", day, "03:00", "04:00"), visit("b", day, "05:00", "06:00")],
		});
		expect(validateSnapshot(s)).toEqual({ findings: [], visitsWithoutRoster: 2 });
	});

	it("cancelled visits and non-practitioner columns are not checked", () => {
		const s = empty({
			roster,
			visits: [
				visit("c", day, "03:00", "04:00", { status: "cancelled" }),
				visit("d", day, "03:00", "04:00", { column: { kind: "device", id: "d1" } }),
				visit("g", day, "03:00", "04:00", { column: { kind: "group", id: "g1" } }),
			],
		});
		expect(validateSnapshot(s).findings).toEqual([]);
	});

	it("another person's roster does not cover this person", () => {
		const s = empty({
			roster: [works(day, 480, 960, "p2")],
			visits: [visit("a", day, "09:00", "10:00")],
		});
		expect(validateSnapshot(s)).toEqual({ findings: [], visitsWithoutRoster: 1 });
	});

	it("a visit that runs past local midnight ends at 24:00 of its day", () => {
		const night = empty({
			roster: [works(day, 0, 1_440)],
			visits: [{ ...visit("a", day, "23:30", "23:59"), end: at("2026-11-17", "00:30") }],
		});
		expect(find(night, "visit_outside_hours")).toBeUndefined();
		const short = empty({
			roster: [works(day, 0, 1_380)],
			visits: [{ ...visit("a", day, "22:30", "23:00"), end: at("2026-11-17", "00:30") }],
		});
		expect(find(short, "visit_outside_hours")?.labels).toEqual(["appointments:a"]);
	});

	describe("daylight saving (Europe/Bucharest)", () => {
		it("the day the clocks jump forward (2026-03-29) is judged in local time", () => {
			const spring = "2026-03-29";
			const s = empty({
				roster: [works(spring, 480, 960)],
				visits: [visit("in", spring, "08:00", "16:00"), visit("late", spring, "15:30", "16:30")],
			});
			expect(find(s, "visit_outside_hours")?.labels).toEqual(["appointments:late"]);
			// 08:00 local that day is 05:00 UTC (EEST, UTC+3).
			expect(s.visits[0]?.start).toBe(Date.UTC(2026, 2, 29, 5, 0));
		});

		it("the day the clocks go back (2026-10-25) is judged in local time", () => {
			const autumn = "2026-10-25";
			const s = empty({
				roster: [works(autumn, 480, 960)],
				visits: [visit("in", autumn, "08:00", "16:00"), visit("early", autumn, "07:30", "08:30")],
			});
			expect(find(s, "visit_outside_hours")?.labels).toEqual(["appointments:early"]);
			// After the clocks went back it is EET (UTC+2): 08:00 local is 06:00 UTC.
			expect(s.visits[0]?.start).toBe(Date.UTC(2026, 9, 25, 6, 0));
		});

		it("a visit across the repeated hour keeps its wall-clock end (03:30 earlier to 03:30 later)", () => {
			const autumn = "2026-10-25";
			const start = at(autumn, "03:30");
			const s = empty({
				roster: [works(autumn, 180, 300)],
				visits: [{ ...visit("a", autumn, "03:30", "04:00"), start, end: start + 60 * MIN }],
			});
			expect(validateSnapshot(s).findings).toEqual([]);
		});
	});
});

describe("overlaps and packages", () => {
	it("two confirmed visits of one practitioner that overlap are reported, both, once each", () => {
		const s = empty({
			visits: [
				visit("a", "2026-11-16", "09:00", "10:00"),
				visit("b", "2026-11-16", "09:30", "10:30"),
			],
		});
		expect(find(s, "visit_overlap")?.labels).toEqual(["appointments:a", "appointments:b"]);
	});

	it("back to back is not an overlap; a cancelled visit does not count; a shared room does", () => {
		const back = empty({
			visits: [
				visit("a", "2026-11-16", "09:00", "10:00"),
				visit("b", "2026-11-16", "10:00", "11:00"),
			],
		});
		expect(find(back, "visit_overlap")).toBeUndefined();
		const cancelled = empty({
			visits: [
				visit("a", "2026-11-16", "09:00", "10:00"),
				visit("b", "2026-11-16", "09:30", "10:30", { status: "cancelled" }),
			],
		});
		expect(find(cancelled, "visit_overlap")).toBeUndefined();
		const room = empty({
			visits: [
				visit("a", "2026-11-16", "09:00", "10:00", { room: "r1" }),
				visit("b", "2026-11-16", "09:30", "10:30", {
					column: { kind: "practitioner", id: "p2" },
					room: "r1",
				}),
			],
		});
		expect(find(room, "visit_overlap")?.count).toBe(2);
	});

	const pk = { id: "pk", label: "client_subscriptions:1", totalSessions: 2, bonusSessions: 1 };
	const used = (id: string, date: string, over: Partial<SnapshotVisit> = {}) =>
		visit(id, date, "09:00", "10:00", {
			package: "pk",
			creditType: "base",
			attendance: "attended",
			...over,
		});

	it("a package used exactly up is not negative; one more used session is", () => {
		const exact = empty({
			packages: [pk],
			visits: [
				used("1", "2026-11-02"),
				used("2", "2026-11-03"),
				used("3", "2026-11-04", { creditType: "bonus" }),
			],
		});
		expect(find(exact, "package_negative_remaining")).toBeUndefined();
		const over = empty({
			packages: [pk],
			visits: [
				used("1", "2026-11-02"),
				used("2", "2026-11-03"),
				used("3", "2026-11-04"),
				used("4", "2026-11-05", { creditType: "bonus" }),
			],
		});
		expect(find(over, "package_negative_remaining")?.labels).toEqual(["client_subscriptions:1"]);
	});

	it("an absent or cancelled visit uses nothing; a future one is scheduled, not used", () => {
		const s = empty({
			packages: [pk],
			visits: [
				used("1", "2026-11-02"),
				used("2", "2026-11-03", { attendance: "absent" }),
				used("3", "2026-11-04", { status: "cancelled" }),
				used("4", "2026-12-04", { attendance: "pending" }),
				used("5", "2026-12-05", { attendance: "pending" }),
				used("6", "2026-12-06", { attendance: "pending" }),
			],
		});
		expect(find(s, "package_negative_remaining")).toBeUndefined();
	});

	it("a package with no visits is fine", () => {
		expect(validateSnapshot(empty({ packages: [pk] })).findings).toEqual([]);
	});
});

describe("clients matching the blacklist", () => {
	const entry = (over: Partial<BlacklistEntry>): BlacklistEntry => ({
		id: "e1",
		reason: "",
		category: "other",
		severity: "block_online",
		active: true,
		createdAt: 1,
		...over,
	});

	it("matches by client, by phone in any spelling, by e-mail, and through a guardian's phone", () => {
		const s = empty({
			clients: [
				client("byclient", { phone: "0700 000 011" }),
				client("byphone", { phone: "0040 700 000 012" }),
				client("byemail", { phone: "0700 000 013", email: "Bad@X.ro" }),
				client("child", { phone: undefined, guardian: { phone: "0700 000 014" } }),
				client("clean", { phone: "0700 000 015" }),
			],
			blacklist: [
				entry({ id: "1", client: "byclient" }),
				entry({ id: "2", phone: "+40700000012" }),
				entry({ id: "3", email: "bad@x.ro" }),
				entry({ id: "4", phone: "+40700000014" }),
			],
		});
		expect(find(s, "client_blacklisted")?.labels).toEqual([
			"clients:byclient",
			"clients:byemail",
			"clients:byphone",
			"clients:child",
		]);
	});

	it("an entry that is off or expired matches nobody; a name alone matches nobody", () => {
		const s = empty({
			clients: [client("1", { phone: "0700 000 011" })],
			blacklist: [
				entry({ id: "1", phone: "+40700000011", active: false }),
				entry({ id: "2", phone: "+40700000011", expiresAt: NOW }),
				entry({ id: "3", client: "other", name: "whoever" }),
			],
		});
		expect(find(s, "client_blacklisted")).toBeUndefined();
	});

	it("an entry that expires after now still matches", () => {
		const s = empty({
			clients: [client("1", { phone: "0700 000 011" })],
			blacklist: [entry({ id: "1", phone: "+40700000011", expiresAt: NOW + 1 })],
		});
		expect(find(s, "client_blacklisted")?.count).toBe(1);
	});
});

describe("limiting the checks", () => {
	it("`only` keeps just the codes asked for", () => {
		const s = empty({
			clients: [client("1", { phone: "bad" })],
			visits: [
				visit("a", "2026-11-16", "09:00", "10:00"),
				visit("b", "2026-11-16", "09:30", "10:30"),
			],
		});
		const out = validateSnapshot(s, new Set(["visit_overlap"]));
		expect(out.findings.map((f) => f.code)).toEqual(["visit_overlap"]);
		expect(validateSnapshot(s, new Set()).findings).toEqual([]);
	});
});
