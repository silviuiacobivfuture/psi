import { describe, expect, it } from "vitest";
import { createFakePort } from "./fake";
import { PortError } from "./port";
import { NOTE_MAX } from "./schema-clinical";

const ME = { subject: "s1", name: "Ana Test" };
const make = () => createFakePort({ today: "2026-11-16", members: {} });
const refused = async (p: Promise<unknown>): Promise<string> => {
	try {
		await p;
	} catch (e) {
		return e instanceof PortError ? e.code : "other";
	}
	return "none";
};

describe("notes", () => {
	it("add, edit stamps editedAt only when the text changed, pin does not, delete removes", async () => {
		const port = make();
		const n = await port.addNote("psizone", "c3", { body: "  Salut  " }, ME);
		expect(n).toMatchObject({ body: "Salut", category: "general", pinned: false, editedAt: null });
		const pinned = await port.updateNote("psizone", n.id, { pinned: true });
		expect(pinned.editedAt).toBeNull();
		const edited = await port.updateNote("psizone", n.id, { body: "Altceva" });
		expect(edited.editedAt).not.toBeNull();
		await port.deleteNote("psizone", n.id);
		expect((await port.notes("psizone", "c3")).some((x) => x.id === n.id)).toBe(false);
	});
	it("refuses empty, too long and unknown-client notes and writes nothing", async () => {
		const port = make();
		const before = (await port.notes("psizone", "c3")).length;
		expect(await refused(port.addNote("psizone", "c3", { body: "   " }, ME))).toBe("invalid");
		expect(
			await refused(port.addNote("psizone", "c3", { body: "x".repeat(NOTE_MAX + 1) }, ME)),
		).toBe("invalid");
		expect(await refused(port.addNote("psizone", "zz", { body: "a" }, ME))).toBe("not-found");
		expect((await port.notes("psizone", "c3")).length).toBe(before);
		expect(await refused(port.updateNote("psizone", "nope", { body: "a" }))).toBe("not-found");
	});
	it("lists newest first and the pinned one reaches the flags", async () => {
		const port = make();
		const rows = await port.notes("psizone", "c1");
		expect(rows.map((r) => r.createdAt)).toEqual(
			[...rows.map((r) => r.createdAt)].sort().reverse(),
		);
		const flags = await port.clientFlags("psizone", ["c1", "c3"]);
		expect(flags.c1?.pinned?.category).toBe("administrative");
		expect(flags.c3).toBeUndefined();
	});
});

describe("blacklist", () => {
	it("adds with a reason, refuses a second active entry, ends with a reason and keeps the history", async () => {
		const port = make();
		const e = await port.addBlacklist(
			"psizone",
			"c6",
			{ reason: "Nu plătește", category: "unpaid", severity: "warn" },
			ME,
		);
		expect((await port.clientFlags("psizone", ["c6"])).c6?.blacklist?.id).toBe(e.id);
		expect(
			await refused(
				port.addBlacklist(
					"psizone",
					"c6",
					{ reason: "x", category: "other", severity: "warn" },
					ME,
				),
			),
		).toBe("conflict");
		expect(await refused(port.endBlacklist("psizone", e.id, "  ", ME))).toBe("invalid");
		const ended = await port.endBlacklist("psizone", e.id, "Plătit", ME);
		expect(ended).toMatchObject({ endedBy: "Ana Test", endReason: "Plătit" });
		expect((await port.clientFlags("psizone", ["c6"])).c6).toBeUndefined();
		expect((await port.blacklistHistory("psizone", "c6")).length).toBe(1);
	});
	it("a reason is required and an expired entry no longer bites", async () => {
		const port = make();
		expect(
			await refused(
				port.addBlacklist(
					"psizone",
					"c7",
					{ reason: " ", category: "other", severity: "warn" },
					ME,
				),
			),
		).toBe("invalid");
		await port.addBlacklist(
			"psizone",
			"c7",
			{ reason: "r", category: "other", severity: "block_all", expiresOn: "2026-11-15" },
			ME,
		);
		expect((await port.clientFlags("psizone", ["c7"])).c7).toBeUndefined();
	});
});

