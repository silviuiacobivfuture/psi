import { FileInitResult, FileMeta, FileRename, ROUTES } from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod/v4";
import { ok, type Populated } from "./testing/populate";
import type { Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const A = "/v1/apps/psizone";
const factories = await worldFactories();
const err = (r: Reply): { code: string } => r.json.error as { code: string };

describe.each(factories)("renaming a client file, on the $name store", (factory) => {
	let w: Populated;
	const as = (who: string | null, method: string, path: string, body?: unknown) =>
		w.call(who, method, `${A}${path}`, body);

	async function refused(run: () => Promise<Reply>, status: number, code?: string): Promise<void> {
		const before = await w.fingerprint();
		const reply = await run();
		expect(reply.status, JSON.stringify(reply.json)).toBe(status);
		if (code !== undefined) expect(err(reply).code).toBe(code);
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
	}
	/** A ready file of client 1, uploaded by Olga. */
	async function ready(name = "scan.pdf"): Promise<z.output<typeof FileMeta>> {
		const made = FileInitResult.parse(
			ok(
				await as("olga", "POST", `/clients/${w.ids.c1}/files`, {
					name,
					contentType: "application/pdf",
					size: 40,
				}),
				"announce",
			),
		);
		await w.objects.upload(made.upload.url, 40, "application/pdf");
		return FileMeta.parse(ok(await as("olga", "POST", `/files/${made.file.id}/complete`), "done"));
	}
	const rename = (who: string | null, id: string, body: unknown) =>
		as(who, "PATCH", `/files/${id}`, body);
	const listed = async (): Promise<z.output<typeof FileMeta>[]> =>
		((await as("olga", "GET", `/clients/${w.ids.c1}/files`)).json.items as unknown[]).map((f) =>
			FileMeta.parse(f),
		);
	const trail = async (id: string) =>
		(
			(await as("olga", "GET", "/audit?action=file.rename")).json.items as {
				target: { id: string };
				actor: { subject: string };
				detail?: Record<string, unknown>;
			}[]
		).filter((e) => e.target.id === id);

	beforeAll(async () => {
		w = await factory.create();
	});
	afterAll(async () => {
		await factory.cleanup();
	});

	it("is a route of the contract, PATCH on the file, guarded by the upload permission and audited", () => {
		const spec = ROUTES.find((r) => r.id === "files.rename");
		expect(spec).toMatchObject({
			method: "PATCH",
			path: "/v1/apps/:app/files/:id",
			audit: "file.rename",
			permission: { key: "files_upload", target: { kind: "object", type: "sched_file" } },
		});
	});

	it("changes only the name: the type, size, status, owner and bytes stay, the list shows the new name", async () => {
		const file = await ready();
		const reply = await rename("olga", file.id, { name: "  Raport evaluare — mai.pdf  " });
		expect(reply.status, JSON.stringify(reply.json)).toBe(200);
		const out = FileMeta.parse(reply.json);
		expect(out).toMatchObject({
			id: file.id,
			name: "Raport evaluare — mai.pdf",
			contentType: file.contentType,
			size: file.size,
			status: "ready",
			uploadedBy: "olga",
			clientId: w.ids.c1,
		});
		expect((await listed()).find((f) => f.id === file.id)?.name).toBe("Raport evaluare — mai.pdf");
		expect((await as("olga", "GET", `/files/${file.id}/download`)).status).toBe(200);
	});

	it("is journalled once, by its actor, with the field that changed and never the names", async () => {
		const file = await ready("Ionescu Maria.pdf");
		ok(await rename("olga", file.id, { name: "Evaluare.pdf" }), "rename");
		const events = await trail(file.id);
		expect(events).toHaveLength(1);
		expect(events[0]?.actor.subject).toBe("olga");
		const text = JSON.stringify(events[0]);
		expect(text).not.toContain("Ionescu");
		expect(text).not.toContain("Evaluare.pdf");
	});

	it("the same name again (after trimming) changes nothing and records nothing", async () => {
		const file = await ready("same.pdf");
		const before = await w.fingerprint();
		const reply = await rename("olga", file.id, { name: " same.pdf " });
		expect(reply.status).toBe(200);
		expect(FileMeta.parse(reply.json).name).toBe("same.pdf");
		expect(await w.fingerprint()).toBe(before);
		expect(await trail(file.id)).toEqual([]);
	});

	it("renames twice in a row: the last name stands and each change is its own event", async () => {
		const file = await ready("a.pdf");
		ok(await rename("olga", file.id, { name: "b.pdf" }), "first");
		ok(await rename("olga", file.id, { name: "c.pdf" }), "second");
		expect((await listed()).find((f) => f.id === file.id)?.name).toBe("c.pdf");
		expect(await trail(file.id)).toHaveLength(2);
	});

	it("takes the longest name (200) and a pending file too", async () => {
		const file = await ready();
		ok(await rename("olga", file.id, { name: "n".repeat(200) }), "longest");
		const pending = FileInitResult.parse(
			ok(
				await as("olga", "POST", `/clients/${w.ids.c1}/files`, {
					name: "p.pdf",
					contentType: "application/pdf",
					size: 9,
				}),
				"announce",
			),
		);
		const out = FileMeta.parse(ok(await rename("olga", pending.file.id, { name: "q.pdf" }), "p"));
		expect(out).toMatchObject({ name: "q.pdf", status: "pending" });
	});

	it.each([
		["a blank name", { name: "   " }],
		["an empty name", { name: "" }],
		["no name", {}],
		["a name of 201 characters", { name: "x".repeat(201) }],
		["a name that is not text", { name: 7 }],
		["a null name", { name: null }],
	])("refuses %s, writing nothing", async (_label, body) => {
		const file = await ready();
		await refused(() => rename("olga", file.id, body), 400, "invalid");
		expect((await listed()).find((f) => f.id === file.id)?.name).toBe("scan.pdf");
	});

	it("refuses a file that is not there, a caller who may not upload it and no sign-in, writing nothing", async () => {
		const file = await ready();
		await refused(() => rename("olga", "f-nope-0001", { name: "x.pdf" }), 404, "not_found");
		// Reception holds no file permission; a therapist reaches only their own clients' files.
		await refused(() => rename("rita", file.id, { name: "x.pdf" }), 404, "not_found");
		await refused(() => rename(null, file.id, { name: "x.pdf" }), 401);
		expect((await listed()).find((f) => f.id === file.id)?.name).toBe("scan.pdf");
	});

	it("the contract trims, and bounds the name at 1..200", () => {
		expect(FileRename.parse({ name: "  a  " }).name).toBe("a");
		expect(FileRename.safeParse({ name: "x".repeat(200) }).success).toBe(true);
		for (const name of ["", " ", "x".repeat(201)])
			expect(FileRename.safeParse({ name }).success).toBe(false);
	});
});
