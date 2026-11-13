import { describe, expect, it } from "vitest";
import { cloneExport, MAPPING } from "./fixture";
import { formatReport, type Report } from "./report";
import { runImport } from "./run";

/**
 * The importer's data check and the `--blacklist` seed, in the dry run (no key, no store, no
 * network): what is found is reported by code, count and old id, nothing is changed, and nothing
 * personal is printed. Synthetic data.
 */
type Row = Record<string, unknown>;

const dry = (over: { exported?: ReturnType<typeof cloneExport>; blacklist?: unknown } = {}) =>
	runImport({
		mapping: MAPPING,
		ignoreTables: [],
		allowSkips: true,
		files: undefined,
		exported: over.exported ?? cloneExport(),
		connect: undefined,
		...(over.blacklist === undefined ? {} : { blacklist: over.blacklist }),
	});

const finding = (r: Report, code: string) => r.validation?.findings.find((f) => f.code === code);
const codes = (r: Report) => (r.validation?.findings ?? []).map((f) => f.code);

function withClients(change: (clients: Row[]) => void): ReturnType<typeof cloneExport> {
	const exported = cloneExport();
	const clients = exported.tables.clients;
	if (clients === undefined) throw new Error("no clients");
	change(clients as Row[]);
	return exported;
}
const byId = (clients: Row[], id: number): Row => {
	const found = clients.find((c) => c.id === id);
	if (found === undefined) throw new Error(`no client ${id}`);
	return found;
};

describe("the data check in the dry run", () => {
	it("reports the planted problems of the synthetic export by code and old id, and no others of the contact kind", async () => {
		const report = await dry();
		expect(report.mode).toBe("dry-run");
		expect(finding(report, "visit_on_day_off")).toMatchObject({
			count: 5,
			labels: [
				"appointments:110",
				"appointments:111",
				"appointments:112",
				"appointments:113",
				"appointments:132",
			],
		});
		expect(finding(report, "visit_outside_hours")?.labels).toEqual([
			"appointments:100",
			"appointments:121",
		]);
		for (const none of [
			"client_phone_invalid",
			"client_email_invalid",
			"client_without_contact",
			"duplicate_contact",
			"package_negative_remaining",
			"client_blacklisted",
		]) {
			expect(codes(report)).not.toContain(none);
		}
		expect(report.validation?.visitsWithoutRoster).toBe(2);
	});

	it("leaves overlaps to the existing detector: no second report of them", async () => {
		const report = await dry();
		expect(codes(report)).not.toContain("visit_overlap");
		expect(report.stats?.overlaps).toBe(1);
	});

	it("finds an invalid phone, an invalid e-mail, a client without contact and shared contacts", async () => {
		const report = await dry({
			exported: withClients((clients) => {
				byId(clients, 2).phone = "abc";
				Object.assign(byId(clients, 3), { phone: null, email: "nope@" });
				Object.assign(byId(clients, 4), { phone: null, email: null });
				byId(clients, 5).phone = "+40 700 000 006";
				byId(clients, 6).phone = "0700-000-006";
			}),
		});
		expect(finding(report, "client_phone_invalid")?.labels).toEqual(["clients:2"]);
		expect(finding(report, "client_email_invalid")?.labels).toEqual(["clients:3"]);
		expect(finding(report, "client_without_contact")?.labels).toEqual([
			"clients:2",
			"clients:3",
			"clients:4",
		]);
		expect(finding(report, "duplicate_contact")).toMatchObject({
			count: 2,
			groups: 1,
			labels: ["clients:5", "clients:6"],
		});
	});

	it("prints codes, counts and old ids only: no phone, e-mail or name", async () => {
		const report = await dry({
			exported: withClients((clients) => {
				Object.assign(byId(clients, 2), {
					phone: "0799 888 777",
					email: "leak.check@example.test",
				});
				byId(clients, 3).phone = "not a phone leak";
			}),
		});
		const text = formatReport(report);
		expect(text).toContain("data check");
		for (const secret of [
			"0799 888 777",
			"799888777",
			"leak.check",
			"not a phone leak",
			"Test Guardian",
		]) {
			expect(text).not.toContain(secret);
			expect(JSON.stringify(report)).not.toContain(secret);
		}
	});

	it("a client with only a guardian contact has a contact; a bad guardian phone is reported on its own code", async () => {
		const report = await dry({
			exported: withClients((clients) => {
				Object.assign(byId(clients, 4), {
					phone: null,
					email: null,
					tutor_name: "Test Guardian",
					tutor_phone: "0711 222 333",
				});
				Object.assign(byId(clients, 3), {
					phone: null,
					tutor_name: "Test Guardian",
					tutor_phone: "12",
					tutor_email: "bad",
				});
			}),
		});
		expect(finding(report, "client_without_contact")?.labels).toEqual(["clients:3"]);
		expect(finding(report, "guardian_phone_invalid")?.labels).toEqual(["clients:3"]);
		expect(finding(report, "guardian_email_invalid")?.labels).toEqual(["clients:3"]);
	});

	it("changes nothing: the same export gives the same report, and the export is not modified", async () => {
		const exported = cloneExport();
		const before = JSON.stringify(exported);
		const first = await dry({ exported });
		const second = await dry({ exported });
		expect(JSON.stringify(exported)).toBe(before);
		expect(second).toEqual(first);
	});
});