describe("records", () => {
	it("keeps a draft with missing values, and refuses to finalise an invalid one", async () => {
		const port = make();
		const draft = await port.createRecord(
			"psizone",
			"c3",
			{ formKey: "aba-session-report", data: { recommendations: "ok" } },
			ME,
		);
		expect(draft.status).toBe("draft");
		expect(
			await refused(
				port.createRecord(
					"psizone",
					"c3",
					{ formKey: "aba-session-report", status: "final", data: { nope: 1 } },
					ME,
				),
			),
		).toBe("invalid");
		expect(
			await refused(port.createRecord("psizone", "c3", { formKey: "nope", data: {} }, ME)),
		).toBe("invalid");
		const fin = await port.updateRecord("psizone", draft.id, { status: "final" });
		expect(fin.status).toBe("final");
		await port.deleteRecord("psizone", draft.id);
		expect(await port.record("psizone", draft.id)).toBeNull();
	});
	it("accepts the table type's rows", async () => {
		const port = make();
		const r = await port.createRecord(
			"psizone",
			"c3",
			{
				formKey: "race-me-up-report",
				data: { posts: [{ key: "Post 1", success: "80%" }] },
			},
			ME,
		);
		expect(Array.isArray(r.data.posts)).toBe(true);
	});
});

describe("files", () => {
	const bytes = new TextEncoder().encode("hello");
	it("uploads, downloads the same bytes, renames, deletes", async () => {
		const port = make();
		const f = await port.uploadFile(
			"psizone",
			"c3",
			{ name: "a.txt", contentType: "text/plain", bytes },
			ME,
		);
		expect((await port.downloadFile("psizone", f.id)).bytes).toEqual(bytes);
		expect((await port.renameFile("psizone", f.id, "b.txt")).name).toBe("b.txt");
		await port.deleteFile("psizone", f.id);
		expect(await refused(port.downloadFile("psizone", f.id))).toBe("not-found");
	});
	it("refuses empty, oversize, foreign type, path names and writes nothing", async () => {
		const port = make();
		const before = (await port.files("psizone", "c3")).length;
		const up = (name: string, contentType: string, b: Uint8Array) =>
			refused(port.uploadFile("psizone", "c3", { name, contentType, bytes: b }, ME));
		expect(await up("a.txt", "text/plain", new Uint8Array())).toBe("invalid");
		expect(await up("a.exe", "application/x-msdownload", bytes)).toBe("invalid");
		expect(await up("../a.txt", "text/plain", bytes)).toBe("invalid");
		expect(await up("  ", "text/plain", bytes)).toBe("invalid");
		expect((await port.files("psizone", "c3")).length).toBe(before);
	});
});

describe("client edit and summaries", () => {
	it("changes only what is present", async () => {
		const port = make();
		const before = await port.client("psizone", "c3");
		const next = await port.updateClient("psizone", "c3", { phone: "0700 111 222" });
		expect(next).toEqual({ ...before, phone: "0700 111 222" });
	});
	it("answers the list's rich rows in one read", async () => {
		const port = make();
		const rows = await port.clientSummaries("psizone", "current", "");
		const list = await port.clients("psizone", "current", "");
		expect(rows.map((r) => r.clientId)).toEqual(list.map((c) => c.id));
		expect(rows.find((r) => r.clientId === "c4")?.blacklist?.severity).toBe("block_online");
	});
});

describe("table rows the form does not allow", () => {
	it("refuses a cell the columns do not name when finalising", async () => {
		const port = make();
		expect(
			await refused(
				port.createRecord(
					"psizone",
					"c3",
					{ formKey: "race-me-up-report", status: "final", data: { posts: [{ name: "x" }] } },
					ME,
				),
			),
		).toBe("invalid");
	});
});