describe("the --blacklist seed in the dry run", () => {
	const entry = (over: Row = {}): Row => ({
		key: "seed-1",
		phone: "0700 000 007",
		reason: "synthetic reason",
		category: "other",
		severity: "block_online",
		...over,
	});

	it("counts the entries, and flags the clients they match (by phone and by client reference)", async () => {
		const report = await dry({
			blacklist: [
				entry(),
				entry({ key: "seed-2", phone: undefined, clientLegacy: "clients:1", severity: "warn" }),
			],
		});
		expect(report.tables.find((t) => t.table === "(file) blacklist")).toEqual({
			table: "(file) blacklist",
			source: 2,
			parsed: 2,
			planned: 2,
		});
		expect(finding(report, "client_blacklisted")?.labels).toEqual(["clients:1", "clients:7"]);
		expect(
			report.anomalies.filter((a) => a.severity === "blocking" && a.code.startsWith("blacklist")),
		).toEqual([]);
	});

	it("shows no blacklist row when no file is given", async () => {
		expect((await dry()).tables.map((t) => t.table)).not.toContain("(file) blacklist");
	});

	it("an entry whose expiry day has passed no longer flags anyone", async () => {
		const report = await dry({ blacklist: [entry({ expires: "2026-11-12" })] });
		expect(codes(report)).not.toContain("client_blacklisted");
		const alive = await dry({ blacklist: [entry({ expires: "2026-11-13" })] });
		expect(codes(alive)).toContain("client_blacklisted");
	});

	it.each([
		["a file that is not a list", { key: "x" }, "blacklist_file_invalid"],
		["an entry that is not an object", [42], "blacklist_entry_invalid"],
		["an entry without a reason", [entry({ reason: " " })], "blacklist_entry_invalid"],
		[
			"an entry with a reason over 2000",
			[entry({ reason: "x".repeat(2001) })],
			"blacklist_entry_invalid",
		],
		["a bad key", [entry({ key: "has space" })], "blacklist_entry_invalid"],
		["an unknown severity", [entry({ severity: "ban" })], "blacklist_entry_invalid"],
		["a bad phone", [entry({ phone: "12" })], "blacklist_phone_invalid"],
		["a bad e-mail", [entry({ phone: undefined, email: "nope" })], "blacklist_email_invalid"],
		["no identifier", [entry({ phone: undefined })], "blacklist_entry_without_identifier"],
		["a duplicate key", [entry(), entry({ phone: "0700 000 001" })], "blacklist_duplicate_key"],
		["an impossible expiry date", [entry({ expires: "2026-02-30" })], "blacklist_expiry_invalid"],
	])("blocks on %s", async (_label, blacklist, expected) => {
		const report = await dry({ blacklist });
		const found = report.anomalies.find((a) => a.code === expected);
		expect(found?.severity).toBe("blocking");
	});

	it("a client the export does not have is skipped, by key", async () => {
		const report = await dry({
			blacklist: [entry({ phone: undefined, clientLegacy: "clients:999" })],
		});
		expect(report.anomalies.find((a) => a.code === "blacklist_unknown_client")).toMatchObject({
			severity: "skipped",
			ids: ["blacklist:seed-1"],
		});
	});

	it("never prints the reason, the phone or the name of an entry", async () => {
		const report = await dry({
			blacklist: [entry({ name: "Zed Secretname", email: "secret.entry@example.test" })],
		});
		const text = formatReport(report) + JSON.stringify(report);
		for (const secret of [
			"synthetic reason",
			"Zed Secretname",
			"secret.entry",
			"0700 000 007",
			"700000007",
		]) {
			expect(text).not.toContain(secret);
		}
	});
});
